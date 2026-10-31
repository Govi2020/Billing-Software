# Brightloop

Brightloop is a **client-server web application** for subscription management
and recurring billing. It is not a standalone desktop app or a single server
executable:

- The **backend API server** is an Express application. It handles sign-in,
  permissions, database operations, billing workflows, and background jobs.
- The **frontend** is a React/Vite website opened in a browser. During local
  development, Vite runs its own frontend development server.
- **PostgreSQL** stores application and billing data; **Redis** supports
  rate-limiting and shared API state.

Both the backend and frontend servers, plus PostgreSQL and Redis, need to be
running for the local web app to work.

## Features

### Customer portal

- Create an account and sign in without email verification.
- Browse available subscription plans and request subscriptions.
- View active subscriptions, invoices, payment history, past-due balances, and
  upcoming payments.
- Accept quotations, view subscription details, and request eligible renewals.
- Launch a UPI payment app when UPI details are configured.
- Use the explicitly simulated **Trial pay** flow in a demo environment. It
  records a fake payment, updates the invoice, and queues a receipt email; it
  does not transfer money.
- Update profile details and change or reset a password.

### Staff and administration

- Manage customers, subscriptions, products, plans, variants, quotation
  templates, taxes, and discounts.
- Pause, resume, close, and renew eligible subscriptions; review subscription
  history and lines.
- Create, confirm, send, print/save as PDF, remind, and cancel invoices.
- Record full or partial payments, issue receipt emails, and review payment
  history.
- Run recurring billing with catch-up, idempotency, billing-run monitoring,
  and reconciliation.
- Review finance summaries, revenue trends, missing-invoice explanations,
  audit entries, settings, and API/database health.
- Disable customer login access while preserving account history, or use the
  admin's permanent-deletion workflow when appropriate.

### Email and payment notes

- Brevo transactional email is supported; SMTP is an alternative. Configure a
  verified sender to deliver invoices, reminders, password messages, and
  payment receipts.
- UPI links are instructions only. Staff must verify a real transfer and
  record it; the app does not automatically verify bank or UPI payments.
- **Trial pay is not a payment gateway.** Enable it only for demos and never
  use it for production or real payments.

## Requirements

- Node.js 24.x and npm
- PostgreSQL
- Redis

## Run locally

### 1. Start PostgreSQL and Redis

Create a local PostgreSQL database for Brightloop and start both services.

### 2. Configure and run the backend API server

Copy `backend/.env.example` to `backend/.env`. Set the local database and
Redis URLs, and replace `JWT_SECRET` with a private random secret of at least
32 characters. Set a private `DEMO_SEED_PASSWORD` that is at least 9 characters
and includes uppercase, lowercase, and symbol characters. Optionally configure
`PAYMENT_UPI_ID`/`PAYMENT_PAYEE_NAME` and Brevo or SMTP.

The provided example has `DEMO_PAYMENTS_ENABLED=true` for local judge/demo
use. The backend refuses to start in production with this flag enabled. Keep
the flag `false` for a real deployment.

In a terminal:

```sh
cd backend
npm install
npm run db:migrate
npm run seed:demo
npm run dev
```

The API server listens on `http://localhost:4000`. Keep this terminal running.
`npm run start` starts the API without the development file watcher.

`npm run seed:demo` is disabled in production and should only be used with a
disposable demo database. It creates/resets the judge accounts
`admin@brightloop.test`, `staff@brightloop.test`, and
`customer@brightloop.test`; all use the password you set in
`DEMO_SEED_PASSWORD`. It also prepares sample subscription and billing records
for dashboard views. The seed script does not print the password.

### 3. Run the frontend website

In another terminal, copy `client/.env.example` to `client/.env` and run:

```sh
cd client
npm install
npm run dev
```

Open the local URL printed by Vite (normally `http://localhost:5173`). Leave
the backend and frontend terminals running while using the site. The client
uses `http://localhost:4000/api/v1` by default; change `VITE_API_URL` in
`client/.env` only when your API runs elsewhere.

### 4. Email setup (optional)

For Brevo, set `BREVO_API_KEY` and `BREVO_SENDER_EMAIL` (an address/domain
verified in Brevo) in `backend/.env`; `BREVO_SENDER_NAME` is optional. SMTP
fallback settings are `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`,
and `SMTP_FROM`. Restart the backend after changing environment settings.
Delivery status and failures are recorded in the `email_outbox` table.

## Checks

```sh
cd backend
npm test
```

```sh
cd client
npm run build
```

See [backend/API_CONTRACT.md](./backend/API_CONTRACT.md) for API routes and
[backend/PROGRESS.md](./backend/PROGRESS.md) for implementation status and
known limitations. Never commit `.env` files or put real credentials in demo
configuration.
