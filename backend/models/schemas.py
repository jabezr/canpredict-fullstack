"""
models/schemas.py
------------------
Pydantic response models. These define the exact clean JSON shape the
frontend receives — the raw OpenWeather payload is never passed through
directly.
"""
from typing import List, Optional

from pydantic import BaseModel, Field


class AirQuality(BaseModel):
    aqi: int = Field(..., description="Air Quality Index, 0-500 US EPA scale")
    label: str = Field(..., description="Good / Moderate / Unhealthy / etc.")
    pm2_5: Optional[float] = None
    pm10: Optional[float] = None
    o3: Optional[float] = None
    co: Optional[float] = None
    no2: Optional[float] = None
    so2: Optional[float] = None


class CurrentWeatherResponse(BaseModel):
    city: str
    country: str
    lat: float
    lon: float
    temperature: float
    feels_like: float
    condition: str
    condition_icon: str
    humidity: int
    wind_speed: float
    wind_direction: Optional[str] = None
    pressure: int
    visibility: Optional[float] = Field(None, description="Visibility in kilometers")
    cloud_cover: int
    uv_index: float
    uv_label: str
    sunrise: str
    sunset: str
    moonrise: str
    moonset: str
    air_quality: AirQuality
    updated_at: str


class HourlyForecastItem(BaseModel):
    time: str
    date: str = Field(..., description="Local calendar date, same format as DailyForecastItem.date, e.g. 'Jul 07' — lets the frontend group hours by day")
    temperature: float
    condition: str
    condition_icon: str
    rain_probability: int


class HourlyForecastResponse(BaseModel):
    city: str
    country: str
    hourly: List[HourlyForecastItem]


class DailyForecastItem(BaseModel):
    date: str
    day_label: str
    condition: str
    condition_icon: str
    temp_min: float
    temp_max: float
    feels_like: float
    rain_probability: int
    humidity: int
    wind_speed: float
    wind_direction: Optional[str] = None
    pressure: int
    uv_index: float
    uv_label: str
    cloud_cover: int
    sunrise: str
    sunset: str
    moonrise: str
    moonset: str


class DailyForecastResponse(BaseModel):
    city: str
    country: str
    daily: List[DailyForecastItem]


class InsightsResponse(BaseModel):
    city: str
    country: str
    aqi: int
    aqi_label: str
    uv_index: float
    uv_label: str
    uv_recommendation: str
    pressure: int
    visibility: Optional[float] = None
    wind_speed: float
    wind_direction: Optional[str] = None
    humidity: int
    cloud_cover: int
    dew_point: Optional[float] = None
    travel_advice: str
    health_tip: str
    clothing_suggestion: str
    agriculture_advice: str
    outdoor_score: int


class PredictionResponse(BaseModel):
    city: str
    country: str
    confidence: int
    confidence_label: str
    rain_probability: int
    storm_probability: int
    recommendation: str
    risk_level: str
    condition: str
    condition_icon: str
    temp_min: float
    temp_max: float


class ErrorResponse(BaseModel):
    detail: str
