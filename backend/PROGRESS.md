# Backend progress

## Completed

- **Authentication and accounts (implemented; DB integration validation pending):** implementation covers the documented auth flows and password rules in `spec.md` §6.1 and routes in §11.1. UI workflows are the customer signup/login/reset/profile flows in §13.1 and §14.1.
- **Admin user management (implemented; DB integration validation pending):** implementation covers staff administration in `spec.md` §6.1 and §11.2, used by the admin staff page in §13.3 and §14.3.
- Auth schema extension migration for failed-login lockout, email verification, refresh tokens, idempotency keys, and email outbox is in `sql/0002_auth_hardening.sql`.
- **Catalog API (implemented; database integration validation pending):** taxes, products/variants, plans, payment terms, discounts and quotation templates; role enforcement, staff cost-price redaction, and `If-Match` on the primary update/deactivation routes.
- **Customer API (initial implementation; integration validation pending):** staff CRUD, customer-owned profile, and related-record endpoints. `If-Match` is required for updates.
- **Subscription API (initial implementation; integration validation pending):** create/list/detail, template copying, line editing, state transitions/history, renewal, discount attach/detach/eligibility, preview/generation, and portal-owned list/detail/lifecycle actions. Includes shift/skip pause policy and date filters.
- **Billing/invoice/payment/report API (initial implementation; integration validation pending):** anchored period arithmetic, integer-cent invoice math, catch-up billing, advisory lock/retries, snapshots, discount usage claims, BullMQ scheduler/worker, lifecycle processing, renewal reminders, reconciliation, invoice actions/PDF attachment, idempotent payments, DB overpayment/immutability guards, and finance/audit endpoints.
- Migration `0003_spec_hardening.sql` adds billing/subscription fields, status history, invoice immutability and sum guards, payment guards, lookup indexes, and MRR-view hardening.
- Local run path: `docker compose up --build` from repository root (PostgreSQL, Redis, Mailpit, migrations, API, and BullMQ worker); details in `RUNNING.md`.

## Remaining

- Run PostgreSQL migrations and verify auth endpoints against a real database.
- Add integration tests for refresh rotation/reuse, lockout, signup races, verification/reset single use, RBAC, and email-outbox delivery.
- Complete report filtering/accuracy, validate scheduler and lifecycle behavior, exercise SMTP delivery, and extend idempotency/concurrency coverage to remaining mutation endpoints.
- Add full DB-backed integration, concurrency, RBAC/IDOR, migration, and E2E tests; execute migrations against PostgreSQL and configure SMTP.

## Open questions

- SMTP credentials/provider must be supplied through environment variables before email delivery can run.
- The current frontend has no API integration; endpoint behavior follows `spec.md` §11.
