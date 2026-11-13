from pathlib import Path
from datetime import datetime, timezone
import json, threading
import joblib
import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.preprocessing import OneHotEncoder, StandardScaler
from sklearn.impute import SimpleImputer
from sklearn.pipeline import Pipeline
from sklearn.linear_model import LogisticRegression
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import (
    precision_score,
    recall_score,
    f1_score,
    roc_auc_score,
    confusion_matrix,
)
from sklearn.inspection import permutation_importance
from fastapi import HTTPException
from app.core.config import settings
from app.analytics.metrics import load_frame

CATEGORICAL = ["payer", "specialty", "procedure_category", "diagnosis_category"]
NUMERIC = [
    "amount",
    "authorized",
    "documentation_complete",
    "eligibility_verified",
    "prior_denials",
    "submission_lag",
]
FEATURES = CATEGORICAL + NUMERIC
_lock = threading.Lock()


def features(df):
    d = df.copy()
    d["submission_lag"] = [
        (a - b).days for a, b in zip(d.submission_date, d.service_date)
    ]
    return d[FEATURES]


def artifact_paths():
    folder = Path(settings.artifacts_dir)
    folder.mkdir(parents=True, exist_ok=True)
    return folder / "denial_model.joblib", folder / "evaluation.json"


def evaluate(model, x, y):
    pred = model.predict(x)
    prob = model.predict_proba(x)[:, 1]
    return dict(
        precision=round(precision_score(y, pred, zero_division=0), 4),
        recall=round(recall_score(y, pred, zero_division=0), 4),
        f1=round(f1_score(y, pred, zero_division=0), 4),
        roc_auc=round(roc_auc_score(y, prob), 4),
        confusion_matrix=confusion_matrix(y, pred, labels=[0, 1]).tolist(),
    )


def train(db):
    if not _lock.acquire(blocking=False):
        raise HTTPException(409, "Training is already in progress.")
    try:
        df = load_frame(db)
        df = df[df.adjudicated].sort_values(["submission_date", "id"]).copy()
        if len(df) < 200 or df.was_denied.nunique() < 2:
            raise HTTPException(
                422, "At least 200 adjudicated claims and both outcomes are required."
            )
        dates = sorted(df.submission_date.unique())
        val_date = dates[int(len(dates) * 0.6)]
        test_date = dates[int(len(dates) * 0.8)]
        tr = df.submission_date < val_date
        va = (df.submission_date >= val_date) & (df.submission_date < test_date)
        te = df.submission_date >= test_date
        x = features(df)
        y = df.was_denied.astype(int)
        if any(y[m].nunique() < 2 for m in [tr, va, te]):
            raise HTTPException(
                422,
                "Temporal partitions need both classes. Add more historical records.",
            )
        candidates = {
            "Logistic Regression": LogisticRegression(
                class_weight="balanced", max_iter=600, random_state=42
            ),
            "Random Forest": RandomForestClassifier(
                n_estimators=120,
                max_depth=12,
                min_samples_leaf=12,
                class_weight="balanced",
                random_state=42,
                n_jobs=2,
            ),
        }
        trained = {}
        comparisons = []
        for name, estimator in candidates.items():
            pre = ColumnTransformer(
                [
                    (
                        "categorical",
                        Pipeline(
                            [
                                ("impute", SimpleImputer(strategy="most_frequent")),
                                ("encode", OneHotEncoder(handle_unknown="ignore")),
                            ]
                        ),
                        CATEGORICAL,
                    ),
                    (
                        "numeric",
                        Pipeline(
                            [
                                ("impute", SimpleImputer(strategy="median")),
                                ("scale", StandardScaler()),
                            ]
                        ),
                        NUMERIC,
                    ),
                ]
            )
            model = Pipeline([("preprocess", pre), ("classifier", estimator)])
            model.fit(x[tr], y[tr])
            validation = evaluate(model, x[va], y[va])
            model.fit(x[tr | va], y[tr | va])
            test = evaluate(model, x[te], y[te])
            trained[name] = model
            comparisons.append(
                {"model": name, "validation_roc_auc": validation["roc_auc"], **test}
            )
        best = max(comparisons, key=lambda r: r["validation_roc_auc"])
        model = trained[best["model"]]
        importance = permutation_importance(
            model,
            x[te],
            y[te],
            n_repeats=3,
            random_state=42,
            scoring="roc_auc",
            n_jobs=1,
        )
        imp = sorted(
            [
                {"feature": f, "importance": round(float(v), 5)}
                for f, v in zip(FEATURES, importance.importances_mean)
            ],
            key=lambda r: r["importance"],
            reverse=True,
        )
        report = dict(
            best_model=best["model"],
            models=comparisons,
            feature_importance=imp,
            trained_at=datetime.now(timezone.utc).isoformat(),
            sample_count=len(df),
            train_count=int(tr.sum()),
            validation_count=int(va.sum()),
            test_count=int(te.sum()),
            validation_start=str(val_date),
            test_start=str(test_date),
            split="Chronological 60/20/20 by submission date; model selected using validation ROC-AUC, then refit on train + validation.",
            features=FEATURES,
            threshold=0.5,
            limitations="Synthetic outcomes only. Balanced training changes calibration; scores are experimental estimates, not validated probabilities for real claims. No post-outcome fields are features.",
        )
        path, report_path = artifact_paths()
        joblib.dump(model, path)
        report_path.write_text(json.dumps(report, indent=2))
        return report
    finally:
        _lock.release()


def status():
    _, p = artifact_paths()
    return (
        json.loads(p.read_text())
        if p.exists()
        else {
            "trained": False,
            "message": "Train a model using adjudicated synthetic claims.",
        }
    )


def predict(db, cid):
    path, _ = artifact_paths()
    if not path.exists():
        raise HTTPException(409, "Train a model before requesting a prediction.")
    df = load_frame(db)
    row = df[df.id == cid]
    if row.empty:
        raise HTTPException(404, "Claim not found.")
    model = joblib.load(path)
    x = features(row)
    prob = float(model.predict_proba(x)[0, 1])
    factors = []
    for key in [
        "authorized",
        "documentation_complete",
        "eligibility_verified",
        "prior_denials",
    ]:
        counter = x.copy()
        counter[key] = 0 if key == "prior_denials" else True
        change = prob - float(model.predict_proba(counter)[0, 1])
        if abs(change) > 0.001:
            factors.append(
                {
                    "feature": key,
                    "contribution": round(change * 100, 2),
                    "value": str(x.iloc[0][key]),
                }
            )
    factors.sort(key=lambda f: abs(f["contribution"]), reverse=True)
    actions = []
    for key, action in [
        ("authorized", "Verify prior authorisation."),
        ("documentation_complete", "Complete supporting documentation."),
        ("eligibility_verified", "Confirm eligibility on the service date."),
    ]:
        if not bool(row.iloc[0][key]):
            actions.append(action)
    if not actions:
        actions = ["Review payer-specific requirements before submission."]
    return {
        "claim_id": cid,
        "estimated_risk": round(prob * 100, 1),
        "category": "High" if prob >= 0.65 else "Medium" if prob >= 0.35 else "Low",
        "factors": factors,
        "actions": actions,
        "explanation": "Local sensitivity: change in score when one review feature is set to its favourable value; not causal attribution. Global permutation importance is shown separately.",
        "source": "Synthetic portfolio model",
        "adjudicated": bool(row.iloc[0].adjudicated),
    }
