# TPLN AI Estimation Service

Lightweight FastAPI service that provides effort and duration estimates for tasks.

Quick start (local venv)

```bash
cd services/ai-estimation
python -m venv .venv
source .venv/bin/activate  # or .venv\\Scripts\\activate on Windows
pip install -r requirements.txt

# create models directory and a dummy model
python scripts/train_dummy_model.py

# run the service
uvicorn main:app --host 0.0.0.0 --port 8001
```

API:
- GET /health
- POST /estimate

The project includes `scripts/train_dummy_model.py` which generates `models/effort_model.pkl` using scikit-learn so the service can run immediately for testing.
