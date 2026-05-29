from __future__ import annotations

from datetime import datetime, timedelta
from pathlib import Path
from typing import List, Literal

import numpy as np
import torch
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

from src.lstm_model import ForecastLSTM


BASE_DIR = Path(__file__).resolve().parent
MODEL_PATH = BASE_DIR / "models" / "forecast_model.pt"
FEATURE_NAMES = [
    "completed_points",
    "remaining_points",
    "resource_burn_rate",
    "active_risk_count",
    "team_availability_ratio",
]


class WeeklySnapshot(BaseModel):
    week: int
    completed_points: float = Field(ge=0)
    remaining_points: float = Field(ge=0)
    resource_burn_rate: float = Field(ge=0)
    active_risk_count: int = Field(ge=0)
    team_availability_ratio: float = Field(ge=0, le=1)


class ForecastRequest(BaseModel):
    project_id: str
    weekly_snapshots: List[WeeklySnapshot]


class ForecastResponse(BaseModel):
    project_id: str
    risk_probability: float
    will_slip: bool
    forecasted_completion_date: str
    confidence: Literal["low", "medium", "high"]
    top_risk_factors: List[str]


app = FastAPI(title="Forecasting Service", version="1.0.0")


def _load_bundle() -> dict | None:
    if not MODEL_PATH.exists():
        return None
    bundle = torch.load(MODEL_PATH, map_location="cpu")
    if not isinstance(bundle, dict):
        return None
    return bundle


def _load_model() -> None:
    bundle = _load_bundle()
    if bundle is None:
        app.state.forecast_bundle = None
        app.state.forecast_model = None
        return

    model = ForecastLSTM(input_dim=5, hidden_dim=128, num_layers=2, dropout=0.3)
    state_dict = bundle.get("state_dict", bundle)
    model.load_state_dict(state_dict)
    model.eval()

    app.state.forecast_bundle = bundle
    app.state.forecast_model = model


@app.on_event("startup")
def startup_event() -> None:
    _load_model()


def _get_artifacts() -> tuple[ForecastLSTM, dict]:
    model = getattr(app.state, "forecast_model", None)
    bundle = getattr(app.state, "forecast_bundle", None)
    if model is None or bundle is None:
        raise HTTPException(
            status_code=503,
            detail=f"Forecast model not available. Train it and save it to {MODEL_PATH}.",
        )
    return model, bundle


def _prepare_sequence(snaps: List[WeeklySnapshot], bundle: dict) -> np.ndarray:
    ordered = sorted(snaps, key=lambda item: item.week)
    sequence_length = int(bundle.get("sequence_length", 8))
    matrix = np.array([[getattr(item, name) for name in FEATURE_NAMES] for item in ordered], dtype=np.float32)

    if matrix.shape[0] >= sequence_length:
        matrix = matrix[-sequence_length:]
    else:
        pad_count = sequence_length - matrix.shape[0]
        pad_source = matrix[:1] if matrix.size else np.zeros((1, len(FEATURE_NAMES)), dtype=np.float32)
        padding = np.repeat(pad_source, pad_count, axis=0)
        matrix = np.vstack([padding, matrix])

    feature_mean = np.asarray(bundle.get("feature_mean"), dtype=np.float32)
    feature_std = np.asarray(bundle.get("feature_std"), dtype=np.float32)
    feature_std = np.where(feature_std == 0, 1.0, feature_std)
    matrix = (matrix - feature_mean) / feature_std
    return matrix.astype(np.float32)


def _confidence_label(probability: float) -> Literal["low", "medium", "high"]:
    if probability >= 0.75:
        return "high"
    if probability >= 0.55:
        return "medium"
    return "low"


def _forecast_completion_date(snaps: List[WeeklySnapshot], probability: float) -> str:
    latest = max(snaps, key=lambda item: item.week)
    burn_rate = max(latest.resource_burn_rate, 0.1)
    remaining_weeks = latest.remaining_points / burn_rate
    slip_buffer = 1.0 + probability * 0.35
    estimated_days = max(7, int(round(remaining_weeks * slip_buffer * 7)))
    return (datetime.utcnow().date() + timedelta(days=estimated_days)).isoformat()


def _top_risk_factors(snaps: List[WeeklySnapshot], probability: float) -> List[str]:
    ordered = sorted(snaps, key=lambda item: item.week)
    latest = ordered[-1]
    factors: List[str] = []

    if latest.team_availability_ratio < 0.85:
        factors.append("team availability is below healthy capacity")
    if latest.active_risk_count >= 4:
        factors.append("active risk count is elevated")
    if latest.resource_burn_rate < max(latest.completed_points / max(latest.week, 1), 1.0):
        factors.append("burn rate is lagging behind delivered scope")

    if len(ordered) >= 3:
        remaining_trend = np.polyfit([item.week for item in ordered[-3:]], [item.remaining_points for item in ordered[-3:]], 1)[0]
        completed_trend = np.polyfit([item.week for item in ordered[-3:]], [item.completed_points for item in ordered[-3:]], 1)[0]
        if remaining_trend >= 0:
            factors.append("remaining scope is not trending down")
        if completed_trend < latest.resource_burn_rate * 0.5:
            factors.append("recent completion momentum is weak")

    if probability >= 0.7:
        factors.append("model confidence indicates a high slip risk")

    deduped: List[str] = []
    for item in factors:
        if item not in deduped:
            deduped.append(item)
    return deduped[:4] or ["insufficient historical signal to isolate a dominant risk factor"]


@app.get("/health")
def health() -> dict:
    bundle = getattr(app.state, "forecast_bundle", None)
    return {
        "status": "ok",
        "model_loaded": bundle is not None,
        "model_path": str(MODEL_PATH),
    }


@app.post("/forecast", response_model=ForecastResponse)
def forecast(payload: ForecastRequest) -> ForecastResponse:
    if not payload.weekly_snapshots:
        raise HTTPException(status_code=422, detail="weekly_snapshots must contain at least one snapshot")

    model, bundle = _get_artifacts()
    sequence = _prepare_sequence(payload.weekly_snapshots, bundle)
    tensor = torch.tensor(sequence, dtype=torch.float32).unsqueeze(0)

    with torch.no_grad():
        probability = float(model(tensor).item())

    will_slip = probability >= 0.45
    confidence = _confidence_label(probability)
    completion_date = _forecast_completion_date(payload.weekly_snapshots, probability)
    risk_factors = _top_risk_factors(payload.weekly_snapshots, probability)

    return ForecastResponse(
        project_id=payload.project_id,
        risk_probability=round(probability, 4),
        will_slip=will_slip,
        forecasted_completion_date=completion_date,
        confidence=confidence,
        top_risk_factors=risk_factors,
    )


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=8002, reload=False)
