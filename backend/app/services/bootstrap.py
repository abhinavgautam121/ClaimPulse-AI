from pathlib import Path
from app.services.seed import seed
from app.core.config import settings
from app.core.database import SessionLocal
from app.ml.engine import artifact_paths, train

if __name__ == "__main__":
    print(seed(settings.seed_count))
    model, _ = artifact_paths()
    if not model.exists():
        with SessionLocal() as db:
            report = train(db)
            print("Trained synthetic demonstration model:", report["best_model"])
