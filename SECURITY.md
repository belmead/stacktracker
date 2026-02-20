# Security Policy

## Dependency Vulnerability Policy
This repository uses a risk-based dependency policy aligned with enterprise AppSec practice.

1. Release-blocking gate (all dependencies):
- Any `high` or `critical` advisory fails CI.
- Enforced by: `npm audit --audit-level=high`.

2. Release-blocking gate (production dependency graph):
- Any `moderate`/`high`/`critical` advisory in production dependencies fails CI.
- Enforced by: `npm audit --omit=dev --audit-level=moderate`.

3. Dev-only moderate advisory handling:
- Moderate advisories that exist only in development tooling are permitted only with a tracked, time-bound exception.
- Exceptions must be listed in `security/moderate-advisory-exceptions.json` with:
  - owner
  - tracking ticket
  - expiration date
  - rationale
  - compensating controls
- Enforced by: `node scripts/security/enforce-moderate-advisories.mjs`.

## SLA Targets
- `critical`: remediate within 48 hours
- `high`: remediate within 7 days
- `moderate` (production dependencies): remediate within 30 days
- `moderate` (dev-only dependencies): remediate within 90 days

## Exception Process
1. Open/update a security tracking ticket.
2. Add or update the exception entry with expiration date and owner.
3. Document compensating controls.
4. Remove exception once vulnerability is remediated.

Exceptions are temporary and must not be indefinite.

## Review Cadence
- Weekly: dependency triage
- Monthly: security review of open exceptions
- Quarterly: tooling modernization plan (reduce exception inventory)

## CI Implementation
- Workflow: `.github/workflows/security-ci.yml`
- Exception registry: `security/moderate-advisory-exceptions.json`
- Policy enforcement script: `scripts/security/enforce-moderate-advisories.mjs`
