# Remaining work

This repository contains a prototype and the first authentication/user backend
module. The following work remains before it meets the full product spec.

## Backend completeness

- [ ] Implement catalog administration: taxes, products/variants, plans,
  payment terms, discounts, and quotation templates (`spec.md` §§6.2–6.3,
  11.3–11.5).
- [ ] Implement customers and the full subscription lifecycle, including
  quotation creation, transitions, plan flags, ownership checks, history, and
  lifecycle jobs (`spec.md` §§6.4, 11.6–11.7).
- [ ] Implement recurring billing, invoice snapshots, taxes/discounts, period
  arithmetic, locking, idempotency, retries, catch-up, and reconciliation
  (`spec.md` §§7–9, 11.7, 11.9).
- [ ] Implement invoice actions/PDF, payment recording and correction, outbox
  delivery, finance reports, audit views, and dashboards (`spec.md` §§6.7–6.8,
  11.8–11.10).
- [ ] Connect the React prototype to the API; its sign-in and records are
  currently client-side only (`spec.md` §15).
- [ ] Remove the client prototype's visible hard-coded demo credentials before
  exposing it beyond local testing.

## Authentication and verification

- [ ] Add automated PostgreSQL/Redis integration coverage for migrations and
  auth endpoints, including verification/reset one-time tokens, refresh
  rotation and reuse, lockout, duplicate signup races, and email outbox
  behavior (`spec.md` §§6.1, 8.10–8.11, 19).
- [ ] Add table-driven RBAC and IDOR tests for all user roles, including
  customer ownership isolation (`spec.md` §§3.3, 12, 19).
- [ ] Add concurrency tests for race-sensitive authentication operations and
  other money/state operations as their modules are implemented (`spec.md`
  §§8, 19).
- [ ] Complete review by another engineer for the auth/user module (definition
  of done in `spec.md` Appendix D).
- [ ] Configure the chosen SMTP provider and exercise real outbox delivery in
  a non-production environment (`spec.md` §16).
- [ ] Add CI that runs the required unit, integration, security, and build
  checks (`spec.md` §§19–20).

## Cleanup

- [ ] Review the trailing whitespace at `spec.md:584`; it was left unchanged
  because the specification is an input document.
- [ ] Revisit demo and development setup before deployment: use isolated test
  databases for migrations and supply all secrets/provider settings through
  environment configuration only.
