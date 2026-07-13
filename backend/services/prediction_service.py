"""
services/prediction_service.py
--------------------------------
This is the "AI" layer described in the project brief. Today it is a
transparent, rule-based heuristic engine — not a trained ML model — that
turns real OpenWeather forecast data into the confidence/risk/advice
fields the frontend already knows how to render (see weather-data.js's
original generatePrediction/generateInsights, which this mirrors so the
UI needs zero changes).

This module is intentionally isolated from weather_service.py so a future
trained model can be swapped in here (e.g. loading a scikit-learn/PyTorch
model and calling `.predict()`) without touching any route or the
frontend contract — see README.md "Future AI" section.
"""
from typing import Dict

from backend.models.schemas import (
    AirQuality,
    CurrentWeatherResponse,
    DailyForecastItem,
    PredictionResponse,
)
from backend.utils.metrics import uv_recommendation
from backend.services.weather_service import Location


def _clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


def generate_prediction(location: Location, tomorrow: DailyForecastItem) -> PredictionResponse:
    pop = tomorrow.rain_probability  # 0-100

    # Confidence: a clear/extreme signal (very high or very low rain
    # chance) is easier to be confident about than a coin-flip forecast.
    confidence = round(_clamp(70 + abs(pop - 50) * 0.5, 65, 97))
    confidence_label = (
        "Very High" if confidence >= 90 else "High" if confidence >= 75 else "Moderate"
    )

    if tomorrow.condition_icon == "icon-thunder":
        storm_probability = round(_clamp(65 + pop * 0.3, 0, 100))
    elif tomorrow.condition_icon == "icon-rain":
        storm_probability = round(_clamp(20 + pop * 0.25, 0, 100))
    else:
        storm_probability = round(_clamp(pop * 0.1, 0, 100))

    if tomorrow.condition_icon in ("icon-thunder", "icon-snow"):
        risk_level = "High"
    elif tomorrow.condition_icon in ("icon-rain", "icon-fog", "icon-mist"):
        risk_level = "Moderate"
    else:
        risk_level = "Low"

    recommendations: Dict[str, str] = {
        "icon-thunder": "Avoid outdoor activities and unplug sensitive electronics during storm hours.",
        "icon-rain": "Carry an umbrella and plan outdoor activities around the rain window.",
        "icon-drizzle": "Carry an umbrella and plan outdoor activities around the rain window.",
        "icon-snow": "Dress warmly and watch for slippery roads.",
        "icon-fog": "Drive carefully and allow extra travel time due to low visibility.",
        "icon-mist": "Drive carefully and allow extra travel time due to low visibility.",
        "icon-windy": "Secure loose outdoor items and be cautious of strong gusts.",
        "icon-sunny": "Apply sunscreen and stay hydrated if outdoors for long periods.",
    }
    recommendation = recommendations.get(
        tomorrow.condition_icon, "Generally comfortable conditions expected — a normal day outdoors."
    )

    return PredictionResponse(
        city=location.name,
        country=location.country,
        confidence=confidence,
        confidence_label=confidence_label,
        rain_probability=pop,
        storm_probability=storm_probability,
        recommendation=recommendation,
        risk_level=risk_level,
        condition=tomorrow.condition,
        condition_icon=tomorrow.condition_icon,
        temp_min=tomorrow.temp_min,
        temp_max=tomorrow.temp_max,
    )


def generate_insights_text(
    current: CurrentWeatherResponse,
    today: DailyForecastItem,
    air: AirQuality,
) -> Dict[str, str]:
    icon = today.condition_icon

    if icon in ("icon-thunder", "icon-rain", "icon-drizzle"):
        travel_advice = "Expect delays on waterlogged routes — allow extra travel time and avoid low-lying roads."
        clothing_suggestion = "Waterproof jacket or umbrella, and non-slip footwear recommended."
        agriculture_advice = "Good conditions for irrigation-free watering; hold off on pesticide spraying until rain clears."
    elif icon == "icon-snow":
        travel_advice = "Roads may be slippery — drive slowly and check local advisories before travelling."
        clothing_suggestion = "Layer up with a warm coat, gloves, and insulated boots."
        agriculture_advice = "Protect sensitive crops from frost damage overnight."
    elif icon in ("icon-fog", "icon-mist"):
        travel_advice = "Reduced visibility expected in the morning — use fog lamps and drive carefully."
        clothing_suggestion = "A light jacket is enough; visibility, not temperature, is the main concern today."
        agriculture_advice = "Morning mist can help retain soil moisture — good day for transplanting seedlings."
    elif icon == "icon-sunny":
        travel_advice = "Clear skies make for smooth travel — a great day for a road trip or outdoor errands."
        clothing_suggestion = "Light, breathable cotton clothing with sunglasses and a hat."
        agriculture_advice = "Good day for harvesting; ensure adequate irrigation to offset stronger evaporation."
    elif icon == "icon-windy":
        travel_advice = "Two-wheeler riders should be cautious of strong crosswinds on open roads."
        clothing_suggestion = "A windbreaker will keep you comfortable outdoors today."
        agriculture_advice = "Hold off on spraying pesticides — strong winds will reduce effectiveness and cause drift."
    else:
        travel_advice = "No major disruptions expected — normal travel conditions throughout the day."
        clothing_suggestion = "Light layers work well for the mild, overcast conditions today."
        agriculture_advice = "Stable conditions — routine field activity can continue as planned."

    if air.aqi > 150:
        health_tip = "Air quality is poor today — sensitive groups should limit prolonged outdoor exertion."
    elif current.uv_index >= 8:
        health_tip = "UV levels are very high — limit direct sun exposure between 10 AM and 4 PM."
    elif current.humidity >= 80:
        health_tip = "High humidity may make it feel warmer than it is — stay hydrated."
    else:
        health_tip = "Conditions are generally favorable for outdoor activity today."

    outdoor_score = round(
        _clamp(
            100
            - today.rain_probability * 0.5
            - max(0, current.uv_index - 6) * 4
            - max(0, air.aqi - 80) * 0.25,
            5,
            98,
        )
    )

    return {
        "travel_advice": travel_advice,
        "health_tip": health_tip,
        "clothing_suggestion": clothing_suggestion,
        "agriculture_advice": agriculture_advice,
        "outdoor_score": outdoor_score,
        "uv_recommendation": uv_recommendation(current.uv_index),
    }
