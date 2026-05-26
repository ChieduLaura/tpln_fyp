from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List

import joblib
import numpy as np
import pandas as pd


@dataclass
class InferenceResult:
    estimated_effort_hours: float
    estimated_duration_days: float
    confidence_low: float
    confidence_high: float
    feature_frame: pd.DataFrame


class XGBoostEstimator:
    def __init__(self, model_path: Path):
        self.model_path = model_path
        self.model: Any = None
        self.feature_order: List[str] = [
            "complexity_score",
            "story_points",
            "number_of_dependencies",
            "risk_score",
            "team_seniority_avg",
            "sprint_velocity_last_3",
        ]
        self._load_model()

    @property
    def is_loaded(self) -> bool:
        return self.model is not None

    @property
    def raw_model(self) -> Any:
        if self.model is None:
            raise RuntimeError("Model is not loaded")
        return self.model

    def _load_model(self) -> None:
        if not self.model_path.exists():
            self.model = None
            return
        self.model = joblib.load(self.model_path)

    def _build_frame(self, features: Dict[str, float]) -> pd.DataFrame:
        row = {name: float(features.get(name, 0.0)) for name in self.feature_order}
        return pd.DataFrame([row], columns=self.feature_order)

    def _estimate_confidence_bounds(self, predicted_hours: float, features: Dict[str, float]) -> tuple[float, float]:
        risk = max(0.0, min(float(features.get("risk_score", 0.0)), 1.0))
        complexity = float(features.get("complexity_score", 1.0)) / 5.0
        dependencies = float(features.get("number_of_dependencies", 0.0))

        spread_ratio = 0.12 + (0.18 * risk) + (0.08 * complexity) + min(0.12, dependencies * 0.01)
        spread = max(1.0, predicted_hours * spread_ratio)

        low = max(0.0, predicted_hours - spread)
        high = max(low, predicted_hours + spread)
        return float(low), float(high)

    def predict(self, features: Dict[str, float]) -> InferenceResult:
        if self.model is None:
            raise RuntimeError(f"Model file not found at {self.model_path}")

        feature_frame = self._build_frame(features)
        raw_pred = self.model.predict(feature_frame)
        predicted_hours = float(np.asarray(raw_pred).reshape(-1)[0])
        predicted_hours = max(0.0, predicted_hours)

        estimated_duration_days = predicted_hours / 8.0
        low, high = self._estimate_confidence_bounds(predicted_hours, features)

        return InferenceResult(
            estimated_effort_hours=predicted_hours,
            estimated_duration_days=float(estimated_duration_days),
            confidence_low=low,
            confidence_high=high,
            feature_frame=feature_frame,
        )
