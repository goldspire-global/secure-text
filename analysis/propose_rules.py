#!/usr/bin/env python3
"""Generate rule proposal JSON from override bucket analysis."""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path


def propose_from_buckets(buckets: list[dict], min_override: float = 35, min_prompts: int = 3) -> list[dict]:
    proposals = []
    for b in buckets:
        if b.get("overridePct", 0) < min_override:
            continue
        if b.get("prompts", 0) < min_prompts:
            continue
        adjust = -30 if b["overridePct"] >= 60 else -20
        proposals.append({
            "title": f"Lower {b['category']} confidence in {b.get('fieldSemantic') or 'general'} on {b.get('host') or '*'}",
            "proposalType": "confidence_adjust",
            "priority": "high" if b["overridePct"] >= 50 else "normal",
            "suggestedPatch": {
                "type": "learning_hint",
                "hostPattern": b.get("host") or "*",
                "category": b.get("category"),
                "fieldSemantic": b.get("fieldSemantic") or "",
                "intent": b.get("intent") or "",
                "adjustConfidence": adjust,
                "suppress": b["overridePct"] >= 70 and b.get("prompts", 0) >= 5,
            },
            "evidence": b,
        })
    return proposals


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--buckets-json", help="JSON file with buckets array")
    parser.add_argument("--days", type=int, default=30)
    parser.add_argument("--out", default="-")
    args = parser.parse_args()

    if args.buckets_json:
        data = json.loads(Path(args.buckets_json).read_text(encoding="utf-8"))
        buckets = data.get("buckets") or data
    else:
        script = Path(__file__).with_name("analyze_overrides.py")
        proc = subprocess.run(
            [sys.executable, str(script), "--days", str(args.days)],
            capture_output=True,
            text=True,
            check=True,
        )
        buckets = json.loads(proc.stdout).get("buckets", [])

    proposals = propose_from_buckets(buckets)
    payload = json.dumps({"proposals": proposals, "count": len(proposals)}, indent=2)
    if args.out == "-":
        print(payload)
    else:
        Path(args.out).write_text(payload, encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
