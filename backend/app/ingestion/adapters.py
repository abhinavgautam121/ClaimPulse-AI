"""Authorized integrations are opt-in. Public reference sources never supply private denials."""

import asyncio
from urllib.parse import urlparse
import httpx
from fastapi import HTTPException
from app.core.config import settings

CMS_CATALOG = "https://data.cms.gov/data.json"
NPPES_API = "https://npiregistry.cms.hhs.gov/api/"


async def get_json(url, headers=None, params=None):
    async with httpx.AsyncClient(
        timeout=20, follow_redirects=False, trust_env=True
    ) as client:
        for attempt in range(3):
            response = await client.get(url, headers=headers, params=params)
            if response.status_code == 429 or response.status_code >= 500:
                if attempt == 2:
                    response.raise_for_status()
                try:
                    delay = min(
                        10, float(response.headers.get("Retry-After", 2**attempt))
                    )
                except ValueError:
                    delay = 2**attempt
                await asyncio.sleep(delay)
                continue
            response.raise_for_status()
            return response.json()


async def fhir_rows():
    """Restricted demo adapter: FHIR R4 Claim bundles with explicit synthetic identifiers only."""
    base = settings.fhir_base_url.rstrip("/")
    if not base:
        raise HTTPException(
            409,
            "Set FHIR_BASE_URL and optional FHIR_TOKEN for an authorised synthetic FHIR R4 system.",
        )
    if urlparse(base).scheme != "https":
        raise HTTPException(422, "FHIR endpoint must use HTTPS.")
    url = base + "/Claim?_count=100"
    rows = []
    visited = set()
    for _ in range(100):
        if url in visited:
            raise HTTPException(422, "FHIR pagination loop detected.")
        if (
            urlparse(url).netloc != urlparse(base).netloc
            or urlparse(url).scheme != "https"
        ):
            raise HTTPException(
                422, "FHIR pagination may not leave the configured HTTPS host."
            )
        visited.add(url)
        bundle = await get_json(
            url,
            headers=(
                {"Authorization": "Bearer " + settings.fhir_token}
                if settings.fhir_token
                else {}
            ),
        )
        for entry in bundle.get("entry", []):
            c = entry.get("resource", {})
            if c.get("resourceType") != "Claim":
                continue
            ident = next(
                (
                    v.get("value")
                    for v in c.get("identifier", [])
                    if v.get("system") == "urn:claimpulse:synthetic"
                ),
                None,
            )
            if not ident:
                raise HTTPException(
                    422,
                    "FHIR demo adapter requires urn:claimpulse:synthetic identifiers; clinical data is not accepted.",
                )
            ext = {
                v["url"]: v.get("valueInteger", v.get("valueString"))
                for v in c.get("extension", [])
            }
            patient = c.get("patient", {}).get("reference", "").split("/")[-1]
            rows.append(
                {
                    "id": ident,
                    "patient_id": patient,
                    "payer_id": ext.get("urn:claimpulse:payer-id"),
                    "provider_id": ext.get("urn:claimpulse:provider-id"),
                    "submission_date": c.get("created", "")[:10],
                    "service_date": c.get("billablePeriod", {}).get("start", "")[:10],
                    "amount": c.get("total", {}).get("value"),
                    "status": "Submitted",
                    "synthetic": True,
                }
            )
        url = next(
            (
                link["url"]
                for link in bundle.get("link", [])
                if link.get("relation") == "next"
            ),
            None,
        )
        if not url:
            return rows
    raise HTTPException(
        422, "FHIR maximum 100-page safety limit reached; narrow the source query."
    )


async def cms_reference():
    data = await get_json(CMS_CATALOG)
    # CMS data.json is a complete catalog, not a paged claim stream.
    rows = [
        {
            "title": d.get("title"),
            "identifier": d.get("identifier"),
            "modified": d.get("modified"),
        }
        for d in data.get("dataset", [])[:25]
    ]
    return {
        "source": "CMS public dataset catalog",
        "records": rows,
        "note": "Reference/historical dataset metadata only. No private claim or denial feed.",
    }


async def nppes_reference(skip=0):
    data = await get_json(
        NPPES_API,
        params={
            "version": "2.1",
            "enumeration_type": "NPI-2",
            "organization_name": "Westlake*",
            "limit": 10,
            "skip": skip,
        },
    )
    if data.get("Errors"):
        raise HTTPException(502, "NPPES rejected the reference query.")
    return {
        "source": "NPPES public organisation registry",
        "records": [
            {
                "npi": r.get("number"),
                "organisation": r.get("basic", {}).get("organization_name"),
            }
            for r in data.get("results", [])
        ],
        "next_skip": skip + 10,
        "note": "Public provider references only; not linked to the synthetic claims.",
    }
