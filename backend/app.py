"""
app.py
-------
FastAPI application entrypoint.

Run with:
    uvicorn backend.app:app --reload

(run from the project root, i.e. the folder that CONTAINS `backend/`)

This also serves the frontend (../frontend/) as static files on the SAME
port as the API — so you only ever need to run ONE server, not two. Open
http://127.0.0.1:8000/ once this is running. (If you'd rather run the
frontend on its own separate dev server instead, that still works too —
this static mount doesn't require it, it's just no longer mandatory.)
"""
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from backend.config import get_settings
from backend.routes import prediction, weather
from backend.utils.http_client import close_http_client, get_http_client
from backend.utils.logger import get_logger

logger = get_logger(__name__)
settings = get_settings()

FRONTEND_DIR = Path(__file__).resolve().parent.parent / "frontend"


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: warm up the shared HTTP client.
    await get_http_client()
    logger.info("%s v%s starting up", settings.APP_NAME, settings.APP_VERSION)
    logger.info(
        "Weather data: Open-Meteo (no API key required). "
        "Reverse geocoding: OpenStreetMap Nominatim (no API key required)."
    )
    if FRONTEND_DIR.is_dir():
        logger.info("Serving frontend from %s at /", FRONTEND_DIR)
    else:
        logger.warning(
            "frontend/ folder not found at %s — only the API will be served. "
            "Run the frontend separately if needed.", FRONTEND_DIR,
        )
    yield
    # Shutdown: close the shared HTTP client cleanly.
    await close_http_client()
    logger.info("Shutting down")


app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description=(
        "Backend API for CanPredict AI Weather. Wraps Open-Meteo (weather, "
        "geocoding, air quality) and OpenStreetMap Nominatim (reverse "
        "geocoding) — both free, open, and requiring no API key — so the "
        "frontend never talks to a third-party provider directly."
    ),
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET"],
    allow_headers=["*"],
)


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    logger.warning("HTTPException on %s: %s", request.url.path, exc.detail)
    return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    logger.exception("Unhandled error on %s", request.url.path)
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error. Please try again shortly."},
    )


@app.get("/api/health", tags=["health"])
async def health_check():
    """Health check — confirms the API is up. No API key checks needed:
    the weather/geocoding providers this backend uses are all free and
    keyless. (Moved off `/` so that path can serve the frontend's
    index.html instead — see the static mount at the bottom of this file.)"""
    return {
        "status": "ok",
        "service": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "weather_provider": "Open-Meteo",
        "reverse_geocoding_provider": "OpenStreetMap Nominatim",
    }


app.include_router(weather.router)
app.include_router(prediction.router)

# Serve the frontend's static files (index.html, pg2.html, weather-data.js,
# etc.) from the SAME port as the API. Registered LAST so it only catches
# requests that didn't match /weather/*, /prediction, or /api/health above
# — e.g. GET / returns frontend/index.html, GET /pg2.html returns
# frontend/pg2.html, GET /weather-data.js returns frontend/weather-data.js.
if FRONTEND_DIR.is_dir():
    app.mount("/", StaticFiles(directory=str(FRONTEND_DIR), html=True), name="frontend")
