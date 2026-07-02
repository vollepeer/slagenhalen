# Design: Cloud backend migration (Phase 1 of 2)

Branch: `cloud-modernization`

## 0. Context and scope

This app (now named "KaartBuddy"; repo/legacy name "Filip Card" / slagenhalen) currently runs fully offline: a React + MUI client persists everything to browser `localStorage` (`client/src/localApi.ts` + `localStore.ts`). A previous, abandoned attempt at a Node/Express + JSON-file backend exists in `server/` but is dead code — nothing in the running app calls it.

The overall mission has two independent goals:
1. **Move storage to a reliable cloud backend** (Netlify + Supabase), with real backup/disaster-recovery.
2. **Modernize the frontend** (latest React, shadcn/ui, replacing MUI).

These are being sequenced deliberately: **backend first, frontend second**, so each change is independently verifiable and the app is never simultaneously exposed to a new UI and a new data layer. This document covers **Phase 1 only** — the backend/data migration, kept behind the existing MUI UI (with minimal additions: login, sync status). Phase 2 (the shadcn/React rewrite) will get its own spec once Phase 1 has been running reliably in production.

Business rules (players, seasons, events, rounds, ranking, locking, season top-X scoring) are unchanged from `docs/specs.md`, which remains the source of truth for behavior. This document only changes *where and how* that behavior is implemented and stored.

## 1. Architecture

```
┌───────────────────────┐        ┌────────────────────────────┐        ┌─────────────────────┐
│  Client                │        │  Netlify Functions          │        │  Supabase             │
│  (existing MUI React    │  HTTP  │  (thin API layer;            │  HTTP  │  - Postgres (data)    │
│  app, static hosting     │──────▶│  business logic: ranking,    │──────▶│  - Auth (users)       │
│  on Netlify)             │        │  lock rules, validation;      │        │                       │
│                          │        │  service-role Supabase key)  │        │                       │
└───────────────────────┘        └────────────────────────────┘        └─────────────────────┘
        │
        ▼
  local write-queue: optimistic UI update → send → on failure,
  queue in localStorage, retry with backoff, show pending-sync count
```

- **Client**: same MUI UI and component structure as today. `client/src/api.ts` (already an abstraction — currently delegating to `localApi.ts`) is repointed to a real `fetch`-based client hitting Netlify Functions. This is the main reason today's `api.ts`/`localApi.ts` split is valuable: the swap is largely isolated to one module.
- **Resilience layer**: a small wrapper around the API client handles optimistic updates, retry-with-backoff on failure, and a localStorage-backed queue of not-yet-confirmed writes, so brief connectivity drops during an event don't block score entry. This is *not* a full offline-capable rebuild — it assumes the connection returns within the same session (see §3).
- **API layer**: Netlify Functions, grouped by resource (players, seasons, events, participants, ranking/lock). All business logic — ranking calculation, tie detection, lock validation, uniqueness checks — lives here, ported from the existing (dead) `server/src/ranking.ts` and `server/src/validators.ts`, cross-checked against `client/src/localApi.ts` since that's the version that's actually been maintained. Functions use the Supabase **service-role** key; the browser client never talks to Supabase directly. Row Level Security is configured as defense-in-depth, not as the primary access-control mechanism.
- **Data**: Supabase Postgres. Supabase Auth provides login. Free tier (no paid add-ons) — see §4 for why this is fine given the backup approach.

## 2. Data model & migration

No existing data needs to migrate (confirmed: current `localStorage`/`db/data.json` content is disposable test data). Schema is created fresh via versioned SQL migrations in `db/migrations/`, applied with the Supabase CLI (not hand-edited via the dashboard), so every schema change is reviewable and repeatable.

Tables mirror `docs/specs.md` §8 1:1, translated to Postgres conventions:

- `players` — `id bigint generated always as identity primary key`, `name text not null`, unique index on `lower(name)`, `is_archived boolean not null default false`, `created_at`/`updated_at timestamptz not null default now()`.
- `seasons` — `id`, `name text not null`, `top_scores_count integer not null default 7 check (top_scores_count >= 1)`, `start_date date`, `end_date date`, `is_archived boolean not null default false`, timestamps.
- `events` — `id`, `season_id bigint not null references seasons(id)`, `event_date date not null`, `title text`, `notes text`, `prize_rank_1/2/3 integer not null`, `status text not null check (status in ('OPEN','LOCKED'))`, `locked_at timestamptz`, `is_archived boolean not null default false`, timestamps.
- `event_participants` — `id`, `event_id bigint not null references events(id)`, `player_id bigint not null references players(id)`, unique `(event_id, player_id)`, `points_r1/r2/r3 integer check (>= 0)` nullable, timestamps.
- `audit_log` — `id`, `entity_type text`, `entity_id bigint`, `action text`, `old_value jsonb`, `new_value jsonb`, `user_id uuid references auth.users(id)`, `user_email text`, `created_at timestamptz not null default now()`.

DB-level `check`/`unique`/FK constraints exist as a second line of defense behind the Function-level validation — matching the original spec's "validated server-side" requirement, now with two independent enforcement points instead of one.

## 3. Reliability & offline behavior

Confirmed usage pattern: one venue, one device, one operator per event — no concurrent-writer conflicts to design for. Confirmed connectivity: unreliable/unknown, so a safety net is needed, but full offline-capable-for-hours operation is explicitly **not** required (that's a much larger local-first rebuild that isn't justified by the actual usage pattern).

Design:
- Writes apply optimistically to UI state immediately.
- On send failure (network error/timeout), the write is queued in localStorage and retried with exponential backoff while the UI stays interactive.
- A visible status element shows "N wijzigingen wachten op synchronisatie" when the queue is non-empty, and clears once flushed.
- Reads during a drop show last-known state (already in memory/React state) rather than blocking; a manual retry affordance exists if auto-retry is exhausted.
- The server remains authoritative regardless of client optimism: lock validation and ranking are always recomputed server-side on the current DB state, so a stale optimistic client cannot corrupt the locked-event invariant.
- Mutating endpoints are written to tolerate a retried duplicate request (e.g. client retries after a timeout where the first attempt actually succeeded) without double-applying — by checking current state rather than blindly re-applying deltas.

## 4. Backups & disaster recovery

Decision: stay on Supabase's free tier (no point-in-time recovery add-on) and rely on our own scheduled export instead, to keep ongoing cost at zero.

- A shared `runBackupSnapshot()` routine (Netlify Function) reads all tables and writes one timestamped JSON file, committed via the Contents API to a `backups/` folder in the app's existing GitHub repo (`vollepeer/slagenhalen`) — one repo, no separate backup repo to provision or manage access for.
- Triggered on:
  1. A **daily scheduled** Netlify Function (cron).
  2. **Immediately after any event is locked** — the point of highest data value, so a same-day disaster can't lose a just-finished event.
- A documented **restore procedure** (script + runbook) takes a snapshot JSON and repopulates a Supabase project's tables. This procedure is written *and exercised once against a scratch Supabase project* during Phase 1 build-out — restore capability is verified, not assumed.
- Retention: keep all snapshots (they're small JSON, git history is cheap) rather than pruning, at least initially.

## 5. Auth & access

Supabase Auth, email + password (chosen over magic links specifically because login must work reliably right before/during a live event without depending on timely email delivery). One account per named user; no role distinction — any authenticated user has full access, matching the current single-operator trust model extended to a small number of named people. `audit_log.user_id`/`user_email` are now populated on every write, giving a "who did what" trail that didn't meaningfully exist before (today only LOCKED/UNLOCKED actions are logged, with no actor).

## 6. Data management screen

The current "Databeheer" tab (JSON export, bulk import, wipe-all) is kept as-is, functionally, and re-implemented against the new backend instead of `localStorage`:
- **Export** reads the current Supabase data via a Netlify Function and returns the same JSON shape as today.
- **Import** replaces the current dataset from an uploaded JSON file, via a Netlify Function (server-side, using the service-role key — not a direct client-to-Supabase bulk write).
- **Wipe all data** clears all tables via a Netlify Function.

All three remain gated behind login (§5) like the rest of the app, so this isn't an anonymous/public action — just an authenticated one, same trust level as score entry.

Additionally, a **"Download backup nu"** button triggers `runBackupSnapshot()` on demand (in addition to the automatic daily/on-lock triggers in §4), for a manual just-in-case copy separate from the export feature above.

## 7. Testing

- Port the acceptance tests from `docs/specs.md` §12 into a unit-test suite against the Netlify Function business logic (ranking, ties, locking, season ranking). No automated tests exist today; this is new coverage, largely a direct lift since `ranking.ts` already implements the behavior being tested.
- Integration-test the API endpoints against a local Supabase instance (via the Supabase CLI's local dev stack), covering the full HTTP → Function → Postgres path, not just unit-level logic.
- Exercise the backup + restore path at least once end-to-end against a scratch Supabase project before going live (see §4).

## 8. Rollout

1. Build against a fresh Supabase project and a Netlify preview deploy, on this branch.
2. Validate the daily and lock-triggered backup snapshots actually land in the `backups/` folder of the GitHub repo.
3. Do one full restore-from-snapshot dry run against a scratch Supabase project.
4. Only then point the production URL/DNS at the new deployment.
5. Keep the existing offline-packaged build (from the recent Windows packaging branch) available as a manual fallback during the first live cutover event, in case of an unexpected issue.

## 9. Explicitly out of scope for this phase

- Any UI framework change (MUI stays; shadcn/React rewrite is Phase 2, separate spec).
- Multi-device concurrent editing during a single event.
- Full offline-capable operation for an entire event with no connectivity.
- Role-based permissions (all authenticated users are equal).
- Migrating historical data (there is none to migrate).
- Paid Supabase tier / point-in-time recovery.
