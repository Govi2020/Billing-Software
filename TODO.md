# Remaining work

Run the backend locally with `docker compose up --build` from the repository
root; see `backend/RUNNING.md`. Backend feature modules cover the main API
areas, but do not consider the backend production-ready until the unchecked
database, integration, and security checks below pass.

## Backend completeness

- [ ] Run migration `0003_spec_hardening.sql` and endpoint tests against
  PostgreSQL. This environment does not have PostgreSQL or Docker installed,
  so only syntax, unit, dependency-audit, and HTTP routing smoke checks could
  be run here.
- [ ] Validate the scheduled BullMQ worker, quote expiry/activation/auto-close,
  renewal reminders, and reconciliation against a real PostgreSQL/Redis setup.
- [ ] Complete report filter coverage and verify finance calculations against
  the spec's definitions and seeded scenarios.
- [ ] Exercise PDF invoice email delivery against a test mail server/provider.
- [ ] Extend idempotency and optimistic-concurrency coverage to remaining
  mutation endpoints; run full RBAC/IDOR and race suites.
- [ ] Add automated PostgreSQL/Redis integration coverage for migrations and
  auth endpoints, including verification/reset one-time tokens, refresh
  rotation and reuse, lockout, duplicate signup races, and email outbox
  behavior (`spec.md` §§6.1, 8.10–8.11, 19).
- [ ] Add table-driven RBAC, IDOR and concurrency coverage; complete independent
  auth/user review (`spec.md` §§3.3, 8, 12, 19, Appendix D).
- [x] Add CI workflow and a local Docker Compose run path.
- [ ] Run the CI workflow and verify deployment setup (`spec.md` §§19–20).

## Verification and operations

- [ ] Add PostgreSQL/Redis integration tests for migrations and auth, including
  verification/reset single-use, refresh rotation/reuse, lockout, signup races,
  and outbox behavior (`spec.md` §§6.1, 8.10–8.11, 19).
- [ ] Complete independent auth/user review (spec Appendix D).
- [ ] Add CI for unit/integration/security/build and verify deployment setup
  (`spec.md` §§19–20).

## Cleanup

- [ ] Review the trailing whitespace at `spec.md:584`; it was left unchanged
  because the specification is an input document.
- [ ] Revisit demo and development setup before deployment: use isolated test
  databases for migrations and supply all secrets/provider settings through
  environment configuration only.
