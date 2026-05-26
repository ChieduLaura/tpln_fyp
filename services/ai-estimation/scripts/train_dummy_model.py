"""Train and save a small dummy regressor for local testing.

Generates models/effort_model.pkl
"""
from pathlib import Path

import joblib
import numpy as np
from sklearn.ensemble import RandomForestRegressor


def make_dummy_dataset(n=200):
    rng = np.random.default_rng(42)
    complexity = rng.integers(1, 6, size=n)
    story_points = rng.normal(5, 2, size=n)
    deps = rng.integers(0, 5, size=n)
    risk = rng.random(n)
    seniority = rng.normal(3, 1, size=n)
    velocity = rng.normal(10, 3, size=n)

    X = np.vstack([complexity, story_points, deps, risk, seniority, velocity]).T
    # synthetic target: effort hours
    y = (
        complexity * 4.0
        + story_points * 1.5
        + deps * 2.0
        + risk * 6.0
        - seniority * 1.0
        + velocity * 0.2
        + rng.normal(0, 3.0, size=n)
    )
    return X, y


def main():
    model_dir = Path(__file__).resolve().parent.parent / "models"
    model_dir.mkdir(parents=True, exist_ok=True)

    X, y = make_dummy_dataset(500)
    model = RandomForestRegressor(n_estimators=50, random_state=42)
    model.fit(X, y)

    out_path = model_dir / "effort_model.pkl"
    joblib.dump(model, out_path)
    print("Saved dummy model to", out_path)


if __name__ == "__main__":
    main()
