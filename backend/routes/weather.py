"""
routes/weather.py
-------------------
All /weather/* endpoints. Every route resolves a Location (from ?city=
or ?lat=&lon=, falling back to the configured default), then delegates
to weather_service / prediction_service for the actual data.
"""
from typing import Optional

from fastapi import APIRouter, HTTPException, Query

from backend.models.schemas import (
    CurrentWeatherResponse,
    DailyForecastResponse,
    HourlyForecastResponse,
    InsightsResponse,
)
from backend.services import prediction_service, weather_service
from backend.utils.http_client import UpstreamError
from backend.utils.logger import get_logger

logger = get_logger(__name__)
router = APIRouter(prefix="/weather", tags=["weather"])


async def _resolve_or_400(city: Optional[str], lat: Optional[float], lon: Optional[float]):
    try:
        return await weather_service.resolve_location(city=city, lat=lat, lon=lon)
    except UpstreamError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc


@router.get("/current", response_model=CurrentWeatherResponse)
async def current_weather(
    city: Optional[str] = Query(None, description="City name, e.g. 'Chennai'"),
    lat: Optional[float] = Query(None, description="Latitude"),
    lon: Optional[float] = Query(None, description="Longitude"),
):
    """Current conditions for a city, coordinates, or the default location."""
    location = await _resolve_or_400(city, lat, lon)
    try:
        return await weather_service.get_current_weather(location)
    except UpstreamError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc


@router.get("/hourly", response_model=HourlyForecastResponse)
async def hourly_forecast(
    city: Optional[str] = Query(None),
    lat: Optional[float] = Query(None),
    lon: Optional[float] = Query(None),
    hours: int = Query(24, ge=1, le=48, description="Number of hourly points to return"),
):
    """Hourly forecast (default next 24 hours)."""
    location = await _resolve_or_400(city, lat, lon)
    try:
        return await weather_service.get_hourly_forecast(location, hours=hours)
    except UpstreamError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc


@router.get("/daily", response_model=DailyForecastResponse)
async def daily_forecast(
    city: Optional[str] = Query(None),
    lat: Optional[float] = Query(None),
    lon: Optional[float] = Query(None),
    days: int = Query(7, ge=1, le=16, description="Number of daily points to return"),
):
    """Daily forecast (default next 7 days)."""
    location = await _resolve_or_400(city, lat, lon)
    try:
        return await weather_service.get_daily_forecast(location, days=days)
    except UpstreamError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc


@router.get("/insights", response_model=InsightsResponse)
async def insights(
    city: Optional[str] = Query(None),
    lat: Optional[float] = Query(None),
    lon: Optional[float] = Query(None),
):
    """
    AQI, UV, pressure, visibility, wind, humidity, clouds, dew point, plus
    rule-based travel/health/clothing/agriculture guidance and an outdoor
    activity score.
    """
    location = await _resolve_or_400(city, lat, lon)
    try:
        current = await weather_service.get_current_weather(location)
        daily = await weather_service.get_daily_forecast(location, days=1)
        today = daily.daily[0]
        advice = prediction_service.generate_insights_text(current, today, current.air_quality)

        from backend.utils.metrics import dew_point_celsius

        return InsightsResponse(
            city=location.name,
            country=location.country,
            aqi=current.air_quality.aqi,
            aqi_label=current.air_quality.label,
            uv_index=current.uv_index,
            uv_label=current.uv_label,
            uv_recommendation=advice["uv_recommendation"],
            pressure=current.pressure,
            visibility=current.visibility,
            wind_speed=current.wind_speed,
            wind_direction=current.wind_direction,
            humidity=current.humidity,
            cloud_cover=current.cloud_cover,
            dew_point=dew_point_celsius(current.temperature, current.humidity),
            travel_advice=advice["travel_advice"],
            health_tip=advice["health_tip"],
            clothing_suggestion=advice["clothing_suggestion"],
            agriculture_advice=advice["agriculture_advice"],
            outdoor_score=advice["outdoor_score"],
        )
    except UpstreamError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc


@router.get("/search", response_model=CurrentWeatherResponse)
async def search_city(
    city: str = Query(..., min_length=1, description="City name to search, e.g. 'London'"),
):
    """Search weather by city name. `city` is required."""
    location = await _resolve_or_400(city, None, None)
    try:
        return await weather_service.get_current_weather(location)
    except UpstreamError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc


@router.get("/location", response_model=CurrentWeatherResponse)
async def weather_by_location(
    lat: float = Query(..., description="Latitude"),
    lon: float = Query(..., description="Longitude"),
):
    """Current weather using latitude/longitude (e.g. from the browser's Geolocation API)."""
    location = await _resolve_or_400(None, lat, lon)
    try:
        return await weather_service.get_current_weather(location)
    except UpstreamError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc
