import json
from unittest.mock import MagicMock
from urllib.error import HTTPError, URLError

import pytest

from app.services import geocoding

PLACE = {
    "place_id": 123,
    "osm_type": "relation",
    "osm_id": 456,
    "name": "Lethbridge",
    "display_name": "Lethbridge, Alberta, Canada",
    "lat": "49.6946",
    "lon": "-112.8328",
    "addresstype": "city",
    "address": {"city": "Lethbridge", "state": "Alberta", "country": "Canada"},
}


@pytest.fixture(autouse=True)
def reset_geocoder(monkeypatch):
    geocoding._cache.clear()
    monkeypatch.setattr(geocoding, "_last_request", float("-inf"))
    yield
    geocoding._cache.clear()


def provider(monkeypatch, data):
    response = MagicMock()
    response.__enter__.return_value.read.return_value = json.dumps(data).encode()
    fetch = MagicMock(return_value=response)
    monkeypatch.setattr(geocoding, "urlopen", fetch)
    return fetch


def test_place_search_returns_context_and_verified_coordinates(client, auth, monkeypatch):
    fetch = provider(monkeypatch, [PLACE])
    response = client.get("/locations/search?q=Lethbridge%2C%20Canada", headers=auth["analyst"])
    assert response.status_code == 200
    place = response.json()["results"][0]
    assert place["name"] == "Lethbridge, Alberta, Canada"
    assert place["latitude"] == 49.6946
    assert place["longitude"] == -112.8328
    assert place["country"] == "Canada"
    assert "OpenStreetMap" in response.json()["attribution"]
    request = fetch.call_args.args[0]
    assert "HealthMap360" in request.get_header("User-agent")
    assert "Lethbridge%2C+Canada" in request.full_url
    created = client.post("/locations", headers=auth["analyst"], json=place)
    assert created.status_code == 201
    assert created.json()["latitude"] == 49.6946


def test_search_requires_analyst_and_a_meaningful_query(client, auth, monkeypatch):
    fetch = provider(monkeypatch, [])
    assert client.get("/locations/search?q=Edmonton").status_code == 401
    assert client.get("/locations/search?q=Edmonton", headers=auth["reader"]).status_code == 403
    assert client.get("/locations/search?q=ab", headers=auth["analyst"]).status_code == 422
    assert client.get("/locations/search?q=%20%20%20", headers=auth["analyst"]).status_code == 422
    fetch.assert_not_called()


def test_repeat_searches_are_cached_and_new_searches_are_throttled(client, auth, monkeypatch):
    fetch = provider(monkeypatch, [PLACE])
    assert client.get("/locations/search?q=Lethbridge", headers=auth["analyst"]).status_code == 200
    assert client.get("/locations/search?q=%20LETHBRIDGE%20", headers=auth["analyst"]).status_code == 200
    assert fetch.call_count == 1
    response = client.get("/locations/search?q=Calgary", headers=auth["analyst"])
    assert response.status_code == 429
    assert response.headers["Retry-After"] == "2"
    assert fetch.call_count == 1


def test_empty_results_are_successful_and_cached(client, auth, monkeypatch):
    fetch = provider(monkeypatch, [])
    assert client.get("/locations/search?q=NoSuchCity", headers=auth["analyst"]).json()["results"] == []
    assert client.get("/locations/search?q=NoSuchCity", headers=auth["analyst"]).status_code == 200
    assert fetch.call_count == 1


@pytest.mark.parametrize(
    "failure", [URLError("offline"), TimeoutError(), HTTPError("https://example.com", 429, "busy", {}, None)]
)
def test_provider_failures_are_actionable(client, auth, monkeypatch, failure):
    monkeypatch.setattr(geocoding, "urlopen", MagicMock(side_effect=failure))
    response = client.get("/locations/search?q=Edmonton", headers=auth["analyst"])
    assert response.status_code == 503
    assert "try again" in response.json()["detail"].lower()


def test_invalid_coordinates_are_never_returned_as_a_place(client, auth, monkeypatch):
    provider(monkeypatch, [{**PLACE, "lat": "nan"}, PLACE])
    result = client.get("/locations/search?q=Edmonton", headers=auth["analyst"])
    assert result.status_code == 200
    assert len(result.json()["results"]) == 1
    assert result.json()["results"][0]["latitude"] == 49.6946
