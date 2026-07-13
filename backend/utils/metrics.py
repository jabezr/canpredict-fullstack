"""
utils/metrics.py
------------------
Small, pure calculation helpers shared by the weather and prediction
services: UV categorization, AQI labeling, compass direction from
degrees, dew point, and local date/time formatting.

Open-Meteo returns timestamps as ISO8601 strings already localized to
the requested location (via `&timezone=auto`), e.g. "2026-07-09T14:00" —
so, unlike a unix-timestamp + UTC-offset provider, no timezone math is
needed here: the string IS local time, parse and format it directly.
"""
import math
from datetime import datetime
from typing import Tuple


def aqi_label(aqi: int) -> str:
    if aqi <= 50:
        return "Good"
    if aqi <= 100:
        return "Moderate"
    if aqi <= 150:
        return "Unhealthy (Sensitive)"
    if aqi <= 200:
        return "Unhealthy"
    return "Hazardous"


def uv_label(uvi: float) -> str:
    if uvi >= 8:
        return "Very High"
    if uvi >= 6:
        return "High"
    if uvi >= 3:
        return "Moderate"
    return "Low"


def uv_recommendation(uvi: float) -> str:
    if uvi >= 8:
        return "Wear SPF 50+ sunscreen, sunglasses, and avoid peak sun hours."
    if uvi >= 6:
        return "SPF 30+ sunscreen recommended if outdoors for extended periods."
    if uvi >= 3:
        return "Minimal protection needed for most people."
    return "No protection required today."


_COMPASS = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE",
            "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"]


def wind_direction_from_degrees(deg: float) -> str:
    idx = round(deg / 22.5) % 16
    return _COMPASS[idx]


def parse_local_iso(iso_str: str) -> datetime:
    """Parses an Open-Meteo ISO8601 timestamp, which is already in local
    time (thanks to `&timezone=auto`) — no offset math required."""
    return datetime.fromisoformat(iso_str)


def format_local_time(iso_str: str, fmt: str = "%I:%M %p") -> str:
    dt = parse_local_iso(iso_str)
    formatted = dt.strftime(fmt)
    # Strip a leading zero from the hour (e.g. "08:00 AM" -> "8:00 AM")
    if formatted.startswith("0"):
        formatted = formatted[1:]
    return formatted


def format_local_date(iso_str: str, fmt: str = "%b %d") -> str:
    return parse_local_iso(iso_str).strftime(fmt)


def local_weekday_label(iso_str: str, index: int) -> str:
    """Returns 'Today' for index 0, otherwise the short weekday name."""
    if index == 0:
        return "Today"
    return parse_local_iso(iso_str).strftime("%a")


def dew_point_celsius(temp_c: float, humidity_pct: float) -> float:
    """Magnus formula approximation for dew point, given temp (C) and RH (%).
    Kept as a fallback calculation for endpoints that need a dew point
    figure not directly returned by the current-conditions call."""
    a, b = 17.62, 243.12
    alpha = ((a * temp_c) / (b + temp_c)) + math.log(max(humidity_pct, 1) / 100.0)
    dew_point = (b * alpha) / (a - alpha)
    return round(dew_point, 1)
