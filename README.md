# Billing-Software

## Brightloop subscription management prototype

The React prototype is in `client/`. Start the local development server with:

```sh
cd client
npm install
npm run dev
```

The frontend authenticates against the backend and loads workspace records
from PostgreSQL through the role-scoped `/api/v1/workspace` endpoint. Set
`VITE_API_URL` in the client environment only if the API is not at
`http://localhost:4000/api/v1`.

Customers can create accounts from the sign-in screen; they must verify their
email before signing in. Staff and admin accounts are provisioned by an admin.
For local verification links, set `APP_BASE_URL` to the frontend origin and
configure `SMTP_HOST`, `SMTP_FROM`, and any required SMTP credentials in the
backend environment. Signup emails are delivered by the backend outbox worker.
For invoice payment instructions, optionally configure `PAYMENT_UPI_ID` and
`PAYMENT_PAYEE_NAME`. This MVP does not collect payments or automatically
verify UPI transfers.

The Express API is in `backend/`. See `backend/PROGRESS.md` and
`backend/API_CONTRACT.md` for backend implementation status and routes. Demo
accounts are created only by the explicit `npm run seed:demo` command and read
their password from `DEMO_SEED_PASSWORD`; the seed script never prints it.
The same command seeds a repeatable sample catalog and customer billing history
for exercising the role-specific dashboards; it is disabled in production.

For a local backend, create a PostgreSQL database and `backend/.env` with
`DATABASE_URL`, `REDIS_URL`, `FRONTEND_ORIGIN`, `APP_BASE_URL`, `API_BASE_URL`,
a private `JWT_SECRET` (at least 32 characters), and a private
`DEMO_SEED_PASSWORD`. Configure SMTP settings if email delivery is needed.
Then run:

```sh
cd backend
npm install
npm run db:migrate
npm run seed:demo
npm run dev
```

`db:migrate` applies `schema_new.sql` and the backend auth extension to a fresh
database. Do not commit `.env` or share demo passwords.
