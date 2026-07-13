"""
routes/prediction.py
----------------------
The AI Prediction Dashboard's data source. Currently backed by
services/prediction_service.py's rule-based heuristics running on real
tomorrow's-forecast data (see that module's docstring for the roadmap to
a trained model).
"""
from typing import Optional

from fastapi import APIRouter, HTTPException, Query

from backend.models.schemas import PredictionResponse
from backend.services import prediction_service, weather_service
from backend.utils.http_client import UpstreamError
from backend.utils.logger import get_logger

logger = get_logger(__name__)
router = APIRouter(prefix="/prediction", tags=["prediction"])


@router.get("", response_model=PredictionResponse)
async def get_prediction(
    city: Optional[str] = Query(None),
    lat: Optional[float] = Query(None),
    lon: Optional[float] = Query(None),
):
    """Tomorrow's AI-assisted prediction: confidence, rain/storm probability, risk, advice."""
    try:
        location = await weather_service.resolve_location(city=city, lat=lat, lon=lon)
        daily = await weather_service.get_daily_forecast(location, days=2)
        tomorrow = daily.daily[1] if len(daily.daily) > 1 else daily.daily[0]
        return prediction_service.generate_prediction(location, tomorrow)
    except UpstreamError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc
