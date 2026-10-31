# Backend progress

## Completed

- **Authentication and accounts (implemented; DB integration validation pending):** implementation covers the documented auth flows and password rules in `spec.md` §6.1 and routes in §11.1. UI workflows are the customer signup/login/reset/profile flows in §13.1 and §14.1.
- Verification emails link to the frontend confirmation page, which verifies the one-time token through the API and shows success or an actionable error. Delivery still requires working SMTP configuration.
- **Admin user management (implemented; DB integration validation pending):** implementation covers staff administration in `spec.md` §6.1 and §11.2, used by the admin staff page in §13.3 and §14.3.
- **Workspace reads:** authenticated role-scoped endpoint serves customers, subscriptions, invoices, payments, catalog, discounts, staff, and dashboard data to the frontend.
- **Plans and customer marketplace (initial):** admins can publish plans; customers can request currently available plans. The API creates an invoice and queues an email with payment instructions. UPI is manual/invoice-only, without gateway collection or automatic payment reconciliation.
- Admins can add products, plans, taxes, discounts, and invite staff. Staff/admin can create customers and quotations, confirm quotations into invoices, and record payments. Customer profiles can be edited; customers can pause, resume, or close subscriptions when plan rules permit.
- The demo seed now creates 15 products, 20 plans, 10 sample customers, and subscription/invoice/payment records. It is idempotent and disabled in production.
- Customer, quotation, invoice, payment, catalog, discount, subscription-action, and role-scoped workspace flows have been exercised against the local PostgreSQL database.
- Auth schema extension migration for failed-login lockout, email verification, refresh tokens, idempotency keys, and email outbox is in `sql/0002_auth_hardening.sql`.

## Remaining

- Run PostgreSQL migrations and verify auth endpoints against a real database.
- Add integration tests for refresh rotation/reuse, lockout, signup races, verification/reset single use, RBAC, and email-outbox delivery.
- Implement edits/deactivation for catalog and discount records, recurring billing, and richer subscription/invoice detail workflows.
- Link plans to product lines and apply tax/discount rules automatically during invoice calculation.

## Open questions

- SMTP credentials/provider must be supplied through environment variables before email delivery can run.
- PostgreSQL/Redis integration must be available to sign in and load workspace data.
