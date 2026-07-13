"""
config.py
---------
Central configuration for the CanPredict backend, loaded from environment
variables (see .env.example). Never hardcode secrets here — this file only
reads them.
"""
import os
from functools import lru_cache
from pathlib import Path
from typing import List

try:
    from dotenv import load_dotenv

    # load_dotenv() with no arguments only searches the current working
    # directory and upward — it will NOT find backend/.env when the app is
    # started with `uvicorn backend.app:app` from the project root (the
    # documented way to run it), because backend/ is a subdirectory, not
    # an ancestor, of that CWD. So we explicitly try both common
    # locations, in order, and load whichever exists first:
    #   1. backend/.env        (next to this file)
    #   2. <project root>/.env (one level up from backend/)
    _here = Path(__file__).resolve().parent
    for _candidate in (_here / ".env", _here.parent / ".env"):
        if _candidate.is_file():
            load_dotenv(dotenv_path=_candidate)
            break
    else:
        # Fall back to default upward-search behavior in case the app is
        # ever run from some other working directory.
        load_dotenv()
except ImportError:
    # python-dotenv is optional at runtime if the environment is already
    # configured (e.g. Docker, systemd, CI). requirements.txt includes it
    # so this branch should not normally trigger.
    pass


def _split_csv(value: str) -> List[str]:
    return [item.strip() for item in value.split(",") if item.strip()]


class Settings:
    """Application settings. Instantiated once via get_settings()."""

    # --- Weather / forecast: Open-Meteo (open-source, no API key, no card) ---
    OPEN_METEO_FORECAST_URL: str = os.getenv(
        "OPEN_METEO_FORECAST_URL", "https://api.open-meteo.com/v1/forecast"
    )
    OPEN_METEO_GEOCODING_URL: str = os.getenv(
        "OPEN_METEO_GEOCODING_URL", "https://geocoding-api.open-meteo.com/v1/search"
    )
    OPEN_METEO_AIR_QUALITY_URL: str = os.getenv(
        "OPEN_METEO_AIR_QUALITY_URL", "https://air-quality-api.open-meteo.com/v1/air-quality"
    )

    # --- Reverse geocoding: OpenStreetMap Nominatim (open-source, no API
    # key). Its usage policy requires a descriptive User-Agent identifying
    # the application — see https://operations.osmfoundation.org/policies/nominatim/
    NOMINATIM_REVERSE_URL: str = os.getenv(
        "NOMINATIM_REVERSE_URL", "https://nominatim.openstreetmap.org/reverse"
    )
    NOMINATIM_USER_AGENT: str = os.getenv(
        "NOMINATIM_USER_AGENT", "CanPredict-AI-Weather/1.0 (educational project)"
    )

    # --- App / server ---
    APP_NAME: str = os.getenv("APP_NAME", "CanPredict AI Weather API")
    APP_VERSION: str = os.getenv("APP_VERSION", "1.0.0")
    DEBUG: bool = os.getenv("DEBUG", "false").lower() == "true"

    # --- CORS ---
    # Comma-separated list of allowed origins, e.g.
    # "http://localhost:5500,http://127.0.0.1:5500,null"
    # "null" is included by default because opening the frontend HTML files
    # directly via file:// sends an Origin header of "null" in some browsers.
    CORS_ORIGINS: List[str] = _split_csv(
        os.getenv(
            "CORS_ORIGINS",
            "http://localhost:5500,http://127.0.0.1:5500,"
            "http://localhost:3000,http://127.0.0.1:3000,"
            "http://localhost:8080,http://127.0.0.1:8080,null",
        )
    )

    # --- HTTP client behaviour ---
    REQUEST_TIMEOUT_SECONDS: float = float(os.getenv("REQUEST_TIMEOUT_SECONDS", "10"))
    MAX_RETRIES: int = int(os.getenv("MAX_RETRIES", "2"))
    RETRY_BACKOFF_SECONDS: float = float(os.getenv("RETRY_BACKOFF_SECONDS", "0.5"))

    # --- Caching ---
    CACHE_TTL_CURRENT_SECONDS: int = int(os.getenv("CACHE_TTL_CURRENT_SECONDS", "300"))
    CACHE_TTL_FORECAST_SECONDS: int = int(os.getenv("CACHE_TTL_FORECAST_SECONDS", "900"))
    CACHE_TTL_GEOCODE_SECONDS: int = int(os.getenv("CACHE_TTL_GEOCODE_SECONDS", "86400"))

    # --- Defaults (used when no city/lat/lon is supplied) ---
    DEFAULT_CITY: str = os.getenv("DEFAULT_CITY", "Chennai")
    DEFAULT_LAT: float = float(os.getenv("DEFAULT_LAT", "13.0827"))
    DEFAULT_LON: float = float(os.getenv("DEFAULT_LON", "80.2707"))
    DEFAULT_UNITS: str = os.getenv("DEFAULT_UNITS", "metric")  # metric | imperial

    # --- Logging ---
    LOG_LEVEL: str = os.getenv("LOG_LEVEL", "INFO")


@lru_cache()
def get_settings() -> Settings:
    """Returns a cached Settings instance (loaded once per process)."""
    return Settings()
