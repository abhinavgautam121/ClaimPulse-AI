import re
from datetime import date, timedelta
import httpx
from starlette.concurrency import run_in_threadpool
from app.core.config import settings
from app.analytics.metrics import (
    load_frame,
    summarize,
    reason_breakdown,
    payer_breakdown,
    worklist,
    records,
)

INTENTS = [
    "denial_reasons",
    "payer_denials",
    "aged_claims",
    "revenue_risk",
    "priority",
    "denial_change",
    "unknown",
]


async def detect(question):
    q = question.lower()
    if (
        settings.ai_provider == "openai-compatible"
        and settings.ai_base_url
        and settings.ai_api_key
    ):
        try:
            async with httpx.AsyncClient(timeout=15) as client:
                response = await client.post(
                    settings.ai_base_url.rstrip("/") + "/chat/completions",
                    headers={"Authorization": "Bearer " + settings.ai_api_key},
                    json={
                        "model": settings.ai_model,
                        "temperature": 0,
                        "messages": [
                            {
                                "role": "system",
                                "content": "Classify the analytics question. Respond with exactly one intent: "
                                + ",".join(INTENTS)
                                + ". Do not return SQL or numbers.",
                            },
                            {"role": "user", "content": question},
                        ],
                    },
                )
                response.raise_for_status()
                result = response.json()["choices"][0]["message"]["content"].strip()
                if result in INTENTS:
                    return result, "configured AI intent classifier"
        except (httpx.HTTPError, KeyError, ValueError):
            pass
    if "chang" in q or "trend" in q:
        intent = "denial_change"
    elif "reason" in q or "root cause" in q:
        intent = "denial_reasons"
    elif "payer" in q or "insurer" in q:
        intent = "payer_denials"
    elif "90" in q or "overdue" in q or "aging" in q or "ageing" in q:
        intent = "aged_claims"
    elif "risk" in q:
        intent = "revenue_risk"
    elif any(
        v in q for v in ["priority", "prioritis", "prioritiz", "review", "high-value"]
    ):
        intent = "priority"
    else:
        intent = "unknown"
    return intent, "deterministic approved-query fallback"


async def answer(db, question, start, end):
    intent, engine = await detect(question)
    return await run_in_threadpool(
        calculate_answer, db, question, start, end, intent, engine
    )


def calculate_answer(db, question, start, end, intent, engine):
    df = load_frame(db, start, end)
    k = summarize(df)
    evidence = []
    links = []
    if df.empty:
        text = "No records are available for this period. Choose a wider date range or ingest synthetic claims."
    elif intent == "denial_reasons":
        evidence = reason_breakdown(df)[:3]
        text = (
            "The top denial reasons by denied expected reimbursement are "
            + ", ".join(
                f'{r["reason"]}: ${r["amount"]:,.2f} ({r["count"]:,} claims)'
                for r in evidence
            )
            + "."
            if evidence
            else "There are no historical denials in this period."
        )
    elif intent == "payer_denials":
        evidence = sorted(
            [r for r in payer_breakdown(db, df) if r["sufficient_data"]],
            key=lambda r: r["denial_rate"],
            reverse=True,
        )[:3]
        text = (
            f'{evidence[0]["payer"]} has the highest observed denial rate at {evidence[0]["denial_rate"]:.2f}%, across {evidence[0]["adjudicated_claims"]:,} adjudicated claims.'
            if evidence
            else "No payer has at least 30 adjudicated claims in this period; a comparison would be unreliable."
        )
        evidence = [
            {
                key: r[key]
                for key in [
                    "payer",
                    "denial_rate",
                    "denied_claims",
                    "adjudicated_claims",
                ]
            }
            for r in evidence
        ]
    elif intent == "aged_claims":
        aged = df[(df.outstanding > 0) & (df.days_outstanding > 90)].sort_values(
            "outstanding", ascending=False
        )
        text = f"{len(aged):,} claims have been outstanding for more than 90 days, with ${aged.outstanding.sum():,.2f} in net outstanding balances. Showing the 10 largest."
        evidence = records(
            aged.head(10), ["id", "payer", "outstanding", "days_outstanding"]
        )
        links = [r["id"] for r in evidence]
    elif intent == "revenue_risk":
        text = f'${k["revenue_at_risk"]:,.2f} is flagged for review: outstanding balances on denied/appealed claims or claims aged over 90 days. This is review exposure, not a probability of loss.'
        evidence = [
            {"metric": "Revenue at risk", "amount": k["revenue_at_risk"]},
            {"metric": "Total outstanding", "amount": k["outstanding"]},
        ]
    elif intent == "priority":
        data = worklist(db, df, 5)
        links = [r["id"] for r in data]
        evidence = [
            {
                key: r[key]
                for key in [
                    "id",
                    "payer",
                    "outstanding",
                    "score",
                    "priority",
                    "recommendation",
                ]
            }
            for r in data
        ]
        text = (
            f'The worklist prioritises {len(data)} claims using amount, age, denial status, deadline and historical recovery. Review {data[0]["id"]} first (${data[0]["outstanding"]:,.2f}, score {data[0]["score"]}/100).'
            if data
            else "No outstanding claims need review in this period."
        )
    elif intent == "denial_change":
        days = (end - start).days + 1
        previous = summarize(
            load_frame(db, start - timedelta(days=days), start - timedelta(days=1))
        )
        change = k["denial_rate"] - previous["denial_rate"]
        text = f'The observed denial rate is {k["denial_rate"]:.2f}%, a {abs(change):.2f} percentage point {"increase" if change>=0 else "decrease"} from the immediately preceding {days}-day period.'
        if not previous["adjudicated_claims"]:
            text = "The previous period has no adjudicated records; a denial-rate change cannot be calculated."
        evidence = [
            {
                "period": "Selected",
                "denial_rate": k["denial_rate"],
                "adjudicated": k["adjudicated_claims"],
            },
            {
                "period": "Previous",
                "denial_rate": previous["denial_rate"],
                "adjudicated": previous["adjudicated_claims"],
            },
        ]
    else:
        text = "I can answer approved questions about denial reasons, payer denial rates, claims aged over 90 days, revenue at risk, worklist priorities and denial-rate changes. I cannot execute arbitrary SQL or make medical, coding or coverage decisions."
    return {
        "answer": text,
        "intent": intent,
        "engine": engine,
        "period": {"start": start, "end": end, "basis": "claim submission date"},
        "evidence": evidence,
        "claim_links": links,
        "source": "PostgreSQL · synthetic records",
        "record_count": len(df),
    }
