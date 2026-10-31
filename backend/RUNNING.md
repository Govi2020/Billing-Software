# Run the backend locally

## Fast path (Docker Compose)

From the repository root, with Docker Compose installed:

```sh
export JWT_SECRET="$(openssl rand -hex 32)"
docker compose up --build
```

In PowerShell, set the same variable before starting Compose:

```powershell
$env:JWT_SECRET = [Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
docker compose up --build
```

Compose starts PostgreSQL, Redis, the Mailpit SMTP sink, applies database
migrations, and then starts the API and background worker.

- API health: <http://localhost:4001/healthz>
- Dependency readiness: <http://localhost:4001/readyz>
- Mailpit inbox: <http://localhost:8025>
- SMTP: `localhost:1025`
- PostgreSQL from the host: `localhost:5433` (Compose maps to container port 5432)
- Redis from the host: `localhost:6380` (Compose maps to container port 6379)

To stop services but retain local database data:

```sh
docker compose down
```

To also remove local PostgreSQL/Redis data:

```sh
docker compose down -v
```

The Compose PostgreSQL password default is for local development only. Set
`POSTGRES_PASSWORD` in the shell if you want a different local value. Never use
the compose default in a shared or production environment.

## Run the API directly

Start PostgreSQL, Redis, and an SMTP sink (or configure a real SMTP provider),
then from `backend/`:

```sh
npm ci
cp .env.example .env
```

Set a random `JWT_SECRET` with at least 32 characters in `.env`, then run:

If using the repository's Compose dependencies from the host, set
`DATABASE_URL=postgres://brightloop:<password>@localhost:5433/brightloop`,
`REDIS_URL=redis://localhost:6380`, and `API_BASE_URL=http://localhost:4001` in
`backend/.env`. Compose host ports can be overridden with `POSTGRES_PORT`,
`REDIS_PORT`, and `API_PORT` in a root-level `.env`.

```sh
npm run db:migrate
npm run dev
```

In a second terminal, run the recurring billing and outbox worker:

```sh
cd backend
npm run worker
```

The API process does not automatically apply migrations. Start it only after
`npm run db:migrate` succeeds.

## Checks

```sh
cd backend
npm test
npm audit --omit=dev
```
