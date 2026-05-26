from pathlib import Path
from typing import List

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

try:
    from src.explainer import SHAPExplainer
    from src.model import XGBoostEstimator
except Exception:
    # When running as a script the package path may not include project root — add it
    import sys

    sys.path.append(str(Path(__file__).resolve().parent))
    from src.explainer import SHAPExplainer
    from src.model import XGBoostEstimator

load_dotenv()

app = FastAPI(title="TPLN AI Estimation Service", version="1.0.0")

MODEL_PATH = Path(__file__).resolve().parent / "models" / "effort_model.pkl"


class EstimateRequest(BaseModel):
    task_id: str
    title: str
    complexity_score: int = Field(..., ge=1, le=5)
    story_points: float
    number_of_dependencies: float
    risk_score: float
    team_seniority_avg: float
    sprint_velocity_last_3: float


class FeatureContribution(BaseModel):
    feature: str
    shap_value: float
    feature_value: float


class ShapExplanation(BaseModel):
    base_value: float
    feature_contributions: List[FeatureContribution]
    narrative_summary: str


class EstimateResponse(BaseModel):
    task_id: str
    estimated_effort_hours: float
    estimated_duration_days: float
    confidence_interval: List[float]
    shap_explanation: ShapExplanation


estimator = XGBoostEstimator(model_path=MODEL_PATH)
explainer = SHAPExplainer()


@app.get("/health")
def health() -> dict:
    return {
        "status": "ok",
        "model_loaded": estimator.is_loaded,
    }


@app.post("/estimate", response_model=EstimateResponse)
def estimate(payload: EstimateRequest) -> EstimateResponse:
    if not estimator.is_loaded:
        raise HTTPException(status_code=503, detail="Model is not loaded")

    feature_map = {
        "complexity_score": float(payload.complexity_score),
        "story_points": float(payload.story_points),
        "number_of_dependencies": float(payload.number_of_dependencies),
        "risk_score": float(payload.risk_score),
        "team_seniority_avg": float(payload.team_seniority_avg),
        "sprint_velocity_last_3": float(payload.sprint_velocity_last_3),
    }

    try:
        inference = estimator.predict(feature_map)
        explanation = explainer.explain(
            model=estimator.raw_model,
            feature_frame=inference.feature_frame,
            feature_names=estimator.feature_order,
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Inference failed: {exc}") from exc

    return EstimateResponse(
        task_id=payload.task_id,
        estimated_effort_hours=inference.estimated_effort_hours,
        estimated_duration_days=inference.estimated_duration_days,
        confidence_interval=[inference.confidence_low, inference.confidence_high],
        shap_explanation=ShapExplanation(
            base_value=explanation.base_value,
            feature_contributions=[
                FeatureContribution(
                    feature=item["feature"],
                    shap_value=item["shap_value"],
                    feature_value=item["feature_value"],
                )
                for item in explanation.feature_contributions
            ],
            narrative_summary=explanation.narrative_summary,
        ),
    )


if __name__ == "__main__":
    import uvicorn

    # Run app instance directly to avoid module-import path issues
    uvicorn.run(app, host="0.0.0.0", port=8001, reload=False)
