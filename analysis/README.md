# Veil offline analysis

Scripts for the **learning loop** — export, aggregate, propose. Runtime detection does not call these.

## Quick start

```bash
# Refresh queue + auto-proposals on API (needs DATABASE_URL)
npm run learning:analyze

# Export raw signals
npm run learning:export

# Python aggregate (DB or JSONL)
python analysis/analyze_overrides.py --days 30
python analysis/propose_rules.py --days 30

# R alternative
Rscript analysis/aggregate_overrides.R 30
```

## Prerequisites

```bash
pip install psycopg2-binary pandas
export DATABASE_URL="postgresql://..."
```

## Pipeline

1. `export_signals.py` — JSONL from `security_events` + `platform_decision_events`
2. `analyze_overrides.py` — override % per host/category/intent/fieldSemantic bucket
3. `propose_rules.py` — draft `learning_hint` patches (same logic as API `generateLearningProposals`)
4. Ops approves in **Learning tab** → hints land in `platform_learning_hints`

## Example SQL

```sql
SELECT category,
  COUNT(*) FILTER (WHERE action = 'prompt') AS prompts,
  COUNT(*) FILTER (WHERE outcome = 'overrode') AS overrides
FROM security_events
WHERE event_type = 'decision' AND event_at >= now() - interval '30 days'
GROUP BY category
ORDER BY overrides DESC;
```

See [docs/LEARNING_LOOP.md](../docs/LEARNING_LOOP.md).
