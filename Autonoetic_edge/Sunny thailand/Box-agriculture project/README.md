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

1. Copy `backend/.env.example` to `backend/.env` and replace the secret.
2. Start PostgreSQL and Redis with `docker compose -f backend/docker-compose.yml up -d postgres redis`.
3. In `backend`, install dependencies and run `uvicorn app.main:app --reload`.
4. In `web`, copy `.env.example` to `.env.local`, run `npm install`, then `npm run dev`.

Run backend tests with `python -m pytest` from `backend`.

