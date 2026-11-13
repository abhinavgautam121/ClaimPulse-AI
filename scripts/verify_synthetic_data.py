"""Verify the bundled synthetic dataset using only Python's standard library."""

from __future__ import annotations

import argparse
import csv
import hashlib
import io
import json
import re
import zipfile
from datetime import date
from decimal import Decimal
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEFAULT = ROOT / "data/synthetic/claimpulse_seed_42.zip"


def require(condition: bool, message: str) -> None:
    if not condition:
        raise ValueError(message)


def verify(archive_path: Path = DEFAULT) -> dict:
    with zipfile.ZipFile(archive_path) as archive:
        manifest = json.loads(archive.read("manifest.json"))
        require(manifest["synthetic_only"] is True, "Dataset must be marked synthetic")
        tables = {}
        for table, expected_count in manifest["tables"].items():
            name = table + ".csv"
            content = archive.read(name)
            require(
                hashlib.sha256(content).hexdigest() == manifest["sha256"][name],
                f"Checksum mismatch: {name}",
            )
            rows = list(csv.DictReader(io.StringIO(content.decode("utf-8"))))
            require(len(rows) == expected_count, f"Row count mismatch: {table}")
            tables[table] = rows

    external_manifest = archive_path.with_name("manifest.json")
    if external_manifest.exists():
        external = json.loads(external_manifest.read_text())
        if external.get("archive_file") == archive_path.name:
            require(
                hashlib.sha256(archive_path.read_bytes()).hexdigest()
                == external["archive_sha256"],
                "Archive checksum mismatch",
            )

    claims = {row["id"]: row for row in tables["claims"]}
    require(
        len(claims) == len(tables["claims"]) == 20000,
        "Expected 20,000 unique seeded claims",
    )
    references = {
        name: {r["id"] for r in tables[name]}
        for name in ["patients", "providers", "payers", "procedures", "diagnoses"]
    }
    require(
        len(references["patients"]) == 5000,
        "Expected 5,000 original synthetic patient references",
    )
    require(
        all(re.fullmatch(r"SYN-[0-9]{5}", p) for p in references["patients"]),
        "Unexpected patient reference",
    )
    payments = {cid: Decimal("0") for cid in claims}
    recovered_payments = set()
    for row in tables["payments"]:
        require(row["claim_id"] in claims, "Orphaned payment")
        require(Decimal(row["amount"]) > 0, "Nonpositive payment")
        payments[row["claim_id"]] += Decimal(row["amount"])
        if row["recovered"] == "true":
            recovered_payments.add(row["claim_id"])
    denial_ids = {r["claim_id"] for r in tables["denials"]}
    successful_appeals = {
        r["claim_id"] for r in tables["appeals"] if r["outcome"] == "Successful"
    }
    recovery_events = {
        r["claim_id"] for r in tables["claim_events"] if r["kind"] == "recovered"
    }
    for table in [
        "claim_lines",
        "denials",
        "payments",
        "appeals",
        "underpayments",
        "claim_events",
    ]:
        require(
            all(r["claim_id"] in claims for r in tables[table]),
            f"Orphaned records: {table}",
        )
    for row in tables["claim_lines"]:
        require(row["procedure_id"] in references["procedures"], "Unknown procedure")
        require(row["diagnosis_id"] in references["diagnoses"], "Unknown diagnosis")
    anchor = date.fromisoformat(manifest["date_anchor"])
    for cid, row in claims.items():
        require(row["synthetic"] == "true", f"Claim lacks synthetic marker: {cid}")
        require(row["patient_id"] in references["patients"], f"Unknown patient: {cid}")
        require(row["payer_id"] in references["payers"], f"Unknown payer: {cid}")
        require(
            row["provider_id"] in references["providers"], f"Unknown provider: {cid}"
        )
        amount, paid, adjustment = (
            Decimal(row[k]) for k in ["amount", "paid_amount", "adjustment"]
        )
        require(amount > 0 and paid >= 0 and adjustment >= 0, f"Invalid amount: {cid}")
        require(paid + adjustment <= amount, f"Overbalanced claim: {cid}")
        require(payments[cid] == paid, f"Payment ledger mismatch: {cid}")
        require(
            date.fromisoformat(row["service_date"])
            <= date.fromisoformat(row["submission_date"])
            <= anchor,
            f"Invalid dates: {cid}",
        )
        if row["status"] in ["Paid", "Recovered", "Closed"]:
            require(paid + adjustment == amount, f"Unsettled terminal claim: {cid}")
        if row["status"] in ["Denied", "Appealed", "Recovered"]:
            require(
                cid in denial_ids and bool(row["denial_reason"]),
                f"Missing denial history: {cid}",
            )
        if row["status"] == "Recovered":
            require(
                cid in recovered_payments & successful_appeals & recovery_events,
                f"Missing recovery history: {cid}",
            )
    for row in tables["underpayments"]:
        claim = claims[row["claim_id"]]
        gap = Decimal(claim["expected_reimbursement"]) - Decimal(claim["paid_amount"])
        require(
            gap > 0 and gap == Decimal(row["amount"]),
            "Underpayment calculation mismatch",
        )
    return {
        "status": "verified",
        "seed": manifest["seed"],
        "synthetic_only": True,
        "tables": manifest["tables"],
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--archive", type=Path, default=DEFAULT)
    print(json.dumps(verify(parser.parse_args().archive), indent=2))
