# Backend progress

## Completed

- **Authentication and accounts (implemented; DB integration validation pending):** implementation covers the documented auth flows and password rules in `spec.md` §6.1 and routes in §11.1. UI workflows are the customer signup/login/reset/profile flows in §13.1 and §14.1.
- **Admin user management (implemented; DB integration validation pending):** implementation covers staff administration in `spec.md` §6.1 and §11.2, used by the admin staff page in §13.3 and §14.3.
- Auth schema extension migration for failed-login lockout, email verification, refresh tokens, idempotency keys, and email outbox is in `sql/0002_auth_hardening.sql`.

## Remaining

- Run PostgreSQL migrations and verify auth endpoints against a real database.
- Add integration tests for refresh rotation/reuse, lockout, signup races, verification/reset single use, RBAC, and email-outbox delivery.
- Implement catalog, customers, subscriptions, billing, invoices, payments, and reports as separate modules.

## Open questions

- SMTP credentials/provider must be supplied through environment variables before email delivery can run.
- The current frontend has no API integration; endpoint behavior follows `spec.md` §11.
