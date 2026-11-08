import json
import logging
import time
import uuid

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.core.config import get_settings
from app.routes import alerts, auth, data, feeds, health, imports, outbreaks, publications, review

settings = get_settings()
app = FastAPI(title=settings.app_name, version="0.2.0")
request_log = logging.getLogger("healthmap.requests")


@app.middleware("http")
async def request_context(request, call_next):
    request_id = str(uuid.uuid4())
    started = time.monotonic()
    try:
        response = await call_next(request)
    except Exception as exc:
        request_log.error(
            json.dumps(
                {
                    "request_id": request_id,
                    "method": request.method,
                    "path": request.url.path,
                    "status": 500,
                    "error_type": type(exc).__name__,
                }
            )
        )
        if settings.environment != "production":
            raise
        response = JSONResponse(
            status_code=500, content={"detail": "Service error. Contact the operator with the request ID."}
        )
    response.headers["X-Request-ID"] = request_id
    response.headers["Cache-Control"] = "no-store"
    response.headers["X-Content-Type-Options"] = "nosniff"
    request_log.info(
        json.dumps(
            {
                "request_id": request_id,
                "method": request.method,
                "path": request.url.path,
                "status": response.status_code,
                "duration_ms": round((time.monotonic() - started) * 1000),
            }
        )
    )
    return response


app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(health.router)
app.include_router(auth.router)
app.include_router(data.router)
app.include_router(imports.router)
app.include_router(alerts.router)
app.include_router(outbreaks.router)
app.include_router(feeds.router)
app.include_router(publications.router)
app.include_router(publications.public)
app.include_router(review.router)


@app.get("/")
def root():
    return {"message": "HealthMap360 API", "docs": "/docs"}
