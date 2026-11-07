"""Explicit, cached place searches. The public provider is never used for autocomplete."""

import json
import math
import threading
import time
from collections import OrderedDict
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from fastapi import HTTPException

from app.core.config import get_settings

_CACHE_LIMIT = 256
_CACHE_SECONDS = 24 * 60 * 60
_lock = threading.Lock()
_cache = OrderedDict()
_last_request = float("-inf")


def _place(raw):
    if not isinstance(raw, dict) or not isinstance(raw.get("display_name"), str) or not raw["display_name"].strip():
        raise ValueError("Invalid provider place")
    if raw.get("address") and not isinstance(raw["address"], dict):
        raise ValueError("Invalid provider address")
    latitude, longitude = float(raw["lat"]), float(raw["lon"])
    if (
        not math.isfinite(latitude)
        or not math.isfinite(longitude)
        or not -90 <= latitude <= 90
        or not -180 <= longitude <= 180
    ):
        raise ValueError("Invalid provider coordinates")
    address = raw.get("address") or {}
    primary = raw.get("name") or raw["display_name"].split(",")[0]
    locality = next((address.get(key) for key in ("city", "town", "village", "municipality") if address.get(key)), "")
    parts = [primary, locality, address.get("state"), address.get("country")]
    if any(part and not isinstance(part, str) for part in parts):
        raise ValueError("Invalid place name")
    name = ", ".join(dict.fromkeys(part for part in parts if part))[:200]
    return {
        "id": f"{raw.get('osm_type', 'place')}:{raw.get('osm_id', raw.get('place_id'))}",
        "name": name,
        "label": raw["display_name"],
        "latitude": latitude,
        "longitude": longitude,
        "administrative_level": str(raw.get("addresstype") or raw.get("type") or "place")[:100],
        "country": address.get("country", ""),
        "region": address.get("state", ""),
    }


def search_places(query: str):
    global _last_request
    settings = get_settings()
    query = " ".join(query.split())
    key = (settings.geocoding_url, query.casefold())
    # Serialize all outbound lookups in this API process. Reject extra requests
    # instead of building an unbounded queue. Cache hits never contact the provider.
    if not _lock.acquire(blocking=False):
        raise HTTPException(
            429, "Another place search is in progress. Try again in a moment.", headers={"Retry-After": "2"}
        )
    try:
        now = time.monotonic()
        cached = _cache.get(key)
        if cached and now - cached[0] < _CACHE_SECONDS:
            _cache.move_to_end(key)
            return cached[1]
        if now - _last_request < 1.1:
            raise HTTPException(429, "Please wait a moment between place searches.", headers={"Retry-After": "2"})
        _last_request = now
        parameters = urlencode(
            {"q": query, "format": "jsonv2", "addressdetails": 1, "limit": 6, "accept-language": "en"}
        )
        request = Request(
            f"{settings.geocoding_url.rstrip('/')}?{parameters}",
            headers={"User-Agent": settings.geocoding_user_agent, "Accept": "application/json"},
        )
        try:
            with urlopen(request, timeout=10) as response:
                payload = response.read(512 * 1024 + 1)
            if len(payload) > 512 * 1024:
                raise ValueError("Provider response too large")
            raw = json.loads(payload)
            if not isinstance(raw, list):
                raise ValueError("Invalid provider response")
            results = []
            for item in raw[:6]:
                try:
                    result = _place(item)
                    if result["id"] not in {place["id"] for place in results}:
                        results.append(result)
                except (KeyError, ValueError, TypeError):
                    continue
            if raw and not results:
                raise ValueError("Provider returned invalid places")
        except HTTPError as exc:
            message = (
                "Place search is temporarily busy. Please try again shortly."
                if exc.code in (403, 429)
                else "Place search is temporarily unavailable. Please try again."
            )
            raise HTTPException(503, message) from None
        except (URLError, TimeoutError, OSError, ValueError):
            raise HTTPException(503, "Could not reach place search. Check your connection and try again.") from None
        _cache[key] = (time.monotonic(), results)
        _cache.move_to_end(key)
        while len(_cache) > _CACHE_LIMIT:
            _cache.popitem(last=False)
        return results
    finally:
        _lock.release()
