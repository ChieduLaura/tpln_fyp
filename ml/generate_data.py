"""Generate synthetic task-level dataset for model training.

Produces ml/data/tasks_training.csv with 2500 rows and specified features.
"""
from pathlib import Path
import numpy as np
import pandas as pd


def sample_complexity(n, seed=None):
    rng = np.random.default_rng(seed)
    choices = np.array([1, 2, 3, 4, 5])
    weights = np.array([0.1, 0.2, 0.35, 0.25, 0.1])
    return rng.choice(choices, size=n, p=weights)


def sample_story_points(complexity, seed=None):
    # Correlate story points with complexity
    rng = np.random.default_rng(seed)
    mapping = {
        1: ([1, 2, 3], [0.6, 0.3, 0.1]),
        2: ([1, 2, 3, 5], [0.4, 0.35, 0.2, 0.05]),
        3: ([2, 3, 5, 8], [0.15, 0.45, 0.3, 0.1]),
        4: ([3, 5, 8, 13], [0.05, 0.35, 0.4, 0.2]),
        5: ([5, 8, 13], [0.1, 0.5, 0.4]),
    }
    out = []
    for c in complexity:
        choices, probs = mapping.get(int(c), ([3, 5], [0.5, 0.5]))
        out.append(int(rng.choice(choices, p=probs)))
    return np.array(out)


def generate(n=2500, seed=42, out_path: Path = None):
    rng = np.random.default_rng(seed)

    complexity = sample_complexity(n, seed=seed)
    story_points = sample_story_points(complexity, seed=seed + 1)

    dependencies = rng.poisson(2.3, size=n)
    dependencies = np.clip(dependencies, 0, 10)

    risk = rng.random(n)

    seniority = rng.uniform(1.0, 5.0, size=n)

    velocity = rng.normal(35, 10, size=n)
    velocity = np.clip(velocity, 10, 60)

    complexity_x_risk = complexity * risk

    # actual_effort_hours: nonlinear formula with noise
    noise = rng.normal(0, 4.0, size=n)
    effort = (
        2.5 * (complexity.astype(float) ** 1.8)
        + 3.0 * dependencies
        + 8.0 * (1.0 - (seniority / 5.0))
        + risk * 15.0
        + story_points * 1.2
        + noise
    )
    effort = np.maximum(effort, 0.1)

    # duration in days with stochastic delay factor
    base_days = effort / (seniority * 1.5)
    delay = rng.normal(1.0, 0.15, size=n)
    delay = np.clip(delay, 0.7, 1.5)
    duration = base_days * delay
    duration = np.clip(duration, 1.0, None)

    df = pd.DataFrame(
        {
            "complexity_score": complexity.astype(int),
            "story_points": story_points.astype(int),
            "number_of_dependencies": dependencies.astype(int),
            "risk_score": risk,
            "team_seniority_avg": seniority,
            "sprint_velocity_last_3": velocity,
            "complexity_x_risk": complexity_x_risk,
            "actual_effort_hours": effort,
            "actual_duration_days": duration,
        }
    )

    if out_path is None:
        out_path = Path(__file__).resolve().parent / "data" / "tasks_training.csv"

    out_path.parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(out_path, index=False)
    print(f"Wrote {len(df)} rows to {out_path}")


if __name__ == "__main__":
    generate()
