from dataclasses import dataclass
from typing import Any, Dict, List

import numpy as np
import pandas as pd
import shap


@dataclass
class ExplanationResult:
    base_value: float
    feature_contributions: List[Dict[str, float | str]]
    narrative_summary: str


class SHAPExplainer:
    def __init__(self) -> None:
        self._cache: Dict[int, shap.TreeExplainer] = {}

    def _get_explainer(self, model: Any) -> shap.TreeExplainer:
        key = id(model)
        if key not in self._cache:
            self._cache[key] = shap.TreeExplainer(model)
        return self._cache[key]

    def _build_narrative(self, ranked: List[Dict[str, float | str]], base_value: float) -> str:
        if not ranked:
            return "The model prediction is close to its baseline and no strong feature drivers were detected."

        top = ranked[:3]
        clauses = []
        for item in top:
            feature = str(item["feature"])
            shap_value = float(item["shap_value"])
            direction = "increased" if shap_value >= 0 else "decreased"
            clauses.append(f"{feature} {direction} effort by {abs(shap_value):.2f}h")

        return (
            f"Starting from a baseline of {base_value:.2f}h, "
            + "; ".join(clauses)
            + "."
        )

    def explain(self, model: Any, feature_frame: pd.DataFrame, feature_names: List[str]) -> ExplanationResult:
        explainer = self._get_explainer(model)
        shap_values = explainer.shap_values(feature_frame)

        shap_array = np.asarray(shap_values)
        if shap_array.ndim == 2:
            row_values = shap_array[0]
        elif shap_array.ndim == 3:
            row_values = shap_array[0, 0, :]
        else:
            row_values = shap_array.reshape(-1)

        base = explainer.expected_value
        if isinstance(base, (list, tuple, np.ndarray)):
            base_value = float(np.asarray(base).reshape(-1)[0])
        else:
            base_value = float(base)

        contributions: List[Dict[str, float | str]] = []
        for idx, feature in enumerate(feature_names):
            feature_value = float(feature_frame.iloc[0, idx])
            shap_value = float(row_values[idx]) if idx < len(row_values) else 0.0
            contributions.append(
                {
                    "feature": feature,
                    "shap_value": shap_value,
                    "feature_value": feature_value,
                }
            )

        ranked = sorted(contributions, key=lambda item: abs(float(item["shap_value"])), reverse=True)
        summary = self._build_narrative(ranked, base_value)

        return ExplanationResult(
            base_value=base_value,
            feature_contributions=ranked,
            narrative_summary=summary,
        )
