"""Train an LSTM forecasting model for project slip prediction.

The script generates synthetic weekly project timelines, builds fixed-length
training sequences, trains a stacked LSTM with early stopping, evaluates the
test ROC AUC, and saves a checkpoint consumable by the FastAPI forecasting
service.
"""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
import math
import random
import sys

import numpy as np
import pandas as pd
import torch
from torch import nn
from torch.utils.data import DataLoader, Dataset


ROOT_DIR = Path(__file__).resolve().parents[1]
FORECAST_SERVICE_DIR = ROOT_DIR / "services" / "forecasting"
MODEL_PATH = FORECAST_SERVICE_DIR / "models" / "forecast_model.pt"
FEATURE_NAMES = [
    "completed_points",
    "remaining_points",
    "resource_burn_rate",
    "active_risk_count",
    "team_availability_ratio",
]
SEQUENCE_LENGTH = 8
RANDOM_SEED = 42

if str(FORECAST_SERVICE_DIR) not in sys.path:
    sys.path.insert(0, str(FORECAST_SERVICE_DIR))

from src.lstm_model import ForecastLSTM


@dataclass
class SequenceSample:
    features: np.ndarray
    target: float


class SequenceDataset(Dataset):
    def __init__(self, features: np.ndarray, targets: np.ndarray):
        self.features = torch.tensor(features, dtype=torch.float32)
        self.targets = torch.tensor(targets, dtype=torch.float32)

    def __len__(self) -> int:
        return len(self.targets)

    def __getitem__(self, index: int):
        return self.features[index], self.targets[index]


def set_seed(seed: int) -> None:
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)


def generate_project_timeline(rng: np.random.Generator, project_index: int) -> pd.DataFrame:
    total_days = int(rng.integers(60, 181))
    week_count = max(10, math.ceil(total_days / 7) + 1)
    total_points = float(rng.uniform(120, 360))

    base_progress = total_points / max(week_count - 1, 1)
    completed_points = 0.0
    availability_level = float(np.clip(rng.normal(0.9, 0.07), 0.55, 1.0))
    risk_pressure = float(rng.integers(0, 4))
    rows = []

    for week in range(week_count):
        risk_drift = max(0.0, risk_pressure + 0.12 * week + rng.normal(0, 0.6))
        availability = float(
            np.clip(
                availability_level - 0.012 * week - 0.02 * risk_drift + rng.normal(0, 0.03),
                0.45,
                1.0,
            )
        )
        burn_rate = max(
            0.4,
            base_progress * (0.75 + 0.45 * availability - 0.08 * risk_drift + rng.normal(0, 0.08)),
        )
        completion_gain = max(
            0.0,
            burn_rate * (0.8 + 0.25 * availability - 0.05 * risk_drift + rng.normal(0, 0.08)),
        )
        if week > 0:
            completed_points = min(total_points, completed_points + completion_gain)

        remaining_points = max(total_points - completed_points, 0.0)
        active_risk_count = int(max(0, round(risk_drift + rng.normal(0, 1.0))))

        rows.append(
            {
                "project_id": f"project_{project_index:02d}",
                "week": week,
                "completed_points": completed_points,
                "remaining_points": remaining_points,
                "resource_burn_rate": burn_rate,
                "active_risk_count": active_risk_count,
                "team_availability_ratio": availability,
            }
        )

    return pd.DataFrame(rows)


def build_samples(timelines: list[pd.DataFrame]) -> list[SequenceSample]:
    samples: list[SequenceSample] = []

    for timeline in timelines:
        if len(timeline) < SEQUENCE_LENGTH + 2:
            continue

        for end_index in range(SEQUENCE_LENGTH - 1, len(timeline) - 2):
            window = timeline.iloc[end_index - SEQUENCE_LENGTH + 1 : end_index + 1]
            current = timeline.iloc[end_index]
            future = timeline.iloc[end_index + 2]
            planned_remaining = max(current["remaining_points"] - 2 * current["resource_burn_rate"], 0.0)
            slipped = float(future["remaining_points"] > planned_remaining * 1.10 + 1e-6)
            samples.append(SequenceSample(window[FEATURE_NAMES].to_numpy(dtype=np.float32), slipped))

    return samples


def split_samples(samples: list[SequenceSample], seed: int = RANDOM_SEED):
    rng = np.random.default_rng(seed)
    indices = np.arange(len(samples))
    targets = np.array([sample.target for sample in samples], dtype=np.int32)

    positive_indices = indices[targets == 1]
    negative_indices = indices[targets == 0]
    rng.shuffle(positive_indices)
    rng.shuffle(negative_indices)

    def slice_class(class_indices: np.ndarray):
        total = len(class_indices)
        train_end = max(1, int(round(total * 0.70)))
        val_end = min(total - 1, train_end + max(1, int(round(total * 0.15))))
        if val_end <= train_end:
            val_end = min(total, train_end + 1)
        return class_indices[:train_end], class_indices[train_end:val_end], class_indices[val_end:]

    pos_train, pos_val, pos_test = slice_class(positive_indices)
    neg_train, neg_val, neg_test = slice_class(negative_indices)

    train_indices = np.concatenate([pos_train, neg_train])
    val_indices = np.concatenate([pos_val, neg_val])
    test_indices = np.concatenate([pos_test, neg_test])

    rng.shuffle(train_indices)
    rng.shuffle(val_indices)
    rng.shuffle(test_indices)
    return train_indices, val_indices, test_indices


def stack_samples(samples: list[SequenceSample], indices: np.ndarray):
    features = np.stack([samples[index].features for index in indices]).astype(np.float32)
    targets = np.array([samples[index].target for index in indices], dtype=np.float32)
    return features, targets


def normalize_features(train_features: np.ndarray, *feature_sets: np.ndarray):
    feature_mean = train_features.reshape(-1, train_features.shape[-1]).mean(axis=0)
    feature_std = train_features.reshape(-1, train_features.shape[-1]).std(axis=0)
    feature_std = np.where(feature_std == 0, 1.0, feature_std)

    train_features_norm = (train_features - feature_mean) / feature_std
    normalized_sets = [
        (feature_set - feature_mean) / feature_std
        for feature_set in feature_sets
    ]
    return feature_mean, feature_std, [train_features_norm, *normalized_sets]


def roc_auc_score_manual(targets: np.ndarray, scores: np.ndarray) -> float:
    targets = np.asarray(targets, dtype=np.int32)
    scores = np.asarray(scores, dtype=np.float64)
    positives = targets.sum()
    negatives = len(targets) - positives
    if positives == 0 or negatives == 0:
        return 0.5

    order = np.argsort(scores)
    ranks = np.empty_like(order, dtype=np.float64)
    ranks[order] = np.arange(1, len(scores) + 1, dtype=np.float64)
    positive_rank_sum = ranks[targets == 1].sum()
    auc = (positive_rank_sum - positives * (positives + 1) / 2.0) / (positives * negatives)
    return float(auc)


def train_one_epoch(model: nn.Module, loader: DataLoader, optimizer, criterion, device: torch.device) -> float:
    model.train()
    running_loss = 0.0
    total_items = 0

    for batch_features, batch_targets in loader:
        batch_features = batch_features.to(device)
        batch_targets = batch_targets.to(device)

        optimizer.zero_grad(set_to_none=True)
        predictions = model(batch_features)
        loss = criterion(predictions, batch_targets)
        loss.backward()
        optimizer.step()

        batch_size = batch_targets.size(0)
        running_loss += float(loss.item()) * batch_size
        total_items += batch_size

    return running_loss / max(total_items, 1)


@torch.no_grad()
def evaluate_loss(model: nn.Module, loader: DataLoader, criterion, device: torch.device) -> float:
    model.eval()
    running_loss = 0.0
    total_items = 0

    for batch_features, batch_targets in loader:
        batch_features = batch_features.to(device)
        batch_targets = batch_targets.to(device)
        predictions = model(batch_features)
        loss = criterion(predictions, batch_targets)

        batch_size = batch_targets.size(0)
        running_loss += float(loss.item()) * batch_size
        total_items += batch_size

    return running_loss / max(total_items, 1)


@torch.no_grad()
def predict(model: nn.Module, loader: DataLoader, device: torch.device):
    model.eval()
    probabilities = []
    targets = []

    for batch_features, batch_targets in loader:
        batch_features = batch_features.to(device)
        outputs = model(batch_features)
        probabilities.extend(outputs.cpu().numpy().tolist())
        targets.extend(batch_targets.numpy().tolist())

    return np.asarray(probabilities, dtype=np.float32), np.asarray(targets, dtype=np.float32)


def main() -> None:
    set_seed(RANDOM_SEED)
    rng = np.random.default_rng(RANDOM_SEED)

    timelines = [generate_project_timeline(rng, index) for index in range(40)]
    samples = build_samples(timelines)
    if len(samples) < 10:
        raise RuntimeError("Not enough synthetic samples were generated")

    train_indices, val_indices, test_indices = split_samples(samples)
    train_features, train_targets = stack_samples(samples, train_indices)
    val_features, val_targets = stack_samples(samples, val_indices)
    test_features, test_targets = stack_samples(samples, test_indices)

    feature_mean, feature_std, normalized_sets = normalize_features(
        train_features,
        val_features,
        test_features,
    )
    train_features_norm, val_features_norm, test_features_norm = normalized_sets

    train_loader = DataLoader(SequenceDataset(train_features_norm, train_targets), batch_size=16, shuffle=True)
    val_loader = DataLoader(SequenceDataset(val_features_norm, val_targets), batch_size=16, shuffle=False)
    test_loader = DataLoader(SequenceDataset(test_features_norm, test_targets), batch_size=16, shuffle=False)

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    model = ForecastLSTM(input_dim=len(FEATURE_NAMES), hidden_dim=128, num_layers=2, dropout=0.3).to(device)
    optimizer = torch.optim.Adam(model.parameters(), lr=0.001)
    criterion = nn.BCELoss()

    best_state = None
    best_val_loss = float("inf")
    patience = 10
    stale_epochs = 0

    for epoch in range(80):
        train_loss = train_one_epoch(model, train_loader, optimizer, criterion, device)
        val_loss = evaluate_loss(model, val_loader, criterion, device)
        print(f"Epoch {epoch + 1:02d} | train_loss={train_loss:.4f} | val_loss={val_loss:.4f}")

        if val_loss < best_val_loss - 1e-4:
            best_val_loss = val_loss
            best_state = {key: value.detach().cpu().clone() for key, value in model.state_dict().items()}
            stale_epochs = 0
        else:
            stale_epochs += 1
            if stale_epochs >= patience:
                print(f"Early stopping triggered at epoch {epoch + 1}")
                break

    if best_state is not None:
        model.load_state_dict(best_state)

    probabilities, targets = predict(model, test_loader, device)
    auc = roc_auc_score_manual(targets, probabilities)
    print(f"Test AUC-ROC: {auc:.4f}")

    MODEL_PATH.parent.mkdir(parents=True, exist_ok=True)
    torch.save(
        {
            "state_dict": model.state_dict(),
            "feature_names": FEATURE_NAMES,
            "feature_mean": feature_mean,
            "feature_std": feature_std,
            "sequence_length": SEQUENCE_LENGTH,
            "hidden_dim": 128,
            "num_layers": 2,
            "dropout": 0.3,
            "threshold": 0.45,
            "test_auc": float(auc),
        },
        MODEL_PATH,
    )
    print(f"Saved checkpoint to {MODEL_PATH}")


if __name__ == "__main__":
    main()