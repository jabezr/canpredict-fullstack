"""
services/weather_service.py
-----------------------------
All outbound calls to the weather/geocoding/air-quality providers live
here, plus the logic that shapes their raw responses into the clean
Pydantic models defined in models/schemas.py. Nothing outside this file
should ever see a raw provider payload.

Providers used (all free, open, and require no API key or credit card):
  - Open-Meteo Forecast API    — current + hourly + daily weather
  - Open-Meteo Geocoding API   — city name -> coordinates
  - Open-Meteo Air Quality API — AQI, UV index, pollutants
  - OpenStreetMap Nominatim    — coordinates -> city name (reverse geocoding)

Attribution: Open-Meteo data is licensed CC BY 4.0 (non-commercial use);
Nominatim/OpenStreetMap data is licensed ODbL. See README.md "Attribution".
"""
from dataclasses import dataclass
from typing import Any, Dict, List, Optional

from backend.config import get_settings
from backend.models.schemas import (
    AirQuality,
    CurrentWeatherResponse,
    DailyForecastItem,
    DailyForecastResponse,
    HourlyForecastItem,
    HourlyForecastResponse,
)
from backend.utils.cache import cache, make_cache_key
from backend.utils.condition_map import map_condition
from backend.utils.http_client import UpstreamError, get_json
from backend.utils.logger import get_logger
from backend.utils.metrics import (
    aqi_label,
    format_local_date,
    format_local_time,
    local_weekday_label,
    uv_label,
    wind_direction_from_degrees,
)

logger = get_logger(__name__)

# How many days of daily/hourly data to fetch and cache per location in a
# single upstream call — generous enough to cover every route's needs
# (daily up to 16, hourly up to 48h) from one shared cache entry.
_FORECAST_DAYS = 16

_CURRENT_VARS = "temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,cloud_cover,pressure_msl,wind_speed_10m,wind_direction_10m"
_HOURLY_VARS = "temperature_2m,weather_code,precipitation_probability,visibility,wind_speed_10m,dew_point_2m"
_DAILY_VARS = (
    "weather_code,temperature_2m_max,temperature_2m_min,apparent_temperature_max,"
    "precipitation_probability_max,wind_speed_10m_max,wind_direction_10m_dominant,"
    "uv_index_max,sunrise,sunset,relative_humidity_2m_mean,surface_pressure_mean,cloud_cover_mean"
)
_AIR_QUALITY_CURRENT_VARS = "us_aqi,pm10,pm2_5,carbon_monoxide,nitrogen_dioxide,sulphur_dioxide,ozone,uv_index"


@dataclass
class Location:
    name: str
    country: str
    lat: float
    lon: float


# =====================================================================
# LOCATION RESOLUTION
# =====================================================================
async def _geocode_city(city: str) -> Location:
    settings = get_settings()
    cache_key = make_cache_key("geocode", city.strip().lower())
    cached = await cache.get(cache_key)
    if cached is not None:
        return cached

    data = await get_json(
        settings.OPEN_METEO_GEOCODING_URL,
        params={"name": city, "count": 1, "language": "en", "format": "json"},
    )
    results = data.get("results") or []
    if not results:
        raise UpstreamError(f"City '{city}' was not found.", status_code=404)

    top = results[0]
    location = Location(
        name=top["name"],
        country=top.get("country_code", "") or top.get("country", ""),
        lat=top["latitude"],
        lon=top["longitude"],
    )
    await cache.set(cache_key, location, settings.CACHE_TTL_GEOCODE_SECONDS)
    return location


async def _reverse_geocode(lat: float, lon: float) -> Location:
    settings = get_settings()
    cache_key = make_cache_key("reverse", round(lat, 3), round(lon, 3))
    cached = await cache.get(cache_key)
    if cached is not None:
        return cached

    data = await get_json(
        settings.NOMINATIM_REVERSE_URL,
        params={"lat": lat, "lon": lon, "format": "json", "zoom": 10, "addressdetails": 1},
        headers={"User-Agent": settings.NOMINATIM_USER_AGENT},
    )
    address = data.get("address", {})
    name = (
        address.get("city")
        or address.get("town")
        or address.get("municipality")
        or address.get("village")
        or address.get("county")
        or address.get("state")
        or (data.get("display_name", "").split(",")[0] if data.get("display_name") else None)
        or "Current Location"
    )
    location = Location(
        name=name,
        country=address.get("country_code", "").upper(),
        lat=lat,
        lon=lon,
    )
    await cache.set(cache_key, location, settings.CACHE_TTL_GEOCODE_SECONDS)
    return location


async def resolve_location(
    city: Optional[str], lat: Optional[float], lon: Optional[float]
) -> Location:
    """Resolves a Location from ?city=, or ?lat=&lon=, or the configured default."""
    settings = get_settings()
    if city:
        return await _geocode_city(city)
    if lat is not None and lon is not None:
        return await _reverse_geocode(lat, lon)
    return await _geocode_city(settings.DEFAULT_CITY)


# =====================================================================
# FORECAST BUNDLE (current + hourly + daily in one cached upstream call)
# =====================================================================
async def _get_forecast_bundle(location: Location) -> Dict[str, Any]:
    settings = get_settings()
    cache_key = make_cache_key("forecast", round(location.lat, 3), round(location.lon, 3))
    cached = await cache.get(cache_key)
    if cached is not None:
        return cached

    data = await get_json(
        settings.OPEN_METEO_FORECAST_URL,
        params={
            "latitude": location.lat,
            "longitude": location.lon,
            "current": _CURRENT_VARS,
            "hourly": _HOURLY_VARS,
            "daily": _DAILY_VARS,
            "temperature_unit": "celsius",
            "wind_speed_unit": "kmh",
            "precipitation_unit": "mm",
            "timezone": "auto",
            "forecast_days": _FORECAST_DAYS,
        },
    )
    await cache.set(cache_key, data, settings.CACHE_TTL_FORECAST_SECONDS)
    return data


async def _get_air_quality_current(location: Location) -> Dict[str, Any]:
    settings = get_settings()
    cache_key = make_cache_key("air_quality", round(location.lat, 3), round(location.lon, 3))
    cached = await cache.get(cache_key)
    if cached is not None:
        return cached

    data = await get_json(
        settings.OPEN_METEO_AIR_QUALITY_URL,
        params={
            "latitude": location.lat,
            "longitude": location.lon,
            "current": _AIR_QUALITY_CURRENT_VARS,
            "timezone": "auto",
        },
    )
    await cache.set(cache_key, data, settings.CACHE_TTL_CURRENT_SECONDS)
    return data


def _build_air_quality(air_raw: Dict[str, Any]) -> AirQuality:
    current = air_raw.get("current", {})
    aqi = round(current.get("us_aqi") or 0)
    return AirQuality(
        aqi=aqi,
        label=aqi_label(aqi),
        pm2_5=current.get("pm2_5"),
        pm10=current.get("pm10"),
        o3=current.get("ozone"),
        co=current.get("carbon_monoxide"),
        no2=current.get("nitrogen_dioxide"),
        so2=current.get("sulphur_dioxide"),
    )


def _nearest_hourly_index(hourly_times: List[str], current_time: str) -> int:
    """Finds the hourly array index matching (or just before) the
    `current.time` timestamp, used to pull hour-resolution fields
    (visibility, dew point) that aren't part of the `current` block."""
    if not hourly_times:
        return 0
    # hourly times are on-the-hour; current.time may include minutes, so
    # compare on the hour-truncated string (first 13 chars: "YYYY-MM-DDTHH").
    target = current_time[:13]
    for i, t in enumerate(hourly_times):
        if t[:13] == target:
            return i
    return 0


# =====================================================================
# PUBLIC SERVICE FUNCTIONS
# =====================================================================
async def get_current_weather(location: Location) -> CurrentWeatherResponse:
    bundle = await _get_forecast_bundle(location)
    air_raw = await _get_air_quality_current(location)

    current = bundle["current"]
    hourly = bundle.get("hourly", {})
    daily = bundle.get("daily", {})
    hourly_times = hourly.get("time", [])
    idx = _nearest_hourly_index(hourly_times, current["time"])

    label, icon = map_condition(current["weather_code"], current.get("wind_speed_10m", 0.0))
    air = _build_air_quality(air_raw)
    air_current = air_raw.get("current", {})
    uvi = air_current.get("uv_index") or 0.0

    visibility_m = (hourly.get("visibility") or [None])[idx] if hourly.get("visibility") else None
    sunrise = daily.get("sunrise", ["--"])[0] if daily.get("sunrise") else None
    sunset = daily.get("sunset", ["--"])[0] if daily.get("sunset") else None

    return CurrentWeatherResponse(
        city=location.name,
        country=location.country,
        lat=location.lat,
        lon=location.lon,
        temperature=round(current["temperature_2m"], 1),
        feels_like=round(current["apparent_temperature"], 1),
        condition=label,
        condition_icon=icon,
        humidity=round(current["relative_humidity_2m"]),
        wind_speed=round(current.get("wind_speed_10m", 0.0), 1),
        wind_direction=wind_direction_from_degrees(current.get("wind_direction_10m", 0)),
        pressure=round(current.get("pressure_msl", 1013)),
        visibility=round(visibility_m / 1000, 1) if visibility_m is not None else None,
        cloud_cover=round(current.get("cloud_cover", 0)),
        uv_index=round(uvi, 1),
        uv_label=uv_label(uvi),
        sunrise=format_local_time(sunrise) if sunrise else "--",
        sunset=format_local_time(sunset) if sunset else "--",
        moonrise="--",  # not available from these free, no-key providers
        moonset="--",
        air_quality=air,
        updated_at=format_local_time(current["time"]),
    )


async def get_hourly_forecast(location: Location, hours: int = 24) -> HourlyForecastResponse:
    bundle = await _get_forecast_bundle(location)
    hourly = bundle.get("hourly", {})
    all_times = hourly.get("time", [])

    # Open-Meteo's hourly array always starts at midnight (00:00) of
    # today, regardless of what time it actually is right now — so
    # slicing from index 0 would show hours that have already passed
    # (e.g. always "12 AM, 1 AM, 2 AM...") instead of the upcoming ones.
    # Start from whichever index matches the current hour instead.
    start_idx = _nearest_hourly_index(all_times, bundle.get("current", {}).get("time", ""))
    times = all_times[start_idx: start_idx + hours]

    items = []
    for offset, t in enumerate(times):
        i = start_idx + offset
        wind = (hourly.get("wind_speed_10m") or [0.0] * len(all_times))[i]
        code = (hourly.get("weather_code") or [0] * len(all_times))[i]
        label, icon = map_condition(code, wind)
        items.append(
            HourlyForecastItem(
                time=format_local_time(t, fmt="%I %p"),
                date=format_local_date(t),
                temperature=round((hourly.get("temperature_2m") or [0.0] * len(all_times))[i], 1),
                condition=label,
                condition_icon=icon,
                rain_probability=round((hourly.get("precipitation_probability") or [0] * len(all_times))[i]),
            )
        )

    return HourlyForecastResponse(city=location.name, country=location.country, hourly=items)


async def get_daily_forecast(location: Location, days: int = 7) -> DailyForecastResponse:
    bundle = await _get_forecast_bundle(location)
    daily = bundle.get("daily", {})
    times = daily.get("time", [])[:days]

    items = []
    for idx, t in enumerate(times):
        def d(key: str, default=0):
            arr = daily.get(key) or []
            return arr[idx] if idx < len(arr) else default

        wind_max = d("wind_speed_10m_max", 0.0)
        code = d("weather_code", 0)
        label, icon = map_condition(code, wind_max)
        uvi = d("uv_index_max", 0.0) or 0.0
        sunrise = d("sunrise", None)
        sunset = d("sunset", None)

        items.append(
            DailyForecastItem(
                date=format_local_date(t),
                day_label=local_weekday_label(t, idx),
                condition=label,
                condition_icon=icon,
                temp_min=round(d("temperature_2m_min", 0.0), 1),
                temp_max=round(d("temperature_2m_max", 0.0), 1),
                feels_like=round(d("apparent_temperature_max", d("temperature_2m_max", 0.0)), 1),
                rain_probability=round(d("precipitation_probability_max", 0)),
                humidity=round(d("relative_humidity_2m_mean", 0)),
                wind_speed=round(wind_max, 1),
                wind_direction=wind_direction_from_degrees(d("wind_direction_10m_dominant", 0)),
                pressure=round(d("surface_pressure_mean", 1013)),
                uv_index=round(uvi, 1),
                uv_label=uv_label(uvi),
                cloud_cover=round(d("cloud_cover_mean", 0)),
                sunrise=format_local_time(sunrise) if sunrise else "--",
                sunset=format_local_time(sunset) if sunset else "--",
                moonrise="--",
                moonset="--",
            )
        )

    return DailyForecastResponse(city=location.name, country=location.country, daily=items)
