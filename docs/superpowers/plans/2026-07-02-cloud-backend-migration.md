# Cloud Backend Migration (Phase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace KaartBuddy's browser-localStorage data layer with Supabase (Postgres + Auth) behind Netlify Functions, keeping the existing MUI UI, and add automated GitHub-committed backups — without changing any business rule in `docs/specs.md`.

**Architecture:** A single Netlify Function (`netlify/functions/api.ts`, path `/api/*`) holds all business logic (ranking, lock validation, uniqueness checks) ported from the dead `server/src/` code and the maintained `client/src/localApi.ts`, talking to Supabase Postgres via the service-role key. The client keeps its current MUI pages, swaps `client/src/api.ts` from localStorage to real `fetch` calls, adds a Supabase Auth login screen, and adds a localStorage-backed retry queue for transient network drops. A second scheduled Netlify Function commits daily (and post-lock) JSON snapshots to a dedicated `backups` branch of the app's own GitHub repo.

**Tech Stack:** TypeScript, Supabase (Postgres + Auth + CLI), Netlify Functions v2, Vitest, existing React 18 + MUI 5 client (unchanged in this phase), `@supabase/supabase-js`, zod.

## Global Constraints

- All UI text stays Dutch, including new login/sync-status copy (per `docs/specs.md` §7 and the approved design).
- Business rules (max 60 participants, unique player names, `topScoresCount >= 1`, NULL = unknown score, lock requires all scores known, top-X season ranking) are unchanged from `docs/specs.md` — only their implementation location changes.
- Server-side validation is authoritative regardless of client state (design §3).
- No role-based permissions — every authenticated user has full access (design §5).
- No historical data migration is needed — schema starts empty (design §2).
- Backups commit to the **same** GitHub repo (`vollepeer/slagenhalen`), in a `backups/` folder on a dedicated `backups` branch — never the branch Netlify deploys from (design §4, revised).
- Databeheer keeps export, bulk import, and wipe-all functionally as they exist today, re-implemented against the new backend (design §6, revised).
- Supabase stays on the free tier; no paid PITR add-on (design §4).

---

### Task 1: Manual cloud environment setup

**Files:** none (manual/dashboard steps producing config values used by later tasks).

**Interfaces:**
- Produces: a Supabase project (URL, anon key, service-role key), a linked Netlify site, a GitHub PAT with contents read/write on `vollepeer/slagenhalen`, an orphan `backups` branch on that repo, and at least one named Supabase Auth user — all referenced by later tasks' env vars.

- [x] **Step 1: Create the Supabase project**

Via the Supabase dashboard, create a new project (name: `kaartbuddy`, choose a region close to the venue). From Project Settings → API, note down:
- `Project URL` → will become `SUPABASE_URL`
- `anon public` key → will become `VITE_SUPABASE_ANON_KEY`
- `service_role` key → will become `SUPABASE_SERVICE_ROLE_KEY` (never expose this to the client)

- [x] **Step 2: Install and link the Supabase CLI**

```bash
brew install supabase/tap/supabase
supabase login
```

(Linking to the project happens in Task 2 once `supabase init` has created the local project folder.)

- [x] **Step 3: Create and link the Netlify site**

```bash
npm install -g netlify-cli
netlify login
netlify init
```

Choose "Create & configure a new site", connect it to the `vollepeer/slagenhalen` GitHub repo, and set the initial deploy branch to `cloud-modernization` (switch to `main` at cutover in Task 16).

- [ ] **Step 4: Create a GitHub PAT for backups** — *deferred, not a current priority (2026-08-11); do manually before starting Task 11*

Create a fine-grained Personal Access Token scoped only to `vollepeer/slagenhalen` with **Contents: Read and write** permission. Save the token value — it becomes `GITHUB_TOKEN` in `netlify/.env` (currently left blank).

- [ ] **Step 5: Create the dedicated `backups` branch** — *deferred, not a current priority (2026-08-11); do manually before starting Task 11*

This branch must never be Netlify's deploy branch, so daily backup commits don't trigger app rebuilds:

```bash
git checkout --orphan backups
git rm -rf .
git commit --allow-empty -m "Init backups branch"
git push origin backups
git checkout cloud-modernization
```

- [x] **Step 6: Record environment variables**

Create (untracked, git-ignored) env files:

`netlify/.env` (used by `netlify dev` locally, and mirrored into Netlify's site environment variables via the dashboard for production):
```
SUPABASE_URL=<project-url-from-step-1>
SUPABASE_SERVICE_ROLE_KEY=<service-role-key-from-step-1>
GITHUB_TOKEN=<pat-from-step-4>
GITHUB_REPO=vollepeer/slagenhalen
GITHUB_BACKUP_BRANCH=backups
```

`client/.env`:
```
VITE_SUPABASE_URL=<project-url-from-step-1>
VITE_SUPABASE_ANON_KEY=<anon-key-from-step-1>
```

Add both to `.gitignore` if not already covered by an existing `.env` ignore rule.

> **Note (2026-08-11, added during Task 10):** `netlify/.env` is *not* actually read by `netlify dev` — Netlify Dev only auto-loads `.env` files from the project's `base` directory (repo root, per `netlify.toml`'s `base = "."`), not subdirectories. The smoke test in Task 10 failed with `SUPABASE_URL en SUPABASE_SERVICE_ROLE_KEY moeten ingesteld zijn.` until a root-level `.env` (combining `netlify/.env` + `client/.env`'s contents, gitignored via the existing generic `.env` rule) was created. Keep `netlify/.env` around for consistency with this doc, but for `netlify dev` to actually work, also maintain a root `.env` with the same values.

- [x] **Step 7: Create named user accounts**

Via Supabase Dashboard → Authentication → Users → Add user, create one email+password account per person who will operate the app during events. No self-signup flow is built (matches the "everyone equal, admin-created accounts" decision).

- [x] **Step 8: Verify**

```bash
supabase projects list   # shows the new project
netlify status            # shows the linked site and deploy branch
```

---

### Task 2: Database schema migration + RLS

**Files:**
- Create: `supabase/config.toml` (via `supabase init`)
- Create: `supabase/migrations/20260702120000_init_schema.sql`

**Interfaces:**
- Produces: Postgres tables `players`, `seasons`, `events`, `event_participants`, `audit_log` with the columns and constraints every later task's repo layer queries against.

- [x] **Step 1: Initialize the Supabase project folder and link it**

```bash
supabase init
supabase link --project-ref <your-project-ref>
```

(`<your-project-ref>` is the subdomain segment of your `SUPABASE_URL`, e.g. `abcdefghijkl`.)

- [x] **Step 2: Write the migration**

Create `supabase/migrations/20260702120000_init_schema.sql`:

```sql
create table players (
  id bigint generated by default as identity primary key,
  name text not null,
  is_archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index players_name_lower_idx on players (lower(name));

create table seasons (
  id bigint generated by default as identity primary key,
  name text not null,
  top_scores_count integer not null default 7 check (top_scores_count >= 1),
  start_date date,
  end_date date,
  is_archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table events (
  id bigint generated by default as identity primary key,
  season_id bigint not null references seasons(id),
  event_date date not null,
  title text,
  notes text,
  prize_rank_1 integer not null default 1,
  prize_rank_2 integer not null default 18,
  prize_rank_3 integer not null default 25,
  status text not null default 'OPEN' check (status in ('OPEN', 'LOCKED')),
  locked_at timestamptz,
  is_archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index events_season_id_idx on events (season_id);

create table event_participants (
  id bigint generated by default as identity primary key,
  event_id bigint not null references events(id),
  player_id bigint not null references players(id),
  points_r1 integer check (points_r1 is null or points_r1 >= 0),
  points_r2 integer check (points_r2 is null or points_r2 >= 0),
  points_r3 integer check (points_r3 is null or points_r3 >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, player_id)
);

create table audit_log (
  id bigint generated by default as identity primary key,
  entity_type text,
  entity_id bigint,
  action text,
  old_value jsonb,
  new_value jsonb,
  user_id uuid references auth.users(id),
  user_email text,
  created_at timestamptz not null default now()
);

alter table players enable row level security;
alter table seasons enable row level security;
alter table events enable row level security;
alter table event_participants enable row level security;
alter table audit_log enable row level security;

create policy "authenticated_full_access" on players for all to authenticated using (true) with check (true);
create policy "authenticated_full_access" on seasons for all to authenticated using (true) with check (true);
create policy "authenticated_full_access" on events for all to authenticated using (true) with check (true);
create policy "authenticated_full_access" on event_participants for all to authenticated using (true) with check (true);
create policy "authenticated_full_access" on audit_log for all to authenticated using (true) with check (true);
```

> **Note (2026-08-11):** this migration enables RLS and adds policies but never grants base table privileges. RLS only applies after a role already has table-level GRANTs — without them, PostgREST returns `permission denied for table X` for `service_role` and `authenticated` alike, even with a correctly-signed JWT. A follow-up migration (`20260811223000_grant_table_privileges.sql`, added during Task 6) grants `service_role`/`authenticated` full privileges plus `ALTER DEFAULT PRIVILEGES` so future tables in later migrations inherit the same grants automatically. If re-running this plan from scratch, consider folding those grants into this migration directly instead of a follow-up.
>
> **Note (2026-08-11, added during Task 8):** `audit_log.user_id` has a FK to `auth.users(id)`. The fixed test-fixture `userId` (`00000000-0000-0000-0000-000000000000`) used throughout `netlify/lib/*.test.ts` (Task 8 onward) violates that FK until a matching row exists. A `supabase/seed.sql` was added to insert that test user — it only runs on local `supabase db reset`/`start`, never on `supabase db push`, so it has no effect on the hosted project or the real named users from Task 1.

- [x] **Step 3: Start Supabase locally and apply the migration**

```bash
supabase start
supabase db reset
```

Expected: output ends with "Finished supabase db reset" and no errors. `supabase status` prints a local `API URL` (typically `http://127.0.0.1:54321`) and `service_role key` — copy these for Task 3's test env file.

- [x] **Step 4: Push the migration to the real hosted project**

```bash
supabase db push
```

Expected: confirms the migration applied to the linked hosted project.

- [x] **Step 5: Verify with a manual query**

```bash
supabase db execute --sql "select table_name from information_schema.tables where table_schema = 'public' order by 1;"
```

Expected: lists `audit_log`, `event_participants`, `events`, `players`, `seasons`.

- [x] **Step 6: Commit**

```bash
git add supabase/
git commit -m "Add Supabase schema migration for players, seasons, events, participants, audit log"
```

---

### Task 3: `netlify/` package scaffolding, Supabase admin client, and shared types

**Files:**
- Create: `netlify/package.json`
- Create: `netlify/tsconfig.json`
- Create: `netlify/vitest.config.ts`
- Create: `netlify/.env.test.example`
- Create: `netlify/lib/supabaseAdmin.ts`
- Create: `netlify/lib/types.ts`
- Create: `netlify/lib/testHelpers.ts`

**Interfaces:**
- Produces: `supabaseAdmin` (a configured `SupabaseClient`), `PlayerRow`/`Player`/`mapPlayer`, `SeasonRow`/`Season`/`mapSeason`, `EventRow`/`EventSummary`/`mapEventSummary`, and `resetDatabase()` — used by every repo/router task from here on.

- [x] **Step 1: Create `netlify/package.json`**

```json
{
  "name": "kaartbuddy-functions",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@supabase/supabase-js": "^2.45.0",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@netlify/functions": "^2.8.1",
    "@types/node": "^20.12.12",
    "dotenv": "^16.4.5",
    "tsx": "^4.15.5",
    "typescript": "^5.4.5",
    "vitest": "^2.0.5"
  }
}
```

- [x] **Step 2: Create `netlify/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "types": ["node"]
  },
  "include": ["functions", "lib", "scripts"]
}
```

- [x] **Step 3: Create `netlify/vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";
import dotenv from "dotenv";

dotenv.config({ path: ".env.test" });

export default defineConfig({
  test: {
    environment: "node",
    hookTimeout: 20000,
    testTimeout: 20000,
    fileParallelism: false
  }
});
```

> **Note (2026-08-11, added during Task 7):** `fileParallelism: false` is required, not optional. All `lib/*.test.ts` files share one local Postgres instance via `resetDatabase()` in `beforeEach`; Vitest's default file-level parallelism runs multiple test files concurrently, so one file's reset/inserts interleaved with another's, causing flaky duplicate-key errors and empty-result assertions once more than one DB-backed test file existed (surfaced when `events.test.ts` was added alongside `players.test.ts`/`seasons.test.ts`). Running files sequentially fixed it without slowing any single task's test run.

- [x] **Step 4: Create `netlify/.env.test.example`** (committed; the real `.env.test` is git-ignored)

```
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_SERVICE_ROLE_KEY=replace-with-value-from-supabase-status
```

Copy it to `netlify/.env.test` and fill in the real local values printed by `supabase status` (from Task 2, Step 3).

- [x] **Step 5: Install dependencies**

```bash
cd netlify && npm install
```

- [x] **Step 6: Create `netlify/lib/supabaseAdmin.ts`**

```ts
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("SUPABASE_URL en SUPABASE_SERVICE_ROLE_KEY moeten ingesteld zijn.");
}

export const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false }
});
```

- [x] **Step 7: Create `netlify/lib/types.ts`**

```ts
export type PlayerRow = {
  id: number;
  name: string;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
};

export type Player = { id: number; name: string; isArchived: boolean };

export function mapPlayer(row: PlayerRow): Player {
  return { id: row.id, name: row.name, isArchived: row.is_archived };
}

export type SeasonRow = {
  id: number;
  name: string;
  top_scores_count: number;
  start_date: string | null;
  end_date: string | null;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
};

export type Season = {
  id: number;
  name: string;
  topScoresCount: number;
  startDate: string | null;
  endDate: string | null;
  isArchived: boolean;
};

export function mapSeason(row: SeasonRow): Season {
  return {
    id: row.id,
    name: row.name,
    topScoresCount: row.top_scores_count,
    startDate: row.start_date,
    endDate: row.end_date,
    isArchived: row.is_archived
  };
}

export type EventRow = {
  id: number;
  season_id: number;
  event_date: string;
  title: string | null;
  notes: string | null;
  prize_rank_1: number;
  prize_rank_2: number;
  prize_rank_3: number;
  status: "OPEN" | "LOCKED";
  locked_at: string | null;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
};

export type EventSummary = {
  id: number;
  seasonId: number;
  eventDate: string;
  title: string | null;
  notes: string | null;
  status: "OPEN" | "LOCKED";
  isArchived: boolean;
};

export function mapEventSummary(row: EventRow): EventSummary {
  return {
    id: row.id,
    seasonId: row.season_id,
    eventDate: row.event_date,
    title: row.title,
    notes: row.notes,
    status: row.status,
    isArchived: row.is_archived
  };
}
```

- [x] **Step 8: Create `netlify/lib/testHelpers.ts`**

```ts
import { supabaseAdmin } from "./supabaseAdmin";

export async function resetDatabase(): Promise<void> {
  await supabaseAdmin.from("audit_log").delete().neq("id", 0);
  await supabaseAdmin.from("event_participants").delete().neq("id", 0);
  await supabaseAdmin.from("events").delete().neq("id", 0);
  await supabaseAdmin.from("seasons").delete().neq("id", 0);
  await supabaseAdmin.from("players").delete().neq("id", 0);
}
```

- [x] **Step 9: Verify the package builds and connects**

```bash
cd netlify && npx tsc --noEmit
```

Expected: no type errors (there are no tests yet to run — this task only scaffolds).

- [x] **Step 10: Commit**

```bash
git add netlify/package.json netlify/tsconfig.json netlify/vitest.config.ts netlify/.env.test.example netlify/lib
git commit -m "Scaffold netlify/ functions package with Supabase admin client and shared types"
```

---

### Task 4: Port ranking business logic + unit tests

**Files:**
- Create: `netlify/lib/ranking.ts` (ported from `server/src/ranking.ts`, unchanged logic)
- Create: `netlify/lib/ranking.test.ts`

**Interfaces:**
- Consumes: nothing (pure functions).
- Produces: `ParticipantRow`, `RankedParticipant`, `RankingResult`, `computeRanking(rows, prizeRanks?)`, `canLockEvent(participants, tieErrors)` — used by the router in Tasks 8–9.

- [x] **Step 1: Write the failing tests**

Create `netlify/lib/ranking.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { canLockEvent, computeRanking, type ParticipantRow } from "./ranking";

function row(overrides: Partial<ParticipantRow>): ParticipantRow {
  return {
    id: 1,
    player_id: 1,
    player_name: "Speler",
    points_r1: null,
    points_r2: null,
    points_r3: null,
    ...overrides
  };
}

describe("computeRanking", () => {
  it("ranks participants descending by cumulative round score", () => {
    const result = computeRanking([
      row({ id: 1, player_id: 1, player_name: "Anna", points_r1: 10, points_r2: 8, points_r3: 12 }),
      row({ id: 2, player_id: 2, player_name: "Bram", points_r1: 15, points_r2: 5, points_r3: 5 })
    ]);
    const anna = result.participants.find((p) => p.player_name === "Anna")!;
    const bram = result.participants.find((p) => p.player_name === "Bram")!;
    expect(anna.total_points).toBe(30);
    expect(bram.total_points).toBe(25);
    expect(anna.rank_r3).toBe(1);
    expect(bram.rank_r3).toBe(2);
  });

  it("leaves rank and total blank when a round score is unknown", () => {
    const result = computeRanking([row({ points_r1: 10, points_r2: null, points_r3: null })]);
    expect(result.participants[0].rank_r2).toBeNull();
    expect(result.participants[0].rank_r3).toBeNull();
    expect(result.participants[0].total_points).toBeNull();
  });

  it("flags ties in the final totals", () => {
    const result = computeRanking([
      row({ id: 1, player_id: 1, points_r1: 10, points_r2: 10, points_r3: 10 }),
      row({ id: 2, player_id: 2, points_r1: 15, points_r2: 5, points_r3: 10 })
    ]);
    expect(result.tieErrors.length).toBeGreaterThan(0);
  });
});

describe("canLockEvent", () => {
  it("blocks locking when a score is missing", () => {
    const { participants, tieErrors } = computeRanking([row({ points_r1: 10, points_r2: null, points_r3: null })]);
    expect(canLockEvent(participants, tieErrors).allowed).toBe(false);
  });

  it("allows locking despite a tie warning", () => {
    const { participants, tieErrors } = computeRanking([
      row({ id: 1, player_id: 1, points_r1: 10, points_r2: 10, points_r3: 10 }),
      row({ id: 2, player_id: 2, points_r1: 10, points_r2: 10, points_r3: 10 })
    ]);
    expect(canLockEvent(participants, tieErrors).allowed).toBe(true);
  });

  it("blocks locking with more than 60 participants", () => {
    const rows = Array.from({ length: 61 }, (_, index) =>
      row({ id: index + 1, player_id: index + 1, points_r1: 1, points_r2: 1, points_r3: 1 })
    );
    const { participants, tieErrors } = computeRanking(rows);
    expect(canLockEvent(participants, tieErrors).allowed).toBe(false);
  });
});
```

- [x] **Step 2: Run tests to verify they fail**

```bash
cd netlify && npx vitest run lib/ranking.test.ts
```

Expected: FAIL — `./ranking` cannot be found.

- [x] **Step 3: Create `netlify/lib/ranking.ts`**

Copy `server/src/ranking.ts` verbatim (it is framework-agnostic — no changes needed):

```ts
export type ParticipantRow = {
  id: number;
  player_id: number;
  player_name: string;
  points_r1: number | null;
  points_r2: number | null;
  points_r3: number | null;
};

export type RankedParticipant = ParticipantRow & {
  total_points: number | null;
  rank_r1: number | null;
  rank_r2: number | null;
  rank_r3: number | null;
};

export type RankingResult = {
  participants: RankedParticipant[];
  tieErrors: string[];
  roundWinners: Array<{
    round: 1 | 2 | 3;
    winners: Array<{ rank: number; playerName: string }>;
  }>;
  eventWinners: Array<{ rank: number; playerName: string }>;
  eventWinner: { rank: number; playerName: string } | null;
};

function hasAll(values: Array<number | null>) {
  return values.every((value) => value !== null);
}

function computeRanks(
  participants: RankedParticipant[],
  round: 1 | 2 | 3
): { ranks: Map<number, number>; tie: boolean } {
  const required = (p: RankedParticipant) => {
    if (round === 1) return hasAll([p.points_r1]);
    if (round === 2) return hasAll([p.points_r2]);
    return hasAll([p.points_r3]);
  };
  const score = (p: RankedParticipant) => {
    if (round === 1) return p.points_r1 ?? null;
    if (round === 2) return p.points_r2 ?? null;
    return p.points_r3 ?? null;
  };

  const eligible = participants
    .filter(required)
    .map((p) => ({ id: p.id, score: score(p) as number }));

  const seen = new Set<number>();
  let tie = false;
  for (const entry of eligible) {
    if (seen.has(entry.score)) {
      tie = true;
      break;
    }
    seen.add(entry.score);
  }

  const sorted = [...eligible].sort((a, b) => b.score - a.score);
  const ranks = new Map<number, number>();
  sorted.forEach((entry, index) => {
    ranks.set(entry.id, index + 1);
  });

  return { ranks, tie };
}

export function computeRanking(
  rows: ParticipantRow[],
  prizeRanks: number[] = [1, 18, 25]
): RankingResult {
  const participants: RankedParticipant[] = rows.map((row) => {
    const totalPoints = hasAll([row.points_r1, row.points_r2, row.points_r3])
      ? (row.points_r1 ?? 0) + (row.points_r2 ?? 0) + (row.points_r3 ?? 0)
      : null;

    return {
      ...row,
      total_points: totalPoints,
      rank_r1: null,
      rank_r2: null,
      rank_r3: null
    };
  });

  const tieErrors: string[] = [];
  const round1 = computeRanks(participants, 1);
  const round2 = computeRanks(participants, 2);
  const round3 = computeRanks(participants, 3);

  const totalEligible = participants
    .filter((p) => hasAll([p.points_r1, p.points_r2, p.points_r3]))
    .map((p) => ({ id: p.id, total: p.total_points as number }));
  const seenTotals = new Set<number>();
  let totalTie = false;
  for (const entry of totalEligible) {
    if (seenTotals.has(entry.total)) {
      totalTie = true;
      break;
    }
    seenTotals.add(entry.total);
  }

  if (totalTie) tieErrors.push("Ties detected in final totals");

  participants.forEach((p) => {
    p.rank_r1 = round1.ranks.get(p.id) ?? null;
    p.rank_r2 = round2.ranks.get(p.id) ?? null;
    p.rank_r3 = round3.ranks.get(p.id) ?? null;
  });

  const roundWinners = ([1, 2, 3] as const).map((round) => {
    const winners: Array<{ rank: number; playerName: string }> = [];
    const getScore = (p: RankedParticipant) => {
      if (round === 1) return p.points_r1;
      if (round === 2) return p.points_r2;
      return p.points_r3;
    };

    const seenNames = new Set<string>();
    for (const rank of prizeRanks) {
      const match = participants.find((p) => {
        if (round === 1) return p.rank_r1 === rank;
        if (round === 2) return p.rank_r2 === rank;
        return p.rank_r3 === rank;
      });
      const targetScore = match ? getScore(match) : null;
      if (targetScore === null || targetScore === undefined) {
        continue;
      }

      participants.forEach((p) => {
        if (getScore(p) === targetScore && !seenNames.has(p.player_name)) {
          winners.push({ rank, playerName: p.player_name });
          seenNames.add(p.player_name);
        }
      });
    }

    return { round, winners };
  });

  const highestTotal = totalEligible.reduce<number | null>((currentMax, entry) => {
    if (currentMax === null || entry.total > currentMax) {
      return entry.total;
    }
    return currentMax;
  }, null);
  const eventWinners =
    highestTotal === null
      ? []
      : participants
          .filter((participant) => participant.total_points === highestTotal)
          .map((participant) => ({ rank: 1, playerName: participant.player_name }));

  return {
    participants,
    tieErrors,
    roundWinners,
    eventWinners,
    eventWinner: eventWinners[0] ?? null
  };
}

export function canLockEvent(participants: RankedParticipant[], tieErrors: string[]) {
  const reasons: string[] = [];

  if (participants.length < 1 || participants.length > 60) {
    reasons.push("Participant count must be between 1 and 60");
  }

  const missingScores = participants.some((p) =>
    [p.points_r1, p.points_r2, p.points_r3].some((value) => value === null)
  );
  if (missingScores) {
    reasons.push("Ontbrekende scores voor een of meer rondes");
  }

  return { allowed: reasons.length === 0, reasons };
}
```

- [x] **Step 4: Run tests to verify they pass**

```bash
cd netlify && npx vitest run lib/ranking.test.ts
```

Expected: PASS (6 tests).

- [x] **Step 5: Commit**

```bash
git add netlify/lib/ranking.ts netlify/lib/ranking.test.ts
git commit -m "Port ranking business logic with unit tests"
```

---

### Task 5: Port validators + unit tests

**Files:**
- Create: `netlify/lib/validators.ts` (ported from `server/src/validators.ts`, unchanged)
- Create: `netlify/lib/validators.test.ts`

**Interfaces:**
- Produces: `createPlayerSchema`, `updatePlayerSchema`, `createSeasonSchema`, `updateSeasonSchema`, `createEventSchema`, `updateEventSchema`, `addParticipantSchema`, `updateParticipantSchema` — available for use if the router wants zod-based validation (the router built in Tasks 8–9 uses inline checks matching the original `localApi.ts`, so these schemas are primarily documentation/future-proofing here, but are exercised directly by these tests).

- [ ] **Step 1: Write the failing tests**

Create `netlify/lib/validators.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createPlayerSchema, updateParticipantSchema, createSeasonSchema } from "./validators";

describe("createPlayerSchema", () => {
  it("accepts a non-empty name", () => {
    expect(createPlayerSchema.safeParse({ name: "Jan" }).success).toBe(true);
  });

  it("rejects an empty name", () => {
    expect(createPlayerSchema.safeParse({ name: "" }).success).toBe(false);
  });
});

describe("createSeasonSchema", () => {
  it("rejects a topScoresCount below 1", () => {
    expect(createSeasonSchema.safeParse({ name: "2026", topScoresCount: 0 }).success).toBe(false);
  });
});

describe("updateParticipantSchema", () => {
  it("accepts null as an explicit unknown score", () => {
    expect(updateParticipantSchema.safeParse({ pointsR1: null }).success).toBe(true);
  });

  it("rejects a negative score", () => {
    expect(updateParticipantSchema.safeParse({ pointsR1: -1 }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
cd netlify && npx vitest run lib/validators.test.ts
```

Expected: FAIL — `./validators` not found.

- [ ] **Step 3: Create `netlify/lib/validators.ts`**

Copy `server/src/validators.ts` verbatim:

```ts
import { z } from "zod";

export const createPlayerSchema = z.object({
  name: z.string().min(1)
});

export const updatePlayerSchema = z.object({
  name: z.string().min(1).optional(),
  isArchived: z.boolean().optional()
});

export const createSeasonSchema = z.object({
  name: z.string().min(1),
  topScoresCount: z.number().int().min(1).optional(),
  startDate: z.string().nullable().optional(),
  endDate: z.string().nullable().optional()
});

export const updateSeasonSchema = z.object({
  name: z.string().min(1).optional(),
  topScoresCount: z.number().int().min(1).optional(),
  startDate: z.string().nullable().optional(),
  endDate: z.string().nullable().optional(),
  isArchived: z.boolean().optional()
});

export const createEventSchema = z.object({
  seasonId: z.number().int(),
  eventDate: z.string().min(1),
  title: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  prizeRank1: z.number().int().min(1).max(60).optional(),
  prizeRank2: z.number().int().min(1).max(60).optional(),
  prizeRank3: z.number().int().min(1).max(60).optional()
});

export const updateEventSchema = z.object({
  eventDate: z.string().min(1).optional(),
  title: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  isArchived: z.boolean().optional(),
  prizeRank1: z.number().int().min(1).max(60).optional(),
  prizeRank2: z.number().int().min(1).max(60).optional(),
  prizeRank3: z.number().int().min(1).max(60).optional()
});

export const addParticipantSchema = z.object({
  playerId: z.number().int()
});

export const updateParticipantSchema = z.object({
  pointsR1: z.number().int().min(0).nullable().optional(),
  pointsR2: z.number().int().min(0).nullable().optional(),
  pointsR3: z.number().int().min(0).nullable().optional()
});
```

- [ ] **Step 4: Run to verify pass**

```bash
cd netlify && npx vitest run lib/validators.test.ts
```

Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add netlify/lib/validators.ts netlify/lib/validators.test.ts
git commit -m "Port zod validators with unit tests"
```

---

### Task 6: Data access layer — players, seasons, audit log

**Files:**
- Create: `netlify/lib/players.ts`
- Create: `netlify/lib/players.test.ts`
- Create: `netlify/lib/seasons.ts`
- Create: `netlify/lib/seasons.test.ts`
- Create: `netlify/lib/auditLog.ts`

**Interfaces:**
- Consumes: `supabaseAdmin` (Task 3), `PlayerRow`/`Player`/`mapPlayer`, `SeasonRow`/`Season`/`mapSeason` (Task 3), `resetDatabase` (Task 3).
- Produces: `listPlayers`, `findPlayerByName`, `getPlayerById`, `insertPlayer`, `updatePlayerRow`; `listSeasons`, `findSeasonById`, `insertSeason`, `updateSeasonRow`; `insertAuditLog` — consumed by the router in Tasks 8–9 and by events/participants in Task 7.

**Prerequisite:** `supabase start` must be running (Task 2) with `netlify/.env.test` pointing at it (Task 3).

- [x] **Step 1: Write the failing tests**

Create `netlify/lib/players.test.ts`:

```ts
import "dotenv/config";
import { beforeEach, describe, expect, it } from "vitest";
import { findPlayerByName, insertPlayer, listPlayers, updatePlayerRow } from "./players";
import { resetDatabase } from "./testHelpers";

beforeEach(async () => {
  await resetDatabase();
});

describe("players repo", () => {
  it("creates and lists a player", async () => {
    await insertPlayer("Jan Jansen");
    const players = await listPlayers("", false);
    expect(players).toHaveLength(1);
    expect(players[0].name).toBe("Jan Jansen");
  });

  it("finds a duplicate name case-insensitively", async () => {
    await insertPlayer("Jan Jansen");
    expect(await findPlayerByName("jan jansen")).not.toBeNull();
  });

  it("excludes archived players by default", async () => {
    const player = await insertPlayer("Piet");
    await updatePlayerRow(player.id, { is_archived: true });
    expect(await listPlayers("", false)).toHaveLength(0);
    expect(await listPlayers("", true)).toHaveLength(1);
  });
});
```

Create `netlify/lib/seasons.test.ts`:

```ts
import "dotenv/config";
import { beforeEach, describe, expect, it } from "vitest";
import { insertSeason, listSeasons } from "./seasons";
import { resetDatabase } from "./testHelpers";

beforeEach(async () => {
  await resetDatabase();
});

describe("seasons repo", () => {
  it("defaults topScoresCount to 7 when not provided elsewhere", async () => {
    const season = await insertSeason({ name: "2026", topScoresCount: 7, startDate: null, endDate: null });
    expect(season.top_scores_count).toBe(7);
  });

  it("lists seasons newest-id-first", async () => {
    await insertSeason({ name: "2025", topScoresCount: 7, startDate: null, endDate: null });
    await insertSeason({ name: "2026", topScoresCount: 7, startDate: null, endDate: null });
    const seasons = await listSeasons(false);
    expect(seasons[0].name).toBe("2026");
  });
});
```

- [x] **Step 2: Run to verify failure**

```bash
cd netlify && npx vitest run lib/players.test.ts lib/seasons.test.ts
```

Expected: FAIL — modules not found.

- [x] **Step 3: Create `netlify/lib/players.ts`**

```ts
import { supabaseAdmin } from "./supabaseAdmin";
import { mapPlayer, type Player, type PlayerRow } from "./types";

export async function listPlayers(query: string, includeArchived: boolean): Promise<Player[]> {
  const { data, error } = await supabaseAdmin.from("players").select("*");
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as PlayerRow[];
  const normalizedQuery = query.trim().toLowerCase();
  return rows
    .filter((row) => includeArchived || !row.is_archived)
    .filter((row) => (normalizedQuery ? row.name.toLowerCase().includes(normalizedQuery) : true))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(mapPlayer);
}

export async function findPlayerByName(name: string, excludeId?: number): Promise<PlayerRow | null> {
  const { data, error } = await supabaseAdmin.from("players").select("*");
  if (error) throw new Error(error.message);
  const target = name.trim().toLowerCase();
  return ((data ?? []) as PlayerRow[]).find((row) => row.id !== excludeId && row.name.trim().toLowerCase() === target) ?? null;
}

export async function getPlayerById(id: number): Promise<PlayerRow | null> {
  const { data, error } = await supabaseAdmin.from("players").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

export async function insertPlayer(name: string): Promise<PlayerRow> {
  const now = new Date().toISOString();
  const { data, error } = await supabaseAdmin
    .from("players")
    .insert({ name, is_archived: false, created_at: now, updated_at: now })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function updatePlayerRow(
  id: number,
  updates: Partial<Pick<PlayerRow, "name" | "is_archived">>
): Promise<void> {
  const { error } = await supabaseAdmin
    .from("players")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);
}
```

- [x] **Step 4: Create `netlify/lib/seasons.ts`**

```ts
import { supabaseAdmin } from "./supabaseAdmin";
import { mapSeason, type Season, type SeasonRow } from "./types";

export async function listSeasons(includeArchived: boolean): Promise<Season[]> {
  const { data, error } = await supabaseAdmin.from("seasons").select("*");
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as SeasonRow[];
  return rows
    .filter((row) => includeArchived || !row.is_archived)
    .sort((a, b) => b.id - a.id)
    .map(mapSeason);
}

export async function findSeasonById(id: number): Promise<SeasonRow | null> {
  const { data, error } = await supabaseAdmin.from("seasons").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

export async function insertSeason(input: {
  name: string;
  topScoresCount: number;
  startDate: string | null;
  endDate: string | null;
}): Promise<SeasonRow> {
  const now = new Date().toISOString();
  const { data, error } = await supabaseAdmin
    .from("seasons")
    .insert({
      name: input.name,
      top_scores_count: input.topScoresCount,
      start_date: input.startDate,
      end_date: input.endDate,
      is_archived: false,
      created_at: now,
      updated_at: now
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function updateSeasonRow(
  id: number,
  updates: Partial<Pick<SeasonRow, "name" | "top_scores_count" | "start_date" | "end_date" | "is_archived">>
): Promise<void> {
  const { error } = await supabaseAdmin
    .from("seasons")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);
}
```

- [x] **Step 5: Create `netlify/lib/auditLog.ts`**

```ts
import { supabaseAdmin } from "./supabaseAdmin";

export async function insertAuditLog(entry: {
  entityType: string;
  entityId: number;
  action: string;
  userId: string;
  userEmail: string;
}): Promise<void> {
  const { error } = await supabaseAdmin.from("audit_log").insert({
    entity_type: entry.entityType,
    entity_id: entry.entityId,
    action: entry.action,
    old_value: null,
    new_value: null,
    user_id: entry.userId,
    user_email: entry.userEmail,
    created_at: new Date().toISOString()
  });
  if (error) throw new Error(error.message);
}
```

- [x] **Step 6: Run to verify pass**

```bash
cd netlify && npx vitest run lib/players.test.ts lib/seasons.test.ts
```

Expected: PASS (5 tests).

- [x] **Step 7: Commit**

```bash
git add netlify/lib/players.ts netlify/lib/players.test.ts netlify/lib/seasons.ts netlify/lib/seasons.test.ts netlify/lib/auditLog.ts
git commit -m "Add players, seasons, and audit log data access layer"
```

---

### Task 7: Data access layer — events & participants

**Files:**
- Create: `netlify/lib/events.ts`
- Create: `netlify/lib/events.test.ts`

**Interfaces:**
- Consumes: `supabaseAdmin`, `EventRow`/`EventSummary`/`mapEventSummary` (Task 3), `ParticipantRow` (Task 4), `resetDatabase` (Task 3).
- Produces: `listEvents`, `listEventRowsForSeason`, `getEventRowById`, `insertEvent`, `updateEventRow`, `getParticipants`, `countParticipants`, `findParticipant`, `insertParticipant`, `updateParticipantRow`, `deleteParticipantRow` — consumed by the router in Tasks 8–9.

**Prerequisite:** `supabase start` running, as in Task 6.

- [x] **Step 1: Write the failing tests**

Create `netlify/lib/events.test.ts`:

```ts
import "dotenv/config";
import { beforeEach, describe, expect, it } from "vitest";
import { insertSeason } from "./seasons";
import { insertPlayer } from "./players";
import {
  getParticipants,
  insertEvent,
  insertParticipant,
  listEvents,
  updateParticipantRow
} from "./events";
import { resetDatabase } from "./testHelpers";

beforeEach(async () => {
  await resetDatabase();
});

describe("events repo", () => {
  it("creates an event and lists it under its season", async () => {
    const season = await insertSeason({ name: "2026", topScoresCount: 7, startDate: null, endDate: null });
    const event = await insertEvent({
      seasonId: season.id,
      eventDate: "2026-07-02",
      title: null,
      notes: null,
      prizeRanks: [1, 18, 25]
    });
    const events = await listEvents(season.id, false);
    expect(events).toHaveLength(1);
    expect(events[0].id).toBe(event.id);
  });

  it("joins player names when reading participants", async () => {
    const season = await insertSeason({ name: "2026", topScoresCount: 7, startDate: null, endDate: null });
    const event = await insertEvent({
      seasonId: season.id,
      eventDate: "2026-07-02",
      title: null,
      notes: null,
      prizeRanks: [1, 18, 25]
    });
    const player = await insertPlayer("Jan Jansen");
    const participant = await insertParticipant(event.id, player.id);
    await updateParticipantRow(participant.id, { points_r1: 10 });

    const participants = await getParticipants(event.id);
    expect(participants).toHaveLength(1);
    expect(participants[0].player_name).toBe("Jan Jansen");
    expect(participants[0].points_r1).toBe(10);
  });
});
```

- [x] **Step 2: Run to verify failure**

```bash
cd netlify && npx vitest run lib/events.test.ts
```

Expected: FAIL — `./events` not found.

- [x] **Step 3: Create `netlify/lib/events.ts`**

```ts
import { supabaseAdmin } from "./supabaseAdmin";
import { mapEventSummary, type EventRow, type EventSummary } from "./types";
import type { ParticipantRow } from "./ranking";

export async function listEvents(seasonId: number | null, includeArchived: boolean): Promise<EventSummary[]> {
  const { data, error } = await supabaseAdmin.from("events").select("*");
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as EventRow[];
  return rows
    .filter((row) => (seasonId === null ? true : row.season_id === seasonId))
    .filter((row) => includeArchived || !row.is_archived)
    .sort((a, b) => b.event_date.localeCompare(a.event_date))
    .map(mapEventSummary);
}

export async function listEventRowsForSeason(seasonId: number): Promise<EventRow[]> {
  const { data, error } = await supabaseAdmin.from("events").select("*").eq("season_id", seasonId);
  if (error) throw new Error(error.message);
  return (data ?? []) as EventRow[];
}

export async function getEventRowById(eventId: number): Promise<EventRow | null> {
  const { data, error } = await supabaseAdmin.from("events").select("*").eq("id", eventId).maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

export async function insertEvent(input: {
  seasonId: number;
  eventDate: string;
  title: string | null;
  notes: string | null;
  prizeRanks: [number, number, number];
}): Promise<EventRow> {
  const now = new Date().toISOString();
  const { data, error } = await supabaseAdmin
    .from("events")
    .insert({
      season_id: input.seasonId,
      event_date: input.eventDate,
      title: input.title,
      notes: input.notes,
      prize_rank_1: input.prizeRanks[0],
      prize_rank_2: input.prizeRanks[1],
      prize_rank_3: input.prizeRanks[2],
      status: "OPEN",
      locked_at: null,
      is_archived: false,
      created_at: now,
      updated_at: now
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function updateEventRow(
  eventId: number,
  updates: Partial<{
    event_date: string;
    title: string | null;
    notes: string | null;
    is_archived: boolean;
    prize_rank_1: number;
    prize_rank_2: number;
    prize_rank_3: number;
    status: "OPEN" | "LOCKED";
    locked_at: string | null;
  }>
): Promise<void> {
  const { error } = await supabaseAdmin
    .from("events")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", eventId);
  if (error) throw new Error(error.message);
}

export async function getParticipants(eventId: number): Promise<ParticipantRow[]> {
  const { data, error } = await supabaseAdmin
    .from("event_participants")
    .select("id, player_id, points_r1, points_r2, points_r3, players(name)")
    .eq("event_id", eventId);
  if (error) throw new Error(error.message);
  const rows = (data ?? []).map((row: any) => ({
    id: row.id as number,
    player_id: row.player_id as number,
    player_name: (row.players?.name as string) ?? "",
    points_r1: row.points_r1 as number | null,
    points_r2: row.points_r2 as number | null,
    points_r3: row.points_r3 as number | null
  }));
  rows.sort((a, b) => a.player_name.localeCompare(b.player_name));
  return rows;
}

export async function countParticipants(eventId: number): Promise<number> {
  const { count, error } = await supabaseAdmin
    .from("event_participants")
    .select("id", { count: "exact", head: true })
    .eq("event_id", eventId);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

export async function findParticipant(eventId: number, playerId: number) {
  const { data, error } = await supabaseAdmin
    .from("event_participants")
    .select("id")
    .eq("event_id", eventId)
    .eq("player_id", playerId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

export async function insertParticipant(eventId: number, playerId: number): Promise<{ id: number }> {
  const now = new Date().toISOString();
  const { data, error } = await supabaseAdmin
    .from("event_participants")
    .insert({
      event_id: eventId,
      player_id: playerId,
      points_r1: null,
      points_r2: null,
      points_r3: null,
      created_at: now,
      updated_at: now
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function updateParticipantRow(
  participantId: number,
  updates: Partial<{ points_r1: number | null; points_r2: number | null; points_r3: number | null }>
): Promise<void> {
  const { error } = await supabaseAdmin
    .from("event_participants")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", participantId);
  if (error) throw new Error(error.message);
}

export async function deleteParticipantRow(eventId: number, participantId: number): Promise<number> {
  const { error, count } = await supabaseAdmin
    .from("event_participants")
    .delete({ count: "exact" })
    .eq("id", participantId)
    .eq("event_id", eventId);
  if (error) throw new Error(error.message);
  return count ?? 0;
}
```

- [x] **Step 4: Run to verify pass**

```bash
cd netlify && npx vitest run lib/events.test.ts
```

Expected: PASS (2 tests).

- [x] **Step 5: Commit**

```bash
git add netlify/lib/events.ts netlify/lib/events.test.ts
git commit -m "Add events and participants data access layer"
```

---

### Task 8: API router — players & seasons endpoints

**Files:**
- Create: `netlify/lib/router.ts`
- Create: `netlify/lib/router.test.ts`

**Interfaces:**
- Consumes: `players.ts`, `seasons.ts`, `auditLog.ts` (Task 6).
- Produces: `ApiError`, `RequestContext`, `ApiResult`, `handleApiRequest(method, pathname, params, body, ctx)` — the single entry point the Netlify Function (Task 10) calls, and that Task 9 extends with events/participants/lock/ranking routes.

- [x] **Step 1: Write the failing tests**

Create `netlify/lib/router.test.ts`:

```ts
import "dotenv/config";
import { beforeEach, describe, expect, it } from "vitest";
import { handleApiRequest } from "./router";
import { resetDatabase } from "./testHelpers";

const ctx = { userId: "00000000-0000-0000-0000-000000000000", userEmail: "test@example.com" };

beforeEach(async () => {
  await resetDatabase();
});

describe("players endpoints", () => {
  it("creates a player via POST /api/players", async () => {
    const result = await handleApiRequest("POST", "/api/players", new URLSearchParams(), { name: "Jan" }, ctx);
    expect(result.status).toBe(201);
  });

  it("rejects a duplicate player name", async () => {
    await handleApiRequest("POST", "/api/players", new URLSearchParams(), { name: "Jan" }, ctx);
    const result = await handleApiRequest("POST", "/api/players", new URLSearchParams(), { name: "jan" }, ctx);
    expect(result.status).toBe(400);
  });

  it("returns 404 for an unknown route", async () => {
    const result = await handleApiRequest("GET", "/api/nope", new URLSearchParams(), undefined, ctx);
    expect(result.status).toBe(404);
  });
});

describe("seasons endpoints", () => {
  it("defaults topScoresCount to 7", async () => {
    await handleApiRequest("POST", "/api/seasons", new URLSearchParams(), { name: "2026" }, ctx);
    const list = await handleApiRequest(
      "GET",
      "/api/seasons",
      new URLSearchParams([["includeArchived", "false"]]),
      undefined,
      ctx
    );
    expect((list.body as any[])[0].topScoresCount).toBe(7);
  });
});
```

- [x] **Step 2: Run to verify failure**

```bash
cd netlify && npx vitest run lib/router.test.ts
```

Expected: FAIL — `./router` not found.

- [x] **Step 3: Create `netlify/lib/router.ts`**

```ts
import { insertAuditLog } from "./auditLog";
import { findPlayerByName, getPlayerById, insertPlayer, listPlayers, updatePlayerRow } from "./players";
import { findSeasonById, insertSeason, listSeasons, updateSeasonRow } from "./seasons";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export type RequestContext = { userId: string; userEmail: string };
export type ApiResult = { status: number; body: unknown };

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export async function handleApiRequest(
  method: string,
  pathname: string,
  params: URLSearchParams,
  body: unknown,
  ctx: RequestContext
): Promise<ApiResult> {
  try {
    return await dispatch(method, pathname, params, body, ctx);
  } catch (error) {
    if (error instanceof ApiError) {
      return { status: error.status, body: { message: error.message } };
    }
    console.error("Onverwachte fout in API:", error);
    return { status: 500, body: { message: "Interne serverfout." } };
  }
}

async function dispatch(
  method: string,
  pathname: string,
  params: URLSearchParams,
  body: unknown,
  ctx: RequestContext
): Promise<ApiResult> {
  if (method === "GET" && pathname === "/api/players") {
    const players = await listPlayers(params.get("query") || "", params.get("includeArchived") === "true");
    return { status: 200, body: players };
  }

  if (method === "POST" && pathname === "/api/players") {
    const payload = body as { name?: unknown };
    if (!isNonEmptyString(payload?.name)) throw new ApiError(400, "Naam is verplicht.");
    const name = payload.name.trim();
    if (await findPlayerByName(name)) throw new ApiError(400, "Spelernaam bestaat al.");
    const player = await insertPlayer(name);
    await insertAuditLog({ entityType: "player", entityId: player.id, action: "CREATED", userId: ctx.userId, userEmail: ctx.userEmail });
    return { status: 201, body: { id: player.id, name: player.name } };
  }

  const playerMatch = pathname.match(/^\/api\/players\/(\d+)$/);
  if (method === "PATCH" && playerMatch) {
    const playerId = Number(playerMatch[1]);
    const payload = body as { name?: unknown; isArchived?: unknown };
    if (payload?.name === undefined && payload?.isArchived === undefined) {
      throw new ApiError(400, "Geen wijzigingen opgegeven.");
    }
    const player = await getPlayerById(playerId);
    if (!player) throw new ApiError(404, "Speler niet gevonden.");

    const updates: Partial<{ name: string; is_archived: boolean }> = {};
    if (payload?.name !== undefined) {
      if (!isNonEmptyString(payload.name)) throw new ApiError(400, "Ongeldige spelergegevens.");
      const name = payload.name.trim();
      if (await findPlayerByName(name, playerId)) throw new ApiError(400, "Spelernaam bestaat al.");
      updates.name = name;
    }
    if (payload?.isArchived !== undefined) {
      updates.is_archived = Boolean(payload.isArchived);
    }
    await updatePlayerRow(playerId, updates);
    await insertAuditLog({ entityType: "player", entityId: playerId, action: "UPDATED", userId: ctx.userId, userEmail: ctx.userEmail });
    return { status: 200, body: { ok: true } };
  }

  if (method === "GET" && pathname === "/api/seasons") {
    const seasons = await listSeasons(params.get("includeArchived") === "true");
    return { status: 200, body: seasons };
  }

  if (method === "POST" && pathname === "/api/seasons") {
    const payload = body as { name?: unknown; topScoresCount?: unknown; startDate?: unknown; endDate?: unknown };
    if (!isNonEmptyString(payload?.name)) throw new ApiError(400, "Seizoensnaam is verplicht.");
    const topScoresCount =
      typeof payload.topScoresCount === "number" && Number.isInteger(payload.topScoresCount)
        ? payload.topScoresCount
        : 7;
    if (topScoresCount < 1) throw new ApiError(400, "Aantal beste scores moet minimaal 1 zijn.");
    const season = await insertSeason({
      name: payload.name.trim(),
      topScoresCount,
      startDate: typeof payload.startDate === "string" ? payload.startDate : null,
      endDate: typeof payload.endDate === "string" ? payload.endDate : null
    });
    await insertAuditLog({ entityType: "season", entityId: season.id, action: "CREATED", userId: ctx.userId, userEmail: ctx.userEmail });
    return { status: 201, body: { id: season.id } };
  }

  const seasonMatch = pathname.match(/^\/api\/seasons\/(\d+)$/);
  if (method === "PATCH" && seasonMatch) {
    const seasonId = Number(seasonMatch[1]);
    const payload = body as {
      name?: unknown;
      topScoresCount?: unknown;
      startDate?: unknown;
      endDate?: unknown;
      isArchived?: unknown;
    };
    if (
      payload?.name === undefined &&
      payload?.topScoresCount === undefined &&
      payload?.startDate === undefined &&
      payload?.endDate === undefined &&
      payload?.isArchived === undefined
    ) {
      throw new ApiError(400, "Geen wijzigingen opgegeven.");
    }
    if (!(await findSeasonById(seasonId))) throw new ApiError(404, "Seizoen niet gevonden.");

    const updates: Partial<{
      name: string;
      top_scores_count: number;
      start_date: string | null;
      end_date: string | null;
      is_archived: boolean;
    }> = {};
    if (payload?.name !== undefined) {
      if (!isNonEmptyString(payload.name)) throw new ApiError(400, "Ongeldige seizoensgegevens.");
      updates.name = payload.name.trim();
    }
    if (payload?.topScoresCount !== undefined) {
      if (typeof payload.topScoresCount !== "number" || !Number.isInteger(payload.topScoresCount) || payload.topScoresCount < 1) {
        throw new ApiError(400, "Ongeldige seizoensgegevens.");
      }
      updates.top_scores_count = payload.topScoresCount;
    }
    if (payload?.startDate !== undefined) {
      updates.start_date = typeof payload.startDate === "string" ? payload.startDate : null;
    }
    if (payload?.endDate !== undefined) {
      updates.end_date = typeof payload.endDate === "string" ? payload.endDate : null;
    }
    if (payload?.isArchived !== undefined) {
      updates.is_archived = Boolean(payload.isArchived);
    }
    await updateSeasonRow(seasonId, updates);
    await insertAuditLog({ entityType: "season", entityId: seasonId, action: "UPDATED", userId: ctx.userId, userEmail: ctx.userEmail });
    return { status: 200, body: { ok: true } };
  }

  throw new ApiError(404, "Niet gevonden.");
}
```

- [x] **Step 4: Run to verify pass**

```bash
cd netlify && npx vitest run lib/router.test.ts
```

Expected: PASS (4 tests).

- [x] **Step 5: Commit**

```bash
git add netlify/lib/router.ts netlify/lib/router.test.ts
git commit -m "Add players and seasons API router with tests"
```

---

### Task 9: API router — events, participants, lock/unlock & season ranking

**Files:**
- Modify: `netlify/lib/router.ts` (add imports at top; insert new route blocks in `dispatch()` directly above the final `throw new ApiError(404, "Niet gevonden.");` line; add a `buildEventDetail`/`validatePrizeRanks`/`getSeasonRanking` helper section below `dispatch()`)
- Modify: `netlify/lib/router.test.ts` (append new test suites)

**Interfaces:**
- Consumes: `computeRanking`, `canLockEvent` (Task 4); `events.ts` functions (Task 7).
- Produces: extends `handleApiRequest` to cover `/api/events*` and `/api/seasons/:id/ranking` — the full surface Task 10's Netlify Function exposes.

- [x] **Step 1: Append the failing tests**

Add to `netlify/lib/router.test.ts`:

```ts
describe("events endpoints", () => {
  it("blocks locking until every participant has all three scores", async () => {
    const season = await handleApiRequest("POST", "/api/seasons", new URLSearchParams(), { name: "2026" }, ctx);
    const seasonId = (season.body as { id: number }).id;
    const event = await handleApiRequest(
      "POST",
      "/api/events",
      new URLSearchParams(),
      { seasonId, eventDate: "2026-07-02" },
      ctx
    );
    const eventId = (event.body as { id: number }).id;
    const player = await handleApiRequest("POST", "/api/players", new URLSearchParams(), { name: "Jan" }, ctx);
    const playerId = (player.body as { id: number }).id;
    await handleApiRequest("POST", `/api/events/${eventId}/participants`, new URLSearchParams(), { playerId }, ctx);

    const lockAttempt = await handleApiRequest("POST", `/api/events/${eventId}/lock`, new URLSearchParams(), undefined, ctx);
    expect(lockAttempt.status).toBe(400);
  });

  it("locks successfully once all scores are known, then rejects further edits", async () => {
    const season = await handleApiRequest("POST", "/api/seasons", new URLSearchParams(), { name: "2026" }, ctx);
    const seasonId = (season.body as { id: number }).id;
    const event = await handleApiRequest(
      "POST",
      "/api/events",
      new URLSearchParams(),
      { seasonId, eventDate: "2026-07-02" },
      ctx
    );
    const eventId = (event.body as { id: number }).id;
    const player = await handleApiRequest("POST", "/api/players", new URLSearchParams(), { name: "Jan" }, ctx);
    const playerId = (player.body as { id: number }).id;
    const participant = await handleApiRequest(
      "POST",
      `/api/events/${eventId}/participants`,
      new URLSearchParams(),
      { playerId },
      ctx
    );
    const participantId = (participant.body as { id: number }).id;

    await handleApiRequest(
      "PATCH",
      `/api/events/${eventId}/participants/${participantId}`,
      new URLSearchParams(),
      { pointsR1: 10, pointsR2: 10, pointsR3: 10 },
      ctx
    );

    const lockResult = await handleApiRequest("POST", `/api/events/${eventId}/lock`, new URLSearchParams(), undefined, ctx);
    expect(lockResult.status).toBe(200);

    const editAttempt = await handleApiRequest(
      "PATCH",
      `/api/events/${eventId}/participants/${participantId}`,
      new URLSearchParams(),
      { pointsR1: 5 },
      ctx
    );
    expect(editAttempt.status).toBe(400);
  });
});

describe("season ranking endpoint", () => {
  it("is unavailable while a due event is still open", async () => {
    const season = await handleApiRequest("POST", "/api/seasons", new URLSearchParams(), { name: "2026" }, ctx);
    const seasonId = (season.body as { id: number }).id;
    await handleApiRequest("POST", "/api/events", new URLSearchParams(), { seasonId, eventDate: "2020-01-01" }, ctx);

    const ranking = await handleApiRequest("GET", `/api/seasons/${seasonId}/ranking`, new URLSearchParams(), undefined, ctx);
    expect((ranking.body as { available: boolean }).available).toBe(false);
  });
});
```

- [x] **Step 2: Run to verify failure**

```bash
cd netlify && npx vitest run lib/router.test.ts
```

Expected: FAIL — the new routes 404 because they don't exist yet.

- [x] **Step 3: Add imports to the top of `netlify/lib/router.ts`**

```ts
import { canLockEvent, computeRanking } from "./ranking";
import {
  countParticipants,
  deleteParticipantRow,
  findParticipant,
  getEventRowById,
  getParticipants,
  insertEvent,
  insertParticipant,
  listEvents,
  listEventRowsForSeason,
  updateEventRow,
  updateParticipantRow
} from "./events";
import type { EventRow } from "./types";
```

- [x] **Step 4: Insert the new route blocks in `dispatch()`**

Insert this directly above the final `throw new ApiError(404, "Niet gevonden.");` line in `dispatch()`:

```ts
  if (method === "POST" && pathname === "/api/events") {
    const payload = body as {
      seasonId?: unknown;
      eventDate?: unknown;
      title?: unknown;
      notes?: unknown;
      prizeRank1?: unknown;
      prizeRank2?: unknown;
      prizeRank3?: unknown;
    };
    if (!isNonEmptyString(payload?.eventDate) || !Number.isInteger(payload?.seasonId)) {
      throw new ApiError(400, "Ongeldige kaartavondgegevens.");
    }
    const prizeRanks: [number, number, number] = [
      typeof payload.prizeRank1 === "number" ? payload.prizeRank1 : 1,
      typeof payload.prizeRank2 === "number" ? payload.prizeRank2 : 18,
      typeof payload.prizeRank3 === "number" ? payload.prizeRank3 : 25
    ];
    const prizeError = validatePrizeRanks(prizeRanks);
    if (prizeError) throw new ApiError(400, prizeError);

    if (!(await findSeasonById(payload.seasonId as number))) throw new ApiError(404, "Seizoen niet gevonden.");

    const event = await insertEvent({
      seasonId: payload.seasonId as number,
      eventDate: payload.eventDate as string,
      title: typeof payload.title === "string" ? payload.title : null,
      notes: typeof payload.notes === "string" ? payload.notes : null,
      prizeRanks
    });
    await insertAuditLog({ entityType: "event", entityId: event.id, action: "CREATED", userId: ctx.userId, userEmail: ctx.userEmail });
    return { status: 201, body: { id: event.id } };
  }

  if (method === "GET" && pathname === "/api/events") {
    const seasonIdParam = params.get("seasonId");
    const events = await listEvents(seasonIdParam ? Number(seasonIdParam) : null, params.get("includeArchived") === "true");
    return { status: 200, body: events };
  }

  const eventDetailMatch = pathname.match(/^\/api\/events\/(\d+)$/);
  if (method === "GET" && eventDetailMatch) {
    const event = await getEventRowById(Number(eventDetailMatch[1]));
    if (!event) throw new ApiError(404, "Kaartavond niet gevonden.");
    return { status: 200, body: await buildEventDetail(event) };
  }

  if (method === "PATCH" && eventDetailMatch) {
    const eventId = Number(eventDetailMatch[1]);
    const event = await getEventRowById(eventId);
    if (!event) throw new ApiError(404, "Kaartavond niet gevonden.");
    if (event.status === "LOCKED") throw new ApiError(400, "Kaartavond is vergrendeld.");

    const payload = body as {
      eventDate?: unknown;
      title?: unknown;
      notes?: unknown;
      isArchived?: unknown;
      prizeRank1?: unknown;
      prizeRank2?: unknown;
      prizeRank3?: unknown;
    };
    if (
      payload?.eventDate === undefined &&
      payload?.title === undefined &&
      payload?.notes === undefined &&
      payload?.isArchived === undefined &&
      payload?.prizeRank1 === undefined &&
      payload?.prizeRank2 === undefined &&
      payload?.prizeRank3 === undefined
    ) {
      throw new ApiError(400, "Geen wijzigingen opgegeven.");
    }

    const updates: Partial<{
      event_date: string;
      title: string | null;
      notes: string | null;
      is_archived: boolean;
      prize_rank_1: number;
      prize_rank_2: number;
      prize_rank_3: number;
    }> = {};

    if (payload?.eventDate !== undefined) {
      if (!isNonEmptyString(payload.eventDate)) throw new ApiError(400, "Ongeldige kaartavondgegevens.");
      updates.event_date = payload.eventDate;
    }
    if (payload?.title !== undefined) updates.title = typeof payload.title === "string" ? payload.title : null;
    if (payload?.notes !== undefined) updates.notes = typeof payload.notes === "string" ? payload.notes : null;
    if (payload?.isArchived !== undefined) updates.is_archived = Boolean(payload.isArchived);

    if (payload?.prizeRank1 !== undefined || payload?.prizeRank2 !== undefined || payload?.prizeRank3 !== undefined) {
      const nextPrizeRanks = [
        typeof payload.prizeRank1 === "number" ? payload.prizeRank1 : event.prize_rank_1,
        typeof payload.prizeRank2 === "number" ? payload.prizeRank2 : event.prize_rank_2,
        typeof payload.prizeRank3 === "number" ? payload.prizeRank3 : event.prize_rank_3
      ];
      const prizeError = validatePrizeRanks(nextPrizeRanks);
      if (prizeError) throw new ApiError(400, prizeError);
      updates.prize_rank_1 = nextPrizeRanks[0];
      updates.prize_rank_2 = nextPrizeRanks[1];
      updates.prize_rank_3 = nextPrizeRanks[2];
    }

    await updateEventRow(eventId, updates);
    await insertAuditLog({ entityType: "event", entityId: eventId, action: "UPDATED", userId: ctx.userId, userEmail: ctx.userEmail });
    return { status: 200, body: { ok: true } };
  }

  const addParticipantMatch = pathname.match(/^\/api\/events\/(\d+)\/participants$/);
  if (method === "POST" && addParticipantMatch) {
    const eventId = Number(addParticipantMatch[1]);
    const payload = body as { playerId?: unknown };
    if (!Number.isInteger(payload?.playerId)) throw new ApiError(400, "Ongeldige deelnemer.");

    const event = await getEventRowById(eventId);
    if (!event) throw new ApiError(404, "Kaartavond niet gevonden.");
    if (event.status === "LOCKED") throw new ApiError(400, "Kaartavond is vergrendeld.");

    if ((await countParticipants(eventId)) >= 60) throw new ApiError(400, "Maximaal 60 deelnemers toegestaan.");

    const player = await getPlayerById(payload.playerId as number);
    if (!player) throw new ApiError(404, "Speler niet gevonden.");
    if (player.is_archived) throw new ApiError(400, "Gearchiveerde speler kan niet worden toegevoegd.");

    if (await findParticipant(eventId, payload.playerId as number)) throw new ApiError(400, "Speler is al toegevoegd.");

    const participant = await insertParticipant(eventId, payload.playerId as number);
    await insertAuditLog({ entityType: "participant", entityId: participant.id, action: "CREATED", userId: ctx.userId, userEmail: ctx.userEmail });
    return { status: 201, body: { id: participant.id } };
  }

  const participantMatch = pathname.match(/^\/api\/events\/(\d+)\/participants\/(\d+)$/);
  if (method === "PATCH" && participantMatch) {
    const eventId = Number(participantMatch[1]);
    const participantId = Number(participantMatch[2]);
    const event = await getEventRowById(eventId);
    if (!event) throw new ApiError(404, "Kaartavond niet gevonden.");
    if (event.status === "LOCKED") throw new ApiError(400, "Kaartavond is vergrendeld.");

    const payload = body as Record<string, unknown>;
    if (payload?.pointsR1 === undefined && payload?.pointsR2 === undefined && payload?.pointsR3 === undefined) {
      throw new ApiError(400, "Geen wijzigingen opgegeven.");
    }

    const updates: Partial<{ points_r1: number | null; points_r2: number | null; points_r3: number | null }> = {};
    for (const [key, dbKey] of [
      ["pointsR1", "points_r1"],
      ["pointsR2", "points_r2"],
      ["pointsR3", "points_r3"]
    ] as const) {
      const value = payload[key];
      if (value === undefined) continue;
      if (value !== null && !(typeof value === "number" && Number.isInteger(value) && value >= 0)) {
        throw new ApiError(400, "Ongeldige punten.");
      }
      updates[dbKey] = value === null ? null : value;
    }

    await updateParticipantRow(participantId, updates);
    await insertAuditLog({ entityType: "participant", entityId: participantId, action: "UPDATED", userId: ctx.userId, userEmail: ctx.userEmail });
    return { status: 200, body: { ok: true } };
  }

  if (method === "DELETE" && participantMatch) {
    const eventId = Number(participantMatch[1]);
    const participantId = Number(participantMatch[2]);
    const event = await getEventRowById(eventId);
    if (!event) throw new ApiError(404, "Kaartavond niet gevonden.");
    if (event.status === "LOCKED") throw new ApiError(400, "Kaartavond is vergrendeld.");

    if ((await deleteParticipantRow(eventId, participantId)) === 0) throw new ApiError(404, "Deelnemer niet gevonden.");
    await insertAuditLog({ entityType: "participant", entityId: participantId, action: "DELETED", userId: ctx.userId, userEmail: ctx.userEmail });
    return { status: 200, body: { ok: true } };
  }

  const lockMatch = pathname.match(/^\/api\/events\/(\d+)\/lock$/);
  if (method === "POST" && lockMatch) {
    const eventId = Number(lockMatch[1]);
    const event = await getEventRowById(eventId);
    if (!event) throw new ApiError(404, "Kaartavond niet gevonden.");
    if (event.status === "LOCKED") throw new ApiError(400, "Kaartavond is al vergrendeld.");

    const participants = await getParticipants(eventId);
    const prizeRanks = [event.prize_rank_1, event.prize_rank_2, event.prize_rank_3];
    const ranking = computeRanking(participants, prizeRanks);
    const lockCheck = canLockEvent(ranking.participants, ranking.tieErrors);
    if (!lockCheck.allowed) throw new ApiError(400, "Kaartavond kan niet worden vergrendeld.");

    await updateEventRow(eventId, { status: "LOCKED", locked_at: new Date().toISOString() });
    await insertAuditLog({ entityType: "event", entityId: eventId, action: "LOCKED", userId: ctx.userId, userEmail: ctx.userEmail });
    return { status: 200, body: { ok: true } };
  }

  const unlockMatch = pathname.match(/^\/api\/events\/(\d+)\/unlock$/);
  if (method === "POST" && unlockMatch) {
    const eventId = Number(unlockMatch[1]);
    const event = await getEventRowById(eventId);
    if (!event) throw new ApiError(404, "Kaartavond niet gevonden.");
    if (event.status === "OPEN") throw new ApiError(400, "Kaartavond is al open.");

    await updateEventRow(eventId, { status: "OPEN", locked_at: null });
    await insertAuditLog({ entityType: "event", entityId: eventId, action: "UNLOCKED", userId: ctx.userId, userEmail: ctx.userEmail });
    return { status: 200, body: { ok: true } };
  }

  const seasonRankingMatch = pathname.match(/^\/api\/seasons\/(\d+)\/ranking$/);
  if (method === "GET" && seasonRankingMatch) {
    return { status: 200, body: await getSeasonRanking(Number(seasonRankingMatch[1])) };
  }
```

- [x] **Step 5: Add helper functions below `dispatch()` in `netlify/lib/router.ts`**

```ts
function validatePrizeRanks(prizeRanks: number[]): string | null {
  const unique = new Set(prizeRanks);
  return unique.size !== prizeRanks.length ? "Prijsrangen moeten uniek zijn." : null;
}

async function buildEventDetail(event: EventRow) {
  const participants = await getParticipants(event.id);
  const prizeRanks = [event.prize_rank_1, event.prize_rank_2, event.prize_rank_3];
  const ranking = computeRanking(participants, prizeRanks);
  const lockCheck = canLockEvent(ranking.participants, ranking.tieErrors);

  return {
    id: event.id,
    seasonId: event.season_id,
    eventDate: event.event_date,
    title: event.title,
    notes: event.notes,
    prizeRanks,
    status: event.status,
    isArchived: event.is_archived,
    lockedAt: event.locked_at,
    participants: ranking.participants.map((participant) => ({
      id: participant.id,
      playerId: participant.player_id,
      playerName: participant.player_name,
      pointsR1: participant.points_r1,
      pointsR2: participant.points_r2,
      pointsR3: participant.points_r3,
      totalPoints: participant.total_points,
      rankR1: participant.rank_r1,
      rankR2: participant.rank_r2,
      rankR3: participant.rank_r3
    })),
    roundWinners: ranking.roundWinners,
    eventWinners: ranking.eventWinners,
    eventWinner: ranking.eventWinner,
    tieErrors: ranking.tieErrors,
    canLock: lockCheck.allowed,
    lockReasons: lockCheck.reasons
  };
}

async function getSeasonRanking(seasonId: number) {
  const season = await findSeasonById(seasonId);
  const topScoresCount = season?.top_scores_count ?? 7;
  const events = await listEventRowsForSeason(seasonId);
  const relevant = events.filter((event) => !event.is_archived);
  const today = new Date().toISOString().slice(0, 10);
  const blockingOpenEvents = relevant.filter((event) => event.status !== "LOCKED" && event.event_date <= today);
  if (blockingOpenEvents.length > 0) {
    return {
      available: false,
      message: "Het klassement is pas beschikbaar wanneer alle kaartavonden tot en met vandaag zijn vergrendeld.",
      openEventIds: blockingOpenEvents.map((event) => event.id)
    };
  }

  const lockedEvents = relevant.filter((event) => event.status === "LOCKED");
  const totals = new Map<number, { playerId: number; playerName: string; scores: number[] }>();

  for (const event of lockedEvents) {
    const participants = await getParticipants(event.id);
    for (const participant of participants) {
      if (participant.points_r1 === null || participant.points_r2 === null || participant.points_r3 === null) continue;
      const total = participant.points_r1 + participant.points_r2 + participant.points_r3;
      const entry = totals.get(participant.player_id) || {
        playerId: participant.player_id,
        playerName: participant.player_name,
        scores: []
      };
      entry.scores.push(total);
      totals.set(participant.player_id, entry);
    }
  }

  const ranking = Array.from(totals.values())
    .map((entry) => {
      const sortedScores = [...entry.scores].sort((a, b) => b - a);
      const usedScores = sortedScores.slice(0, topScoresCount);
      return {
        playerId: entry.playerId,
        playerName: entry.playerName,
        total: usedScores.reduce((sum, score) => sum + score, 0),
        appearances: usedScores.length
      };
    })
    .sort((a, b) => b.total - a.total);

  const seenTotals = new Set<number>();
  const tieWarning = ranking.some((entry) => {
    if (seenTotals.has(entry.total)) return true;
    seenTotals.add(entry.total);
    return false;
  });

  return {
    available: true,
    tieWarning,
    ranking: ranking.map((entry, index) => ({
      rank: index + 1,
      playerId: entry.playerId,
      playerName: entry.playerName,
      seasonTotal: entry.total,
      appearances: entry.appearances
    }))
  };
}
```

- [x] **Step 6: Run to verify pass**

```bash
cd netlify && npx vitest run lib/router.test.ts
```

Expected: PASS (all suites, 7 tests total).

- [x] **Step 7: Commit**

```bash
git add netlify/lib/router.ts netlify/lib/router.test.ts
git commit -m "Add events, participants, lock/unlock and season ranking routes"
```

---

### Task 10: Netlify Function entrypoint, config, and local smoke test

**Files:**
- Create: `netlify/functions/api.ts`
- Create: `netlify.toml`

**Interfaces:**
- Consumes: `handleApiRequest` (Task 8/9), `supabaseAdmin` (Task 3).
- Produces: a deployed/local HTTP endpoint at `/api/*` that the client (Task 13) calls.

- [x] **Step 1: Create `netlify/functions/api.ts`**

```ts
import type { Config, Context } from "@netlify/functions";
import { supabaseAdmin } from "../lib/supabaseAdmin";
import { handleApiRequest } from "../lib/router";

export const config: Config = { path: "/api/*" };

export default async (req: Request, _context: Context): Promise<Response> => {
  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) return jsonResponse(401, { message: "Niet ingelogd." });

  const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
  if (userError || !userData.user) return jsonResponse(401, { message: "Niet ingelogd." });

  let body: unknown;
  if (req.method !== "GET" && req.method !== "DELETE") {
    try {
      body = await req.json();
    } catch {
      body = undefined;
    }
  }

  const url = new URL(req.url);
  const result = await handleApiRequest(req.method, url.pathname, url.searchParams, body, {
    userId: userData.user.id,
    userEmail: userData.user.email ?? ""
  });

  return jsonResponse(result.status, result.body);
};

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}
```

- [x] **Step 2: Create `netlify.toml` at the repo root**

```toml
[build]
  base = "."
  command = "cd netlify && npm install && cd ../client && npm install && npm run build"
  publish = "client/dist"

[functions]
  directory = "netlify/functions"
  node_bundler = "esbuild"
```

- [x] **Step 3: Run the smoke test**

```bash
netlify dev
```

In a second terminal, get a token for the test user created in Task 1, Step 7 (replace placeholders):

```bash
curl -X POST 'https://<project-ref>.supabase.co/auth/v1/token?grant_type=password' \
  -H "apikey: <anon-key>" \
  -H "Content-Type: application/json" \
  -d '{"email":"you@example.com","password":"yourpassword"}'
```

Copy the `access_token` from the response, then:

```bash
curl http://localhost:8888/api/players -H "Authorization: Bearer <access_token>"
```

Expected: `[]` (empty array, 200 status — no players yet).

```bash
curl http://localhost:8888/api/players
```

Expected: `{"message":"Niet ingelogd."}` with a 401 status (no `Authorization` header).

- [x] **Step 4: Commit**

```bash
git add netlify/functions/api.ts netlify.toml
git commit -m "Add Netlify Function entrypoint wiring the API router behind Supabase Auth"
```

---

### Task 11: Backups, restore & data-management endpoints

**Files:**
- Create: `netlify/lib/backup.ts`
- Create: `netlify/lib/backup.test.ts`
- Create: `netlify/lib/dataManagement.ts`
- Create: `netlify/functions/backup-scheduled.ts`
- Create: `netlify/scripts/restore-from-snapshot.ts`
- Create: `supabase/migrations/20260702130000_reset_identity_sequences_fn.sql`
- Create: `docs/RESTORE_RUNBOOK.md`
- Modify: `netlify/lib/router.ts` (add `/api/data/*` routes; add a background backup call after locking)

**Interfaces:**
- Consumes: `supabaseAdmin` (Task 3), the lock route added in Task 9.
- Produces: `buildSnapshot`, `runBackupSnapshot`, `exportAllData`, `wipeAllData`, `importSnapshot` — consumed by the new `/api/data/*` routes here and by the client's Databeheer page in Task 14.

- [ ] **Step 1: Add the identity-sequence-reset SQL function**

Create `supabase/migrations/20260702130000_reset_identity_sequences_fn.sql`:

```sql
create or replace function reset_identity_sequences()
returns void
language plpgsql
security definer
as $$
begin
  perform setval(pg_get_serial_sequence('players', 'id'), coalesce((select max(id) from players), 0) + 1, false);
  perform setval(pg_get_serial_sequence('seasons', 'id'), coalesce((select max(id) from seasons), 0) + 1, false);
  perform setval(pg_get_serial_sequence('events', 'id'), coalesce((select max(id) from events), 0) + 1, false);
  perform setval(pg_get_serial_sequence('event_participants', 'id'), coalesce((select max(id) from event_participants), 0) + 1, false);
  perform setval(pg_get_serial_sequence('audit_log', 'id'), coalesce((select max(id) from audit_log), 0) + 1, false);
end;
$$;

revoke execute on function reset_identity_sequences() from public;
grant execute on function reset_identity_sequences() to service_role;
```

Apply it:

```bash
supabase db reset
supabase db push
```

- [ ] **Step 2: Write the failing test for the snapshot builder**

Create `netlify/lib/backup.test.ts`:

```ts
import "dotenv/config";
import { beforeEach, describe, expect, it } from "vitest";
import { insertPlayer } from "./players";
import { buildSnapshot } from "./backup";
import { resetDatabase } from "./testHelpers";

beforeEach(async () => {
  await resetDatabase();
});

describe("buildSnapshot", () => {
  it("includes every table and a timestamp", async () => {
    await insertPlayer("Jan Jansen");
    const snapshot = await buildSnapshot();
    expect(snapshot.players).toHaveLength(1);
    expect(snapshot.seasons).toEqual([]);
    expect(typeof snapshot.createdAt).toBe("string");
  });
});
```

- [ ] **Step 3: Run to verify failure**

```bash
cd netlify && npx vitest run lib/backup.test.ts
```

Expected: FAIL — `./backup` not found.

- [ ] **Step 4: Create `netlify/lib/backup.ts`**

```ts
import { supabaseAdmin } from "./supabaseAdmin";

export type BackupSnapshot = {
  createdAt: string;
  players: unknown[];
  seasons: unknown[];
  events: unknown[];
  eventParticipants: unknown[];
  auditLog: unknown[];
};

async function fetchAll(table: string): Promise<unknown[]> {
  const { data, error } = await supabaseAdmin.from(table).select("*");
  if (error) throw new Error(`Kon tabel ${table} niet lezen: ${error.message}`);
  return data ?? [];
}

export async function buildSnapshot(): Promise<BackupSnapshot> {
  const [players, seasons, events, eventParticipants, auditLog] = await Promise.all([
    fetchAll("players"),
    fetchAll("seasons"),
    fetchAll("events"),
    fetchAll("event_participants"),
    fetchAll("audit_log")
  ]);
  return { createdAt: new Date().toISOString(), players, seasons, events, eventParticipants, auditLog };
}

function backupFilePath(createdAt: string): string {
  return `backups/kaartbuddy-${createdAt.replace(/[:.]/g, "-")}.json`;
}

export async function commitSnapshotToGitHub(snapshot: BackupSnapshot): Promise<string> {
  const token = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPO;
  const branch = process.env.GITHUB_BACKUP_BRANCH || "backups";
  if (!token || !repo) throw new Error("GITHUB_TOKEN en GITHUB_REPO moeten ingesteld zijn.");

  const path = backupFilePath(snapshot.createdAt);
  const content = Buffer.from(JSON.stringify(snapshot, null, 2), "utf8").toString("base64");

  const response = await fetch(`https://api.github.com/repos/${repo}/contents/${path}`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ message: `Backup ${snapshot.createdAt}`, content, branch })
  });

  if (!response.ok) {
    throw new Error(`GitHub backup mislukt (${response.status}): ${await response.text()}`);
  }
  return path;
}

export async function runBackupSnapshot(): Promise<string> {
  return commitSnapshotToGitHub(await buildSnapshot());
}
```

- [ ] **Step 5: Run to verify pass**

```bash
cd netlify && npx vitest run lib/backup.test.ts
```

Expected: PASS (1 test — this test only exercises `buildSnapshot`, not the GitHub commit, so no `GITHUB_TOKEN` is needed for it).

- [ ] **Step 6: Create `netlify/lib/dataManagement.ts`**

```ts
import { supabaseAdmin } from "./supabaseAdmin";
import type { BackupSnapshot } from "./backup";
import { buildSnapshot } from "./backup";

export async function exportAllData(): Promise<BackupSnapshot> {
  return buildSnapshot();
}

export async function wipeAllData(): Promise<void> {
  await supabaseAdmin.from("audit_log").delete().neq("id", 0);
  await supabaseAdmin.from("event_participants").delete().neq("id", 0);
  await supabaseAdmin.from("events").delete().neq("id", 0);
  await supabaseAdmin.from("seasons").delete().neq("id", 0);
  await supabaseAdmin.from("players").delete().neq("id", 0);
}

export async function importSnapshot(snapshot: BackupSnapshot): Promise<void> {
  await wipeAllData();

  const inserts: Array<[string, unknown[]]> = [
    ["players", snapshot.players],
    ["seasons", snapshot.seasons],
    ["events", snapshot.events],
    ["event_participants", snapshot.eventParticipants],
    ["audit_log", snapshot.auditLog]
  ];
  for (const [table, rows] of inserts) {
    if (rows.length === 0) continue;
    const { error } = await supabaseAdmin.from(table).insert(rows);
    if (error) throw new Error(`Import van ${table} mislukt: ${error.message}`);
  }

  const { error: sequenceError } = await supabaseAdmin.rpc("reset_identity_sequences");
  if (sequenceError) throw new Error(`Sequenties resetten mislukt: ${sequenceError.message}`);
}
```

- [ ] **Step 7: Add `/api/data/*` routes to `netlify/lib/router.ts`**

Add this import at the top:

```ts
import { exportAllData, importSnapshot, wipeAllData } from "./dataManagement";
import { runBackupSnapshot, type BackupSnapshot } from "./backup";
```

Insert these route blocks in `dispatch()`, above the final `throw new ApiError(404, "Niet gevonden.");`:

```ts
  if (method === "GET" && pathname === "/api/data/export") {
    return { status: 200, body: await exportAllData() };
  }

  if (method === "POST" && pathname === "/api/data/import") {
    const payload = body as Partial<BackupSnapshot>;
    if (
      !payload ||
      !Array.isArray(payload.players) ||
      !Array.isArray(payload.seasons) ||
      !Array.isArray(payload.events) ||
      !Array.isArray(payload.eventParticipants) ||
      !Array.isArray(payload.auditLog)
    ) {
      throw new ApiError(400, "Ongeldig back-upbestand.");
    }
    await importSnapshot(payload as BackupSnapshot);
    await insertAuditLog({ entityType: "data", entityId: 0, action: "IMPORTED", userId: ctx.userId, userEmail: ctx.userEmail });
    return { status: 200, body: { ok: true } };
  }

  if (method === "POST" && pathname === "/api/data/wipe") {
    await wipeAllData();
    await insertAuditLog({ entityType: "data", entityId: 0, action: "WIPED", userId: ctx.userId, userEmail: ctx.userEmail });
    return { status: 200, body: { ok: true } };
  }

  if (method === "POST" && pathname === "/api/data/backup-now") {
    return { status: 200, body: { path: await runBackupSnapshot() } };
  }
```

- [ ] **Step 8: Add a background backup after locking**

In the `/api/events/:id/lock` block added in Task 9, replace:

```ts
    await insertAuditLog({ entityType: "event", entityId: eventId, action: "LOCKED", userId: ctx.userId, userEmail: ctx.userEmail });
    return { status: 200, body: { ok: true } };
```

with:

```ts
    await insertAuditLog({ entityType: "event", entityId: eventId, action: "LOCKED", userId: ctx.userId, userEmail: ctx.userEmail });
    try {
      await runBackupSnapshot();
    } catch (backupError) {
      console.error("Achtergrond-backup na vergrendelen is mislukt:", backupError);
    }
    return { status: 200, body: { ok: true } };
```

(A GitHub outage must not block the operator from locking an event — the daily scheduled backup remains a safety net.)

- [ ] **Step 9: Create the scheduled backup function**

Create `netlify/functions/backup-scheduled.ts`:

```ts
import type { Config } from "@netlify/functions";
import { runBackupSnapshot } from "../lib/backup";

export const config: Config = { schedule: "0 2 * * *" };

export default async (): Promise<Response> => {
  await runBackupSnapshot();
  return new Response("ok");
};
```

- [ ] **Step 10: Create the restore script**

Create `netlify/scripts/restore-from-snapshot.ts`:

```ts
import { readFileSync } from "node:fs";
import { importSnapshot } from "../lib/dataManagement";
import type { BackupSnapshot } from "../lib/backup";

async function main() {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error("Gebruik: npx tsx scripts/restore-from-snapshot.ts <pad-naar-snapshot.json>");
    process.exit(1);
  }
  const snapshot = JSON.parse(readFileSync(filePath, "utf8")) as BackupSnapshot;
  await importSnapshot(snapshot);
  console.log(`Herstel voltooid vanuit ${filePath}.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
```

- [ ] **Step 11: Create `docs/RESTORE_RUNBOOK.md`**

```markdown
# Restore runbook

1. Find the most recent snapshot in the `backups/` folder on the `backups` branch of `vollepeer/slagenhalen`.
2. Download the file locally.
3. Set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` (in `netlify/.env` or your shell) to the target Supabase project — the existing one, or a freshly created replacement if the original is unrecoverable.
4. If restoring into a brand-new Supabase project: run the schema migrations first (`supabase db push`), and re-create the named user accounts in Supabase Auth (they are not part of the data snapshot).
5. Run:
   ```
   cd netlify
   npx tsx scripts/restore-from-snapshot.ts /path/to/kaartbuddy-<timestamp>.json
   ```
6. Verify: open the app, confirm players/seasons/events match the snapshot's timestamp.
```

- [ ] **Step 12: Exercise the restore path once, end to end, against a scratch Supabase project**

Create a second, throwaway Supabase project via the dashboard, run `supabase db push` against it (temporarily re-linking, or use `supabase link` with a `--project-ref` override), then run the restore script from Step 10 against a real snapshot downloaded from the `backups` branch. Confirm the data appears via `supabase db execute --sql "select count(*) from players;"`. Delete the scratch project afterward.

- [ ] **Step 13: Commit**

```bash
git add netlify/lib/backup.ts netlify/lib/backup.test.ts netlify/lib/dataManagement.ts \
  netlify/lib/router.ts netlify/functions/backup-scheduled.ts netlify/scripts/restore-from-snapshot.ts \
  supabase/migrations/20260702130000_reset_identity_sequences_fn.sql docs/RESTORE_RUNBOOK.md
git commit -m "Add backups, restore tooling, and data-management API endpoints"
```

---

### Task 12: Client — Supabase Auth login

**Files:**
- Modify: `client/package.json` (add `@supabase/supabase-js`)
- Create: `client/src/supabaseClient.ts`
- Create: `client/src/auth/AuthContext.tsx`
- Create: `client/src/pages/LoginPage.tsx`
- Modify: `client/src/App.tsx` (auth guard + logout button)
- Modify: `client/src/main.tsx` (wrap with `AuthProvider`)

**Interfaces:**
- Produces: `useAuth()` (returns `{ session, loading, signIn, signOut }`), `<LoginPage />`, `<AuthProvider>` — consumed by `App.tsx` here and by `api.ts`'s auth headers in Task 13.

- [ ] **Step 1: Add the Supabase JS dependency**

In `client/package.json`, add to `dependencies`:

```json
    "@supabase/supabase-js": "^2.45.0",
```

```bash
cd client && npm install
```

- [ ] **Step 2: Create `client/src/supabaseClient.ts`**

```ts
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
```

- [ ] **Step 3: Create `client/src/auth/AuthContext.tsx`**

```tsx
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../supabaseClient";

type AuthContextValue = {
  session: Session | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<string | null>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return error ? "Ongeldige inloggegevens." : null;
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return <AuthContext.Provider value={{ session, loading, signIn, signOut }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth moet binnen AuthProvider gebruikt worden.");
  return ctx;
}
```

- [ ] **Step 4: Create `client/src/pages/LoginPage.tsx`**

```tsx
import { useState, type FormEvent } from "react";
import { Alert, Box, Button, Paper, Stack, TextField, Typography } from "@mui/material";
import { useAuth } from "../auth/AuthContext";

export function LoginPage() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError(await signIn(email, password));
    setSubmitting(false);
  };

  return (
    <Box sx={{ display: "flex", justifyContent: "center", mt: 10 }}>
      <Paper sx={{ p: 4, width: 360 }} component="form" onSubmit={handleSubmit}>
        <Stack spacing={2}>
          <Typography variant="h5" sx={{ fontWeight: 700 }}>
            KaartBuddy inloggen
          </Typography>
          {error && <Alert severity="error">{error}</Alert>}
          <TextField
            label="E-mailadres"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
            fullWidth
          />
          <TextField
            label="Wachtwoord"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            fullWidth
          />
          <Button type="submit" variant="contained" disabled={submitting}>
            Inloggen
          </Button>
        </Stack>
      </Paper>
    </Box>
  );
}
```

- [ ] **Step 5: Modify `client/src/main.tsx`** to wrap the app with `AuthProvider`

```tsx
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { CssBaseline, ThemeProvider } from "@mui/material";
import { App } from "./App";
import { theme } from "./theme";
import { AuthProvider } from "./auth/AuthContext";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <BrowserRouter>
        <AuthProvider>
          <App />
        </AuthProvider>
      </BrowserRouter>
    </ThemeProvider>
  </React.StrictMode>
);
```

- [ ] **Step 6: Modify `client/src/App.tsx`** to guard on session and add a logout button

Add imports:

```tsx
import { Button } from "@mui/material";
import { LoginPage } from "./pages/LoginPage";
import { useAuth } from "./auth/AuthContext";
```

At the top of the `App()` function body, before the existing `const location = useLocation();` line, add:

```tsx
  const { session, loading, signOut } = useAuth();
```

Immediately after the existing `const currentSettingsTab = ...` block (so all hooks still run unconditionally on every render), add:

```tsx
  if (loading) return null;
  if (!session) return <LoginPage />;
```

Inside the `Drawer`, right after the `KaartBuddy` `Typography` block, add:

```tsx
          <Typography variant="caption" sx={{ color: "#6b5e50" }}>
            {session.user.email}
          </Typography>
          <Button size="small" onClick={() => void signOut()} sx={{ mt: 1, px: 0 }}>
            Uitloggen
          </Button>
```

- [ ] **Step 7: Run the build to verify it typechecks**

```bash
cd client && npm run build
```

Expected: PASS — no TypeScript errors.

- [ ] **Step 8: Manually verify**

```bash
cd client && npm run dev
```

Expected: visiting `http://localhost:5173` shows the login form (not the app), since no Supabase session exists yet. Logging in with the Task 1 test user's credentials reveals the app shell.

- [ ] **Step 9: Commit**

```bash
git add client/package.json client/package-lock.json client/src/supabaseClient.ts client/src/auth client/src/pages/LoginPage.tsx client/src/App.tsx client/src/main.tsx
git commit -m "Add Supabase Auth login screen and session guard"
```

---

### Task 13: Client — swap `api.ts` to real fetch + retry/resilience queue

**Files:**
- Modify: `client/src/api.ts`
- Create: `client/src/retryQueue.ts`
- Create: `client/src/retryQueue.test.ts`
- Create: `client/src/usePendingSyncCount.ts`
- Modify: `client/src/App.tsx` (auto-flush + pending-sync indicator)
- Create: `client/vitest.config.ts`
- Modify: `client/package.json` (add `vitest`, `jsdom`, test script)

**Interfaces:**
- Consumes: `supabase` (Task 12).
- Produces: `apiGet`/`apiSend` (unchanged signatures — no page changes needed), `rawRequest`, `queueForRetry`, `getQueueLength`, `onQueueChange`, `flushQueue`, `startAutoFlush`, `usePendingSyncCount()`.

**Note:** this task provides a retry safety net for transient network failures (queue + auto-retry + a visible pending count), not a full optimistic-UI rework of every page — matching the "tolerate brief drops, assume reconnect same session" scope from the design (§3).

- [ ] **Step 1: Add test tooling to `client/package.json`**

Add to `devDependencies`:

```json
    "jsdom": "^24.1.0",
    "vitest": "^2.0.5"
```

Add to `scripts`:

```json
    "test": "vitest run"
```

```bash
cd client && npm install
```

- [ ] **Step 2: Create `client/vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom"
  }
});
```

- [ ] **Step 3: Write the failing tests**

Create `client/src/retryQueue.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushQueue, getQueueLength, onQueueChange, queueForRetry } from "./retryQueue";

beforeEach(() => {
  localStorage.clear();
});

describe("retryQueue", () => {
  it("stores a queued write and reports its length", () => {
    queueForRetry({ path: "/api/players", method: "POST", body: { name: "Jan" } });
    expect(getQueueLength()).toBe(1);
  });

  it("notifies listeners when the queue changes", () => {
    const listener = vi.fn();
    const unsubscribe = onQueueChange(listener);
    queueForRetry({ path: "/api/players", method: "POST", body: { name: "Jan" } });
    expect(listener).toHaveBeenLastCalledWith(1);
    unsubscribe();
  });

  it("flushes queued writes in order and clears them on success", async () => {
    queueForRetry({ path: "/api/players", method: "POST", body: { name: "Jan" } });
    const sendFn = vi.fn().mockResolvedValue({ ok: true });
    await flushQueue(sendFn);
    expect(sendFn).toHaveBeenCalledWith("/api/players", "POST", { name: "Jan" });
    expect(getQueueLength()).toBe(0);
  });

  it("stops flushing on the first failure, leaving the rest queued", async () => {
    queueForRetry({ path: "/api/players", method: "POST", body: { name: "Jan" } });
    queueForRetry({ path: "/api/players", method: "POST", body: { name: "Piet" } });
    const sendFn = vi.fn().mockRejectedValue(new Error("network"));
    await flushQueue(sendFn);
    expect(getQueueLength()).toBe(2);
  });
});
```

- [ ] **Step 4: Run to verify failure**

```bash
cd client && npx vitest run src/retryQueue.test.ts
```

Expected: FAIL — `./retryQueue` not found.

- [ ] **Step 5: Create `client/src/retryQueue.ts`**

```ts
const QUEUE_KEY = "kaartbuddy-pending-writes";

export type PendingWrite = {
  id: string;
  path: string;
  method: string;
  body?: unknown;
  createdAt: string;
};

type Listener = (count: number) => void;
const listeners = new Set<Listener>();
let flushing = false;

function readQueue(): PendingWrite[] {
  try {
    return JSON.parse(localStorage.getItem(QUEUE_KEY) || "[]");
  } catch {
    return [];
  }
}

function writeQueue(queue: PendingWrite[]) {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  listeners.forEach((listener) => listener(queue.length));
}

export function onQueueChange(listener: Listener): () => void {
  listeners.add(listener);
  listener(readQueue().length);
  return () => listeners.delete(listener);
}

export function queueForRetry(entry: Omit<PendingWrite, "id" | "createdAt">) {
  const queue = readQueue();
  queue.push({ ...entry, id: crypto.randomUUID(), createdAt: new Date().toISOString() });
  writeQueue(queue);
}

export function getQueueLength(): number {
  return readQueue().length;
}

export async function flushQueue(
  sendFn: (path: string, method: string, body?: unknown) => Promise<unknown>
): Promise<void> {
  if (flushing) return;
  flushing = true;
  try {
    let queue = readQueue();
    while (queue.length > 0) {
      const [next, ...rest] = queue;
      try {
        await sendFn(next.path, next.method, next.body);
        queue = rest;
        writeQueue(queue);
      } catch {
        break;
      }
    }
  } finally {
    flushing = false;
  }
}

export function startAutoFlush(sendFn: (path: string, method: string, body?: unknown) => Promise<unknown>): () => void {
  const attempt = () => void flushQueue(sendFn);
  window.addEventListener("online", attempt);
  const interval = window.setInterval(attempt, 15000);
  attempt();
  return () => {
    window.removeEventListener("online", attempt);
    window.clearInterval(interval);
  };
}
```

- [ ] **Step 6: Run to verify pass**

```bash
cd client && npx vitest run src/retryQueue.test.ts
```

Expected: PASS (4 tests).

- [ ] **Step 7: Rewrite `client/src/api.ts`**

```ts
import { supabase } from "./supabaseClient";
import { queueForRetry } from "./retryQueue";

async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function rawRequest<T>(path: string, method: string, body?: unknown): Promise<T> {
  const response = await fetch(path, {
    method,
    headers: { "Content-Type": "application/json", ...(await authHeaders()) },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error((payload && payload.message) || "Onbekende fout.");
  }
  return payload as T;
}

export async function apiGet<T>(path: string): Promise<T> {
  return rawRequest<T>(path, "GET");
}

export async function apiSend<T>(path: string, method: string, body?: unknown): Promise<T> {
  try {
    return await rawRequest<T>(path, method, body);
  } catch (error) {
    if (error instanceof TypeError) {
      queueForRetry({ path, method, body });
    }
    throw error;
  }
}
```

- [ ] **Step 8: Create `client/src/usePendingSyncCount.ts`**

```ts
import { useEffect, useState } from "react";
import { getQueueLength, onQueueChange } from "./retryQueue";

export function usePendingSyncCount(): number {
  const [count, setCount] = useState(getQueueLength());
  useEffect(() => onQueueChange(setCount), []);
  return count;
}
```

- [ ] **Step 9: Modify `client/src/App.tsx`** to auto-flush and show a pending-sync indicator

Add imports:

```tsx
import { useEffect } from "react";
import { Chip } from "@mui/material";
import { rawRequest } from "./api";
import { startAutoFlush } from "./retryQueue";
import { usePendingSyncCount } from "./usePendingSyncCount";
```

Add these two hook calls at the top of `App()`, alongside the existing `useAuth()` call (before the `if (loading) return null;` early return, so hook order stays stable):

```tsx
  const pendingCount = usePendingSyncCount();

  useEffect(() => startAutoFlush(rawRequest), []);
```

Inside the `Drawer`, below the "Uitloggen" button added in Task 12, add:

```tsx
          {pendingCount > 0 && (
            <Chip
              size="small"
              color="warning"
              sx={{ mt: 1 }}
              label={`${pendingCount} wijziging${pendingCount === 1 ? "" : "en"} wacht${pendingCount === 1 ? "" : "en"} op synchronisatie`}
            />
          )}
```

- [ ] **Step 10: Manually verify**

```bash
netlify dev
```

Log in, create a player while online (succeeds immediately). Then, in browser DevTools, set network throttling to "Offline", try creating another player — it should fail visibly but not crash, and once you flip back online within ~15s the pending indicator (if it appeared) should clear as the queued write flushes.

- [ ] **Step 11: Commit**

```bash
git add client/package.json client/package-lock.json client/vitest.config.ts client/src/api.ts \
  client/src/retryQueue.ts client/src/retryQueue.test.ts client/src/usePendingSyncCount.ts client/src/App.tsx
git commit -m "Swap client API layer to real fetch with a retry queue and pending-sync indicator"
```

---

### Task 14: Client — adapt Databeheer page to the new API

**Files:**
- Modify: `client/src/pages/DataPage.tsx`

**Interfaces:**
- Consumes: `apiGet`, `apiSend` (Task 13), and the `/api/data/export|import|wipe|backup-now` endpoints (Task 11).

**Note:** the previous client-side "automatische back-ups" (periodic browser download) feature is removed here — it was a workaround for the lack of server-side backups, which are now handled automatically (daily + post-lock, Task 11) plus an on-demand "Download back-up nu" button. Export, bulk import, and wipe-all are kept exactly as they behave today, per your instruction, just backed by the new API.

- [ ] **Step 1: Rewrite `client/src/pages/DataPage.tsx`**

```tsx
import { useRef, useState } from "react";
import { Alert, Box, Button, Card, CardContent, Divider, Stack, TextField, Typography } from "@mui/material";
import { apiGet, apiSend } from "../api";

function downloadFile(contents: string, filename: string, type: string) {
  const blob = new Blob([contents], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function buildExportFilename() {
  const now = new Date();
  const stamp = [now.getFullYear(), String(now.getMonth() + 1).padStart(2, "0"), String(now.getDate()).padStart(2, "0")].join("-");
  return `kaartbuddy-backup-${stamp}.json`;
}

export function DataPage() {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [playerImportText, setPlayerImportText] = useState("");

  const handleExport = async () => {
    try {
      const payload = await apiGet<unknown>("/api/data/export");
      downloadFile(JSON.stringify(payload, null, 2), buildExportFilename(), "application/json");
      setSuccess("Back-up opgeslagen.");
      setError(null);
    } catch {
      setError("Exporteren mislukt.");
      setSuccess(null);
    }
  };

  const handleImport = async (file: File) => {
    try {
      const parsed = JSON.parse(await file.text());
      await apiSend("/api/data/import", "POST", parsed);
      setSuccess("Back-up geïmporteerd.");
      setError(null);
    } catch {
      setError("Importeren mislukt. Controleer het bestand.");
      setSuccess(null);
    }
  };

  const handleReset = async () => {
    const confirmed = window.confirm("Weet je zeker dat je alle data wilt wissen? Dit kan niet ongedaan worden gemaakt.");
    if (!confirmed) return;
    try {
      await apiSend("/api/data/wipe", "POST");
      setSuccess("Alle data is gewist.");
      setError(null);
    } catch {
      setError("Wissen mislukt.");
      setSuccess(null);
    }
  };

  const handleBackupNow = async () => {
    try {
      await apiSend("/api/data/backup-now", "POST");
      setSuccess("Back-up gemaakt en opgeslagen in GitHub.");
      setError(null);
    } catch {
      setError("Back-up maken mislukt.");
      setSuccess(null);
    }
  };

  const handleImportPlayers = async () => {
    const lines = playerImportText.split(/\r?\n/).map((line) => line.trim()).filter((line) => line.length > 0);
    if (lines.length === 0) {
      setError("Plak minimaal één spelersnaam.");
      setSuccess(null);
      return;
    }
    const normalized = new Set<string>();
    const uniqueNames: string[] = [];
    lines.forEach((name) => {
      const key = name.toLowerCase();
      if (!normalized.has(key)) {
        normalized.add(key);
        uniqueNames.push(name);
      }
    });

    let added = 0;
    for (const name of uniqueNames) {
      try {
        await apiSend("/api/players", "POST", { name });
        added += 1;
      } catch {
        // naam bestaat al of ongeldig; overslaan
      }
    }

    if (added === 0) {
      setError("Geen nieuwe spelers toegevoegd.");
      setSuccess(null);
      return;
    }
    setSuccess(`${added} spelers toegevoegd.`);
    setError(null);
    setPlayerImportText("");
  };

  return (
    <Stack spacing={3}>
      <Box>
        <Typography variant="h4" sx={{ fontWeight: 700, mb: 1 }}>
          Databeheer
        </Typography>
        <Typography variant="body1">Maak een back-up, importeer data of wis de opgeslagen data.</Typography>
        <Typography variant="body2" color="text.secondary">
          Importeren vervangt de huidige data.
        </Typography>
      </Box>

      {error && <Alert severity="error">{error}</Alert>}
      {success && <Alert severity="success">{success}</Alert>}

      <Card>
        <CardContent>
          <Stack spacing={2} direction={{ xs: "column", md: "row" }}>
            <Button variant="contained" onClick={handleExport}>
              Exporteer back-up
            </Button>
            <Button variant="outlined" onClick={() => inputRef.current?.click()}>
              Importeer back-up
            </Button>
            <Button variant="outlined" color="error" onClick={handleReset}>
              Wis alle data
            </Button>
            <Button variant="outlined" onClick={handleBackupNow}>
              Download back-up nu
            </Button>
          </Stack>
          <input
            ref={inputRef}
            type="file"
            accept="application/json"
            style={{ display: "none" }}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void handleImport(file);
              if (inputRef.current) inputRef.current.value = "";
            }}
          />
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Stack spacing={2}>
            <Typography variant="h6">Spelers importeren</Typography>
            <Typography variant="body2" color="text.secondary">
              Plak spelersnamen, één naam per regel.
            </Typography>
            <TextField
              multiline
              minRows={6}
              placeholder={"Jan Jansen\nPiet de Vries\n..."}
              value={playerImportText}
              onChange={(event) => setPlayerImportText(event.target.value)}
              fullWidth
            />
            <Divider />
            <Button variant="contained" onClick={handleImportPlayers}>
              Importeer spelers
            </Button>
          </Stack>
        </CardContent>
      </Card>
    </Stack>
  );
}
```

- [ ] **Step 2: Run the build to verify it typechecks**

```bash
cd client && npm run build
```

Expected: PASS — no TypeScript errors.

- [ ] **Step 3: Manually verify**

```bash
netlify dev
```

Log in, go to "Databeheer", click "Exporteer back-up" (downloads a JSON file with empty arrays if no data yet), add a couple of players and a season elsewhere in the app, export again (confirm they appear), then click "Download back-up nu" and confirm a new commit lands in the `backups` branch of the GitHub repo.

- [ ] **Step 4: Commit**

```bash
git add client/src/pages/DataPage.tsx
git commit -m "Adapt Databeheer page to the new Supabase-backed API"
```

---

### Task 15: Cleanup — remove dead code

**Files:**
- Delete: `server/`
- Delete: `db/data.json`
- Delete: `db/init.sql/`
- Delete: `client/src/localApi.ts`
- Delete: `client/src/localStore.ts`
- Modify: `README.md`
- Modify: `docs/specs.md` (add a pointer note; business rules stay unchanged)

**Interfaces:** none — this task only removes code no longer referenced anywhere (`client/src/api.ts` no longer imports `localApi`, per Task 13).

- [ ] **Step 1: Confirm nothing still references the files being deleted**

```bash
grep -rn "localApi\|localStore" client/src --include="*.ts" --include="*.tsx"
```

Expected: no matches (Task 13 already removed the only import).

- [ ] **Step 2: Delete the dead code**

```bash
git rm -r server/ db/data.json db/init.sql/
git rm client/src/localApi.ts client/src/localStore.ts
```

- [ ] **Step 3: Update `README.md`**

Replace its contents with:

```markdown
# KaartBuddy

Score- en rangschikkingsapp voor wekelijkse kaartavonden (Nederlandse UI), draaiend op Netlify (frontend + Functions) met Supabase (Postgres + Auth) als backend.

## Lokale ontwikkeling

Vereisten: Node.js, de Supabase CLI, en de Netlify CLI.

1) Start Supabase lokaal:

```bash
supabase start
```

2) Zet de omgevingsvariabelen klaar in `netlify/.env` en `client/.env` (zie `docs/superpowers/specs/2026-07-02-cloud-backend-migration-design.md` §1 voor welke variabelen nodig zijn).

3) Start de volledige stack (frontend + Functions) in één keer:

```bash
netlify dev
```

De app draait op `http://localhost:8888`.

## Testen

```bash
cd netlify && npm test
cd client && npm test
```

## Back-ups en herstel

Zie `docs/RESTORE_RUNBOOK.md`.

## Specificaties

Lees `docs/specs.md` voor alle bedrijfsregels, data model en acceptatietests.
```

- [ ] **Step 4: Add a pointer note to `docs/specs.md`**

At the very top of `docs/specs.md`, above the `# Codex spec: ...` heading, add:

```markdown
> **Note (2026-07):** §8's "browser storage" data model describes the original offline implementation. The app now persists to Supabase Postgres — see `docs/superpowers/specs/2026-07-02-cloud-backend-migration-design.md` for the current storage architecture. All business rules below are unchanged and remain authoritative.

```

- [ ] **Step 5: Verify the client and functions still build**

```bash
cd client && npx tsc -b --noEmit
cd ../netlify && npx tsc --noEmit
```

Expected: no errors in either.

- [ ] **Step 6: Commit**

```bash
git add README.md docs/specs.md
git commit -m "Remove dead offline server/localStorage code, update README for the new stack"
```

---

### Task 16: Rollout

**Files:** none (deployment/verification checklist).

**Interfaces:** none.

- [ ] **Step 1: Deploy the preview site**

```bash
netlify deploy --build
```

Set the same environment variables from Task 1, Step 6 (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `GITHUB_TOKEN`, `GITHUB_REPO`, `GITHUB_BACKUP_BRANCH`) in the Netlify site's dashboard under Site settings → Environment variables, and `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` as build-time variables.

- [ ] **Step 2: Full manual walkthrough on the preview URL**

Log in, create a season, create an event, add participants, enter scores across all three rounds, confirm rankings/winners compute correctly, lock the event, confirm editing is blocked, check the season ranking view, and exercise Databeheer (export/import/wipe/backup-now).

- [ ] **Step 3: Verify the daily scheduled backup fires**

In the Netlify dashboard, manually trigger the `backup-scheduled` function once (Functions tab → invoke), then confirm a new file appears under `backups/` on the `backups` branch in GitHub.

- [ ] **Step 4: Confirm the lock-triggered backup fires**

Lock another test event and confirm a second backup commit appears within a few seconds.

- [ ] **Step 5: Re-run the restore dry run against the real (non-scratch) Supabase project's data**

Follow `docs/RESTORE_RUNBOOK.md` once more, this time restoring a snapshot back into the same staging project, to confirm the full loop works against real accumulated data, not just the empty scratch project from Task 11.

- [ ] **Step 6: Cut over**

In the Netlify dashboard, change the site's production deploy branch from `cloud-modernization` to `main`. Merge `cloud-modernization` into `main` (following your normal PR process). Point any bookmarks/shortcuts at the new Netlify URL.

This is a clean replacement, not a parallel run: there is no historical data to migrate (design §2) and no user-facing transition period. Once cutover completes, the new stack is the only version in use — no offline fallback is kept on standby.
