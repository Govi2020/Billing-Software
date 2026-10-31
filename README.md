# Billing-Software

## Brightloop subscription management prototype

The React prototype is in `client/`. Start the local development server with:

```sh
cd client
npm install
npm run dev
```

This frontend currently uses client-side prototype authentication and demo
records; it is not connected to the backend or database.

The Express API is in `backend/`. See `backend/PROGRESS.md` and
`backend/API_CONTRACT.md` for backend implementation status and routes. Demo
accounts are created only by the explicit `npm run seed:demo` command and read
their password from `DEMO_SEED_PASSWORD`; the seed script never prints it.

For a local backend, create a PostgreSQL database, copy `backend/.env.example`
to `backend/.env`, set a private `JWT_SECRET` (at least 32 characters), database
and Redis URLs, frontend/API URLs, SMTP settings, and a private
`DEMO_SEED_PASSWORD`. Then run:

```sh
cd backend
npm install
npm run db:migrate
npm run seed:demo
npm run dev
```

`db:migrate` applies `schema_new.sql` and the backend auth extension to a fresh
database. Do not commit `.env` or share demo passwords.
