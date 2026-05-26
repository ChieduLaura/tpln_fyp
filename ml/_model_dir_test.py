from pathlib import Path
p = Path(__file__).resolve()
print('file:', p)
model_dir = Path(__file__).resolve().parents[1] / 'services' / 'ai-estimation' / 'models'
print('model_dir:', model_dir)
model_dir.mkdir(parents=True, exist_ok=True)
print('mkdir ok')
