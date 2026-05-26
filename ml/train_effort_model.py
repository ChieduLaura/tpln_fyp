"""Train an XGBoost model to predict `actual_effort_hours`.

Steps:
- Load ml/data/tasks_training.csv
- Split 70/15/15 stratified on `complexity_score`
- StandardScale continuous features (keep `complexity_x_risk`)
- Optuna tuning (50 trials) to minimize MAE on validation set
- Train final model, evaluate on test set, save model and scaler
- Log params/metrics/artifacts to MLflow under experiment `effort_estimation`
"""
from pathlib import Path
import os
import joblib
import logging

import numpy as np
import pandas as pd

from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score

import xgboost as xgb
import optuna
import mlflow


LOG = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)


DATA_PATH = Path(__file__).resolve().parent / "data" / "tasks_training.csv"
MODEL_DIR = Path(__file__).resolve().parents[1] / "services" / "ai-estimation" / "models"
MODEL_PATH = MODEL_DIR / "effort_model.pkl"
SCALER_PATH = MODEL_DIR / "scaler.pkl"


def load_data(path: Path = DATA_PATH):
    df = pd.read_csv(path)
    return df


def split_data(df: pd.DataFrame, seed: int = 42):
    features = [
        "complexity_score",
        "story_points",
        "number_of_dependencies",
        "risk_score",
        "team_seniority_avg",
        "sprint_velocity_last_3",
        "complexity_x_risk",
    ]
    X = df[features]
    y = df["actual_effort_hours"]

    # First split: train (70%) and temp (30%) stratified on complexity_score
    X_train, X_temp, y_train, y_temp = train_test_split(
        X,
        y,
        test_size=0.30,
        stratify=X["complexity_score"],
        random_state=seed,
    )

    # Second split: split temp into val and test (each 15% overall)
    X_val, X_test, y_val, y_test = train_test_split(
        X_temp,
        y_temp,
        test_size=0.5,
        stratify=X_temp["complexity_score"],
        random_state=seed,
    )

    return X_train.reset_index(drop=True), X_val.reset_index(drop=True), X_test.reset_index(drop=True), y_train.reset_index(drop=True), y_val.reset_index(drop=True), y_test.reset_index(drop=True)


def fit_scaler(X_train: pd.DataFrame, continuous_cols):
    scaler = StandardScaler()
    scaler.fit(X_train[continuous_cols])
    return scaler


def transform_X(X: pd.DataFrame, scaler: StandardScaler, continuous_cols, keep_cols):
    X_scaled = X.copy()
    X_scaled[continuous_cols] = scaler.transform(X[continuous_cols])
    # Ensure ordering
    return X_scaled[keep_cols].values


def objective(trial, X_train_arr, y_train_arr, X_val_arr, y_val_arr, seed=42):
    params = {
        "n_estimators": trial.suggest_int("n_estimators", 50, 500),
        "max_depth": trial.suggest_int("max_depth", 3, 8),
        "learning_rate": trial.suggest_float("learning_rate", 0.01, 0.3, log=True),
        "subsample": trial.suggest_float("subsample", 0.6, 1.0),
        "colsample_bytree": trial.suggest_float("colsample_bytree", 0.6, 1.0),
        "random_state": seed,
        "verbosity": 0,
        "objective": "reg:squarederror",
    }

    model = xgb.XGBRegressor(**params)

    model.fit(
        X_train_arr,
        y_train_arr,
        eval_set=[(X_val_arr, y_val_arr)],
        verbose=False
    )

    preds = model.predict(X_val_arr)
    mae = mean_absolute_error(y_val_arr, preds)
    return mae


def run_optuna(X_train_arr, y_train_arr, X_val_arr, y_val_arr, n_trials=50, seed=42):
    sampler = optuna.samplers.TPESampler(seed=seed)
    study = optuna.create_study(direction="minimize", sampler=sampler)

    func = lambda trial: objective(trial, X_train_arr, y_train_arr, X_val_arr, y_val_arr, seed=seed)

    study.optimize(func, n_trials=n_trials)
    return study


def train_final_and_eval(best_params, X_train_val, y_train_val, X_test, y_test):
    params = best_params.copy()
    params.update({"objective": "reg:squarederror", "verbosity": 0})
    model = xgb.XGBRegressor(**params)
    model.fit(X_train_val, y_train_val, verbose=False)

    preds = model.predict(X_test)
    mae = mean_absolute_error(y_test, preds)
    rmse = np.sqrt(mean_squared_error(y_test, preds))
    r2 = r2_score(y_test, preds)
    return model, mae, rmse, r2


def main(seed: int = 42):
    df = load_data()
    X_train, X_val, X_test, y_train, y_val, y_test = split_data(df, seed=seed)

    # Columns configuration
    keep_cols = [
        "complexity_score",
        "story_points",
        "number_of_dependencies",
        "risk_score",
        "team_seniority_avg",
        "sprint_velocity_last_3",
        "complexity_x_risk",
    ]

    # Treat continuous columns to be scaled (keep complexity_score unscaled)
    continuous_cols = [
        "story_points",
        "number_of_dependencies",
        "risk_score",
        "team_seniority_avg",
        "sprint_velocity_last_3",
        "complexity_x_risk",
    ]

    scaler = fit_scaler(X_train, continuous_cols)

    X_train_arr = transform_X(X_train, scaler, continuous_cols, keep_cols)
    X_val_arr = transform_X(X_val, scaler, continuous_cols, keep_cols)
    X_test_arr = transform_X(X_test, scaler, continuous_cols, keep_cols)

    # Optuna tuning
    LOG.info("Starting Optuna study (50 trials)")
    study = run_optuna(X_train_arr, y_train.values, X_val_arr, y_val.values, n_trials=50, seed=seed)
    LOG.info(f"Best MAE (val): {study.best_value:.4f}")
    LOG.info(f"Best params: {study.best_params}")

    # Train final model on train+val
    X_train_val = np.vstack([X_train_arr, X_val_arr])
    y_train_val = np.concatenate([y_train.values, y_val.values])

    final_model, mae, rmse, r2 = train_final_and_eval(study.best_params, X_train_val, y_train_val, X_test_arr, y_test.values)

    print(f"Test MAE: {mae:.4f}")
    print(f"Test RMSE: {rmse:.4f}")
    print(f"Test R2: {r2:.4f}")

    # Save artifacts
    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    joblib.dump(final_model, MODEL_PATH)
    joblib.dump(scaler, SCALER_PATH)
    LOG.info(f"Saved model to {MODEL_PATH}")
    LOG.info(f"Saved scaler to {SCALER_PATH}")

    # Log to MLflow
    mlflow.set_experiment("effort_estimation")
    with mlflow.start_run():
        # log best params
        mlflow.log_params({k: float(v) if isinstance(v, (int, float)) else v for k, v in study.best_params.items()})
        # log metrics
        mlflow.log_metric("test_mae", float(mae))
        mlflow.log_metric("test_rmse", float(rmse))
        mlflow.log_metric("test_r2", float(r2))
        # log artifacts
        mlflow.log_artifact(str(MODEL_PATH))
        mlflow.log_artifact(str(SCALER_PATH))


if __name__ == "__main__":
    main()
