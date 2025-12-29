# Codex spec: offline scoring & ranking app for weekly card nights (Dutch UI)

## 1) Goal
Build a **single-user**, **offline-first**, locally running web application that supports weekly card game evenings by managing participants, entering round scores, calculating rankings, determining prize winners, and producing end-of-season rankings.

Hard requirements:
- Runs locally on a **MacBook** in a browser.
- Works **fully offline** (no internet needed at runtime; no CDN usage).
- Persists data in local **browser storage**.
- UI built with **Material UI (MUI)**.
- **All UI text is Dutch** (labels, buttons, dialogs, validation messages).
- Reliability and trust are critical: calculations must be correct, deterministic, and validated server-side.

---

## 2) Definitions
- **Season (Seizoen):** collection of multiple events (10–30 typical), stored historically.
- **Event (Kaartavond):** one card night within a season; contains up to 60 participants; consists of 3 rounds.
- **Round (Ronde):** scoring phase 1..3; scores are entered manually.
- **Finished event:** an event with status `LOCKED`.
- **Finished season:** a season where **all non-archived events are LOCKED**. Only then can season ranking be calculated.

---

## 3) Scope

### In scope
- Players: create, search, archive (no delete).
- Seasons: create, list, archive (no delete).
- Events: create per season, add participants (max 60), enter scores for 3 rounds, compute rankings, lock when complete, archive (no delete).
- Winners: prize ranks **1**, **18**, **25** for an event’s final ranking.
- Season ranking: only available when all events in that season are finished.

### Out of scope
- Multi-user, login/roles.
- Online sync or cloud.
- Automatic score import.
- Complex scoring beyond per-round points and totals.

---

## 4) Business rules

### 4.1 Participants
- Max **60** participants per event (hard limit).
- A player cannot be added twice to the same event.
- Player names are **unique** across the entire system.

### 4.2 Scores and unknown values
- Round scores are **positive integers only** (`>= 0` allowed if desired, but no negatives).
- **Empty round score = unknown** (stored as `NULL`), not 0.
- The UI must distinguish unknown from 0 (unknown displayed as blank).

### 4.3 Totals
For each participant:
- If any of the three round scores is unknown (`NULL`), `totalPoints` is **unknown** (display blank).
- Otherwise: `totalPoints = pointsR1 + pointsR2 + pointsR3`.

### 4.4 Rankings (no ties allowed)
Ranking is computed on **cumulative points** through that round:

- Round 1 cumulative: `c1 = pointsR1`
- Round 2 cumulative: `c2 = pointsR1 + pointsR2`
- Round 3 cumulative: `c3 = pointsR1 + pointsR2 + pointsR3` (= total)

Rank calculation rules:
- Sort descending by the relevant cumulative score.
- A rank is shown only if the required scores for that round are all known:
  - `rankR1` requires `pointsR1` not null
  - `rankR2` requires `pointsR1` and `pointsR2` not null
  - `rankR3` requires all three not null
- **No ties are allowed** in any computed ranking:
  - If equal cumulative scores occur for a ranking that should be shown, this is a validation error.
  - The admin is responsible for adjusting input to avoid ties.
  - The tool must **detect ties** and block locking if ties exist.

### 4.5 Winners (event prizes)
After the event is complete (final ranking = round 3):
- Prize winners are players in ranking positions **1**, **18**, and **25**.
- If the event has fewer than 18 or 25 participants, only award ranks that exist.
- Winners must be clearly highlighted in the UI (badge + “Prijswinnaar”).

### 4.6 Event lifecycle: OPEN → LOCKED
Events have statuses:
- `OPEN`: editable (participants and scores).
- `LOCKED`: finished, read-only.

Locking rules:
- Only an `OPEN` event can be locked.
- Lock is blocked unless all conditions pass:
  1. Participant count is between **1 and 60**.
  2. Every participant has known scores for rounds 1–3 (no NULLs).
  3. No ties exist in the final totals (round 3 cumulative).
  4. (Recommended) Also validate no ties in round 1 and round 2 cumulatives.
- When locked:
  - Event becomes read-only.
  - Store `lockedAt` timestamp.
  - (Recommended) write an audit log entry.

### 4.7 Archive policy (no deletes)
Nothing is deleted, only archived.

- Players:
  - Archiving a player hides them from default selection lists.
  - Archived players should not be addable to new events (recommended).
  - Historical events and rankings still show archived players.

- Events:
  - Archiving an event hides it from default lists but keeps history.
  - Archived events are excluded from “season finished” checks and season ranking calculations by default.

- Seasons:
  - Archiving a season hides it from default lists but keeps history.

---

## 5) Season ranking rules

### 5.1 Availability
A season ranking can be calculated/displayed **only when the season is finished**:
- A season is finished when **all non-archived events in the season are LOCKED**.

If the season is not finished:
- The ranking table must not be shown.
- Show a Dutch message:
  - “Het klassement is pas beschikbaar wanneer alle kaartavonden van dit seizoen zijn vergrendeld.”
- Optionally list which events are still open.

### 5.2 Calculation
When the season is finished:
- For each player, compute:
  - `seasonTotal = sum(eventTotalPoints)` across all **non-archived, LOCKED** events in the season where the player participated.
  - `appearances = count(events included in the sum)`.
- Sort descending by `seasonTotal`.
- Detect ties and show a warning if they occur (ties should not happen per admin rule, but detect anyway).

---

## 6) Functional requirements

### 6.1 Player management
- Create player (unique name required).
- List and search players.
- Archive/unarchive player.
- Validation messages in Dutch.

### 6.2 Season management
- Create season (name required).
- List seasons.
- Archive/unarchive season.

### 6.3 Event management
- Create event:
  - must be associated with exactly one season.
  - date required.
- List events (filter by season; hide archived by default).
- Event detail:
  - manage participants (add existing or create new inline).
  - enter scores for rounds 1–3.
  - view computed ranks and totals.
  - highlight prize winners.
  - lock event (with validations).
  - archive event.

---

## 7) UI requirements (Dutch UI)

### Global
- Use Material UI components.
- No English text in UI (including errors and empty states).
- Provide clear states for:
  - unknown scores (blank input)
  - locked event (read-only banner)
  - validation errors (snackbar/dialog)

### Navigation
Menu items (Dutch):
- “Seizoenen”
- “Kaartavonden”
- “Spelers”
- “Klassement”

### Event detail screen (core UI)
Use a tabular layout (MUI DataGrid or MUI Table) with these columns:

1. **Speler**
2. **Punten ronde 1**
3. **Rang na ronde 1**
4. **Punten ronde 2**
5. **Rang na ronde 2**
6. **Punten ronde 3**
7. **Rang na ronde 3**
8. **Totaal punten**

Behavior:
- Points columns editable if event is OPEN.
- Rank and total columns read-only.
- Recalculate ranks/totals immediately after edits.
- Buttons (Dutch):
  - “Deelnemer toevoegen”
  - “Kaartavond vergrendelen”
  - “Archiveren”
- Winners:
  - show section “Prijswinnaars” listing ranks 1, 18, 25 with names.

### Suggested Dutch validation messages (examples)
- “Maximaal 60 deelnemers toegestaan.”
- “Punten moeten een positief geheel getal zijn.”
- “Deze ronde is nog niet ingevuld.”
- “Gelijke scores zijn niet toegestaan. Pas de punten aan.”
- “Je kan niet vergrendelen zolang er rondescores ontbreken.”
- “Deze kaartavond is vergrendeld en kan niet meer worden aangepast.”

---

## 8) Data model (browser storage) and constraints

### Storage layout

**localStorage**
- `filip-card-data` stores a JSON object with `meta.lastIds`.
- `players`, `seasons`, `events`, `eventParticipants`, `auditLog` are stored as arrays.

### Collections

**players**
- `id` number
- `name` string (unique)
- `isArchived` boolean
- `createdAt`, `updatedAt` (ISO strings)

**seasons**
- `id` number
- `name` string
- `startDate` string | null (YYYY-MM-DD)
- `endDate` string | null (YYYY-MM-DD)
- `isArchived` boolean
- `createdAt`, `updatedAt` (ISO strings)

**events**
- `id` number
- `seasonId` number (references seasons)
- `eventDate` string (YYYY-MM-DD)
- `title` string | null
- `notes` string | null
- `prizeRank1`, `prizeRank2`, `prizeRank3` number
- `status` "OPEN" | "LOCKED"
- `lockedAt` string | null (ISO)
- `isArchived` boolean
- `createdAt`, `updatedAt` (ISO strings)

**eventParticipants**
- `id` number
- `eventId` number (references events)
- `playerId` number (references players)
- `pointsR1`, `pointsR2`, `pointsR3` number | null
- Unique `(eventId, playerId)`
- `createdAt`, `updatedAt` (ISO strings)

**auditLog (recommended)**
- `id` number
- `entityType` string | null
- `entityId` number | null
- `action` string | null
- `oldValueJson` JSON | null
- `newValueJson` JSON | null
- `createdAt` (ISO string)

### Validation to enforce server-side
- Unique `players.name`.
- Max 60 participants per event.
- No edits allowed when event is LOCKED.
- Score inputs: integer >= 0; allow NULL for unknown in OPEN events.
- Lock checks (completeness + no ties).

---

## 9) Backend API (suggested; implement locally)
Implement a local data layer in the client that reads/writes browser storage.

Suggested routes (example):
- Players:
  - `GET /api/players?query=...&includeArchived=false`
  - `POST /api/players`
  - `PATCH /api/players/:id` (archive/unarchive, rename)
- Seasons:
  - `GET /api/seasons?includeArchived=false`
  - `POST /api/seasons`
  - `PATCH /api/seasons/:id` (archive/unarchive)
- Events:
  - `GET /api/events?seasonId=...&includeArchived=false`
  - `POST /api/events`
  - `GET /api/events/:id`
  - `PATCH /api/events/:id` (archive/unarchive)
  - `POST /api/events/:id/lock` (perform lock validations and lock)
- Participants & scores:
  - `POST /api/events/:id/participants` (add player)
  - `PATCH /api/events/:id/participants/:participantId` (update points)

Suggested server responses include computed fields:
- For event detail: computed ranks per round, totals, tie warnings, winners list, and whether lock is allowed + reasons if not.

---

## 10) Calculation logic (must be deterministic)

### Ranking computation (per event)
For each round N:
1. Filter participants who have all required scores known for round N.
2. Compute cumulative value `cN`.
3. Detect ties: if any duplicate `cN` exists among included participants, mark as tie error.
4. Sort descending by `cN`.
5. Assign ranks starting at 1 in sorted order.
6. Participants missing required scores have blank rank.

### Winners computation (per event)
- Winners are taken from final ranking list (round 3 ranks).
- Return winners for ranks 1, 18, 25 if present.

### Season finished check
Season is finished if:
- All **non-archived** events in season are `LOCKED`
- (Optionally) require at least one non-archived event; decide and implement consistently.

### Season ranking computation
Only if season is finished:
- Aggregate event totals per player across included events.
- Sort descending.

---

## 11) Reliability & offline requirements
- No runtime external calls (no CDNs, no remote fonts).
- Local browser persistence verified across restarts.
- Locking logic must be enforced server-side (not only UI).
- (Recommended) audit logging of score edits and locking actions.
- (Recommended) export feature:
  - Event export CSV (participant, scores, totals, final rank)
  - Season ranking export CSV

---

## 12) Acceptance tests (must pass)

### Players
- Creating a player with an existing name is rejected with a Dutch error message.
- Archived players don’t appear in default “Deelnemer toevoegen” search.

### Events
- Cannot add more than 60 participants.
- Cannot add the same player twice to one event.
- Unknown scores remain blank and do not create ranks/totals for that round/total.
- No negative score can be saved.

### Rankings and ties
- Rankings update immediately and match descending cumulative totals.
- If a tie is entered, UI shows Dutch error and event cannot be locked.

### Locking
- Locking fails if any score is unknown.
- Locking fails if any ties exist in final totals.
- Locked events cannot be edited.

### Season ranking
- If any non-archived event in the season is not locked, ranking is not shown and Dutch message is shown.
- When all non-archived events are locked, season ranking shows correct sums and ordering.

### Offline
- App works with no internet connection.
- Data persists after restart.
