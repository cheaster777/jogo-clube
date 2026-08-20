# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

**Clube de Ciências** — educational card game about macroinvertebrates and water quality. React 19 + Vite frontend, an authoritative Node.js/TypeScript API, and a private PostgreSQL database. The frontend does **not** talk to Supabase; `supabase/` only holds reference material for the historical migration off Supabase (see `AGENTS.md`, which is stale — it still describes the old Supabase-only architecture and predates the API/Postgres split described here and in `README.md`).

## Commands

```bash
npm run dev                 # frontend dev server (port 3000), local mode vs bots, no DB needed
npm run lint                 # frontend typecheck (tsc --noEmit)
npm run server:dev           # API dev server (tsx watch)
npm run server:build         # API typecheck (tsc --noEmit -p tsconfig.server.json)
npm test                     # game engine + HTTP contract tests; Postgres optional
npm run test:e2e             # Playwright smoke test of the visual flow
npm run db:migrate           # applies database/migrations/*.sql (needs DATABASE_URL)
```

Single test file: `node --import tsx --test tests/game/rules.test.ts` (swap the path for any file under `tests/`).

Postgres-backed integration tests (`tests/server/postgres.integration.cases.ts`) are skipped unless `TEST_DATABASE_URL` is set — no daemon is assumed by default; contract tests in `tests/server/api.test.ts` run against an in-memory fake `Pool` (see `tests/server/api-harness.ts`) so `npm test` needs no database.

Full stack locally via Docker:
```bash
docker compose --env-file .env.production --profile backend up -d --build
```
The DB container never publishes 5432; the API applies migrations on container start. Never run `docker compose down -v` in production — it deletes the Postgres volume.

## Architecture

**Shared deterministic game engine.** `src/game/` (engine: `rules.ts`, `decks.ts`, `random.ts`, `types.ts`, exported via `index.ts`) is imported by *both* sides:
- `src/game/localAdapter.ts` — thin UI-facing adapter for local/bot play, no network.
- `server/repositories/matches.ts` — imports the same engine (`applyCommand`, `createGame`, `playBotTurn`) directly from `../../src/game` and is the authoritative source of truth for online matches. Command application, RNG (seed + persisted `rngState`), and scoring must produce identical results client- and server-side — same seed + same commands ⇒ same result. Rule quirks (drift/arrasto, exotic fish, empty family deck, tie-breaking by seat id) are documented in `src/game/RULES.md`; the engine binds action effects by stable deck index, never by card title.
- `src/hooks/useServerMatch.ts` + `src/lib/api.ts` drive the online flow: create/join a match, poll `/matches/:id/events`, and post commands — the client never computes authoritative state itself, only optimistic UI.

**API (`server/`)**, mounted under `/api/v1` by `server/app.ts`:
- `server/routes.ts` — all HTTP routes (auth, matches, leaderboard); thin, delegates to `repositories/` and `auth/`.
- `server/repositories/auth.ts`, `server/repositories/matches.ts` — DB access + game-command orchestration, always inside `withTransaction` (`server/db.ts`).
- `server/auth/session.ts` + `server/middleware/auth.ts` — opaque bearer/cookie sessions, not JWT.
- `server/config.ts` — all env vars funnel through `loadConfig()`; add new env vars there, not with scattered `process.env` reads.
- `server/errors.ts` — `AppError` + `asyncHandler` wrap every route; throw `AppError`/helpers (`badRequest`, `unauthorized`, `notFound`, `conflict`) instead of hand-rolling responses.
- Health checks: `GET /health/live` (process) and `GET /health/ready` (DB) — used by ops/monitoring, keep them dependency-light.

**Migrations**: `database/migrations/*.sql`, applied in lexicographic order. Never edit an already-applied migration — add a new one. `scripts/verify-migrations.mjs` checks them.

**Data cutover scripts** (`scripts/import-supabase-users.mjs`, `scripts/import-supabase-export.mjs`): one-shot Supabase→Postgres migration tools with `dry-run`/`verify`/`apply` modes; see `docs/OPERATIONS.md` and `PRD_MIGRATIONS.md` for the full cutover/rollback procedure. Don't treat these as ordinary app code — they're operational tooling with real production data-safety constraints (transaction-wrapped validation, UUID/timestamp preservation, orphan/count checks).

**Mobile**: Capacitor wraps the built web app (`android/`, `capacitor.config.ts`). Android must point at the HTTPS API via `VITE_API_BASE_URL` at build time — never embed admin/secret keys client-side.

## Notes

- `.agent/` is a large generic third-party "Antigravity Kit" agent/skill toolkit, not project-specific documentation — don't treat its `ARCHITECTURE.md` as describing this app.
- `AGENTS.md` at the repo root describes the old pure-Supabase architecture and is out of date relative to `README.md` and the current `server/` code; prefer this file and `README.md`/`docs/` over `AGENTS.md`.
