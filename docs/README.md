# Veil documentation

Self-serve guides for customers and runbooks for Goldspire ops.

## Customer-facing (share these links)

| Audience | Guide | When to use |
|----------|--------|-------------|
| **IT admin / team owner** | [ADMIN_GUIDE.md](ADMIN_GUIDE.md) | Create org, policy packs, members, sub-teams, SIEM |
| **Team member** | [MEMBER_GUIDE.md](MEMBER_GUIDE.md) | Install, join, secure/unlock, tokenize |
| **Personal user** | [PERSONAL_GUIDE.md](PERSONAL_GUIDE.md) | No org — passphrase-only setup |
| **Everyone** | [GETTING_STARTED.md](GETTING_STARTED.md) | Which guide to read first |
| **Visual walkthrough** | [screenshots/README.md](screenshots/README.md) | Guide images (popup, copilot, email) |

**Portal pages** (production): `https://join-veil.goldspireventures.com` — install, create, join, admin, pricing, feedback.

## Internal (Goldspire)

| Topic | Doc |
|--------|-----|
| Billing & early access switchover | [BILLING.md](BILLING.md) |
| Platform ops dashboard | [OPS.md](OPS.md) |
| Pre-launch checklist | [MARKET_READY.md](MARKET_READY.md) |
| Manual QA | [MANUAL_TEST.md](MANUAL_TEST.md) |
| Enterprise MDM deploy | [extension/docs/ENTERPRISE.md](../extension/docs/ENTERPRISE.md) |
| API / org provisioning | [extension/docs/ORG_PROVISIONING.md](../extension/docs/ORG_PROVISIONING.md) |

## Support triage (first reply)

1. **Can’t join** → [MEMBER_GUIDE.md](MEMBER_GUIDE.md) + admin added their email? join code active?
2. **Admin locked out** → admin key is one-time; rotate via DB script or create new org (last resort)
3. **Policy not updating** → member reopens extension or wait for sync; check Admin → People → sub-team assignment
4. **Billing** → [BILLING.md](BILLING.md); early access banner on pricing/create
