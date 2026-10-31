# Backend progress

## Implemented

- Signup, login, refresh/logout, email verification, password reset/change, staff invitations, role-scoped access, and durable email outbox delivery. Brevo's transactional API is used when configured; SMTP remains a fallback.
- Role-scoped workspace reads, customer marketplace, subscription quotations, product variants, editable quotation templates and subscription lines, subscription detail/status history, customer quote acceptance, and renewals.
- Admin/staff controls for pausing, resuming, closing subscriptions; editing/deactivating catalog and discount records; invoice confirmation, cancellation, email, reminders, print/PDF, payment recording, and payment receipts.
- Recurring billing with scheduled/manual runs, catch-up, advisory locking, per-subscription transactions, billing-run history/status/errors, renewal and overdue reminders, and reconciliation checks. Non-auto-closing plans continue billing; auto-close plans are billed through their expiry before closure.
- Invoice tax on configured product lines and eligible active discount rules, with integer-cent arithmetic and invoice snapshots. Product-scoped discounts are limited to their configured products; subscription-scoped rules apply to the subscription unless specifically assigned elsewhere.
- Admin settings, audit log, Postgres/Redis health checks, customer account deactivation that preserves financial history, and a statistics page with missing-invoice explanations, revenue growth, and billing monitoring.
- Focused unit coverage for invoice math and monthly/yearly date anchoring.

## Validation status

- Frontend production build passes.
- Backend unit tests pass; JavaScript syntax checks and `git diff --check` pass.
- The new subscription/billing migration has **not** been applied to a database in this work. New DB-backed routes, migration behavior, scheduler concurrency, and email delivery still need integration testing against PostgreSQL/Redis.

## Remaining / limitations

- UPI is an instruction-only payment method. There is no payment gateway, bank integration, automatic payment matching, or automatic payment confirmation.
- PDF output uses the browser's print / save-as-PDF flow; the server does not generate PDFs or attach them to email.
- Tax is based on configured product-line tax rules; jurisdiction, exemption, tax registration, and tax reporting logic are not implemented. Plans without product lines have no plan-level tax configuration.
- Statistics show recorded cash collections and month-over-month growth, not historical MRR snapshots, churn, cohort retention, or company valuation.
- Invoice cancellation does not provide a dedicated reissue workflow. Admin account deactivation preserves history; hard deletion and account reactivation are not exposed in the customer list.
- Health checks cover Postgres and Redis; audit and billing histories are bounded, and broad data pagination/performance tuning remains.
- Apply `backend/sql/0003_subscription_billing_features.sql` with `npm run db:migrate` before using the new workflows. Then validate billing, discounts, pause/resume policy, account controls, and outbox delivery against the target database.
- Comprehensive API integration, concurrency, end-to-end, accessibility, and security testing remains.

## Configuration and operational notes

- Email needs `BREVO_API_KEY` and a verified `BREVO_SENDER_EMAIL`, or SMTP fallback configuration.
- UPI instructions are optional and use `PAYMENT_UPI_ID` and `PAYMENT_PAYEE_NAME`.
- `BUSINESS_TIMEZONE` controls scheduled billing and reminders; it defaults to `Asia/Kolkata`.
- `npm run seed:demo` is explicit, repeatable, and disabled in production. It reads `DEMO_SEED_PASSWORD` from the backend environment and never prints it.
