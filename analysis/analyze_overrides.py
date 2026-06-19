#!/usr/bin/env python3
"""Aggregate override buckets from exported JSONL or live DB."""

from __future__ import annotations

import argparse
import json
import os
import sys
from collections import defaultdict

try:
    import psycopg2
    import psycopg2.extras
except ImportError:
    psycopg2 = None


def bucket_key(row: dict) -> str:
    features = row.get("features") or {}
    sem = features.get("fieldSemantics") or []
    field_sem = sem[0] if sem else ""
    return "|".join([
        str(row.get("host") or "").lower(),
        str(row.get("category") or "").lower(),
        str(features.get("intent") or "").lower(),
        str(field_sem).lower(),
    ])


def aggregate_rows(rows: list[dict]) -> list[dict]:
    buckets: dict[str, dict] = defaultdict(lambda: {
        "prompts": 0, "overrides": 0, "agrees": 0, "dismissals": 0,
        "host": "", "category": "", "intent": "", "fieldSemantic": "",
    })

    for row in rows:
        if row.get("event_type") != "decision":
            continue
        key = bucket_key(row)
        b = buckets[key]
        features = row.get("features") or {}
        sem = features.get("fieldSemantics") or []
        b["host"] = row.get("host") or ""
        b["category"] = row.get("category") or ""
        b["intent"] = features.get("intent") or ""
        b["fieldSemantic"] = sem[0] if sem else ""

        action = str(row.get("action") or "")
        outcome = str(row.get("outcome") or "")
        if action == "prompt":
            b["prompts"] += 1
        elif action == "dismiss" or outcome == "ignored":
            b["dismissals"] += 1
        elif outcome == "overrode" or action.startswith("ignore"):
            b["overrides"] += 1
        elif outcome == "agreed":
            b["agrees"] += 1

    out = []
    for key, b in buckets.items():
        decisions = b["overrides"] + b["agrees"] + b["dismissals"]
        override_pct = round(100 * b["overrides"] / decisions, 1) if decisions else 0
        out.append({**b, "bucketKey": key, "overridePct": override_pct})
    out.sort(key=lambda x: (-x["overridePct"], -x["prompts"]))
    return out


def load_jsonl(path: str) -> list[dict]:
    rows = []
    with open(path, encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if line:
                rows.append(json.loads(line))
    return rows


def load_db(days: int) -> list[dict]:
    if not psycopg2:
        print("pip install psycopg2-binary", file=sys.stderr)
        sys.exit(1)
    url = os.environ.get("DATABASE_URL")
    if not url:
        print("Set DATABASE_URL", file=sys.stderr)
        sys.exit(1)
    conn = psycopg2.connect(url)
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                """
                SELECT event_at, event_type, category, host, source, action, outcome, confidence, features
                FROM security_events
                WHERE event_type = 'decision' AND event_at >= now() - (%s || ' days')::interval
                UNION ALL
                SELECT event_at, event_type, category, host, source, action, outcome, confidence, features
                FROM platform_decision_events
                WHERE event_type = 'decision' AND event_at >= now() - (%s || ' days')::interval
                """,
                (str(days), str(days)),
            )
            return [dict(row) for row in cur.fetchall()]
    finally:
        conn.close()


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--jsonl", help="Path to export_signals.py output")
    parser.add_argument("--days", type=int, default=30)
    parser.add_argument("--out", default="-")
    args = parser.parse_args()

    rows = load_jsonl(args.jsonl) if args.jsonl else load_db(args.days)
    buckets = aggregate_rows(rows)
    payload = json.dumps({"buckets": buckets, "count": len(buckets)}, indent=2)
    if args.out == "-":
        print(payload)
    else:
        with open(args.out, "w", encoding="utf-8") as fh:
            fh.write(payload)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
