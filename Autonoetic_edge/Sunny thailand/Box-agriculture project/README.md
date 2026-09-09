# Fresh Produce Platform

A modular monolith for the order-to-procurement-to-packing workflow described in
`PRD_BRD_DOCS/PRD_Fresh_Produce_Platform.md`.

## Architecture

- `backend/app/modules`: business capabilities and lifecycle invariants
- `backend/app/api`: FastAPI transport adapters
- `backend/app/models`: SQLAlchemy persistence model
- `web`: Next.js operator portal and packing-floor interface

The two agents are bounded workflow identities. Calculations, state transitions,
packing constraints, and financial gates remain deterministic and auditable.

## Local development

The application uses Supabase for its managed PostgreSQL database. PostgreSQL no
longer runs in the local Docker Compose stack.

1. Create a Supabase project and open **Connect** in its dashboard.
2. Copy the **Session pooler** connection URI. Session mode on port `5432` is the
   safest default for this long-running FastAPI service and works on IPv4 networks.
3. Copy `.env.example` to `.env` at the project root, set
   `SUPABASE_DATABASE_URL` to that URI, and replace `SECRET_KEY`. Percent-encode
   special characters in the database password. Keep `sslmode=require` in the URI.
4. Run `docker compose up --build`. The API applies Alembic migrations to Supabase
   before it starts; Redis remains local.

For development without Docker:

1. Copy `backend/.env.example` to `backend/.env` and add the same Supabase URI.
2. Start Redis with `docker compose up -d redis`.
3. In `backend`, run `python -m pip install --group dev -e .`,
   `alembic upgrade head`, then `uvicorn app.main:app --reload`.
4. In `web`, copy `.env.example` to `.env.local`, run `npm install`, then
   `npm run dev`.

Use Supabase's direct URI for one-off administration tools when IPv6 is available.
If the application is later deployed as serverless workers, use the transaction
pooler on port `6543`; the backend automatically disables its local SQLAlchemy pool
for that mode.

Run backend tests with `python -m pytest` from `backend`.
