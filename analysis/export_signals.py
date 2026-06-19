#!/usr/bin/env python3
"""Export Veil decision telemetry for offline learning analysis (metadata only)."""

from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import datetime, timedelta, timezone

try:
    import psycopg2
    import psycopg2.extras
except ImportError:
    print("Install psycopg2-binary: pip install psycopg2-binary", file=sys.stderr)
    sys.exit(1)


QUERY = """
SELECT
  event_at,
  event_type,
  category,
  severity,
  host,
  source,
  action,
  confidence,
  features,
  org_id,
  device_id
FROM security_events
WHERE event_at >= %s
  AND event_type IN ('decision', 'detection', 'action')
ORDER BY event_at ASC
"""


def main() -> int:
    parser = argparse.ArgumentParser(description="Export Veil security_events for analysis")
    parser.add_argument("--days", type=int, default=30, help="Lookback window (default 30)")
    parser.add_argument("--out", required=True, help="Output JSONL path")
    parser.add_argument("--org-id", default="", help="Optional org filter")
    args = parser.parse_args()

    database_url = os.environ.get("DATABASE_URL")
    if not database_url:
        print("Set DATABASE_URL", file=sys.stderr)
        return 1

    since = datetime.now(timezone.utc) - timedelta(days=max(1, args.days))

    conn = psycopg2.connect(database_url)
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            if args.org_id:
                cur.execute(
                    QUERY.replace("ORDER BY", "AND org_id = %s ORDER BY"),
                    (since, args.org_id),
                )
            else:
                cur.execute(QUERY, (since,))

            count = 0
            with open(args.out, "w", encoding="utf-8") as fh:
                for row in cur:
                    record = dict(row)
                    if record.get("event_at"):
                        record["event_at"] = record["event_at"].isoformat()
                    fh.write(json.dumps(record, default=str) + "\n")
                    count += 1
    finally:
        conn.close()

    print(f"Wrote {count} rows to {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
