# KaartBuddy UI Redesign: MUI → shadcn/ui — Design

**Status:** Approved by user 2026-09-05, ready for implementation planning.

## 1) Goal

Replace the client's entire UI component layer (currently MUI 5) with shadcn/ui (Tailwind CSS +
Radix UI primitives), producing a cleaner, more modern, warm/playful look — without changing any
business rule, API contract, or data-layer behavior. This is a **visual/component-layer redesign
only**: `docs/specs.md`'s business rules, the Netlify Functions API, and the client's data/logic
modules (`api.ts`, `retryQueue.ts`, `keyedDebouncer.ts`, `types.ts`, `utils/*.ts`,
`auth/AuthContext.tsx`, `supabaseClient.ts`) are unchanged. Only what renders the UI changes.

## 2) Scope decisions (from brainstorming)

- **Full replace, all at once** — MUI is removed entirely; shadcn is not introduced alongside it.
  Nothing ships mid-migration with both design systems visible.
- **Desktop-first, responsive** — the app is used live at the card table, often on phone/tablet,
  but the redesign optimizes for desktop (sidebar nav, dense tables) and stays merely usable on
  mobile, matching how the app is used today. Not a mobile-first rebuild.
- **Warm/playful visual direction**, fresh color palette (not tied to the current navy/bronze
  identity).
- **Light mode only** — no dark mode toggle.
- **All UI text stays Dutch** (`docs/specs.md` §1, unchanged constraint) — every relabeled
  button, toast message, and dialog in the new UI must be Dutch, exactly like the app today.
- **Approach: foundation + deliberate reskin** (not a bare 1:1 component swap, not a full
  from-scratch UX rethink of every page). Build the shadcn foundation and a reusable primitive
  set first, then rebuild every page against it — improving obvious rough edges (spacing, visual
  hierarchy, action clarity) as we go, without reinventing each page's core interaction pattern.
  The Kaartavonden detail (score-entry) page gets deliberate extra attention as the app's most
  complex, most-used screen.

## 3) Foundation

**Stack:** Tailwind CSS v4 (CSS-first config — no `tailwind.config.js`, current shadcn default)
+ shadcn's "default" style (more rounded corners than "New York" — fits warm/playful). Path
aliases (`@/components`, `@/lib/utils`, `@/pages`, etc.) configured in `vite.config.ts` (via
`vite-tsconfig-paths` or a manual `resolve.alias` block) and `tsconfig.json`, matching shadcn's
standard Vite setup guide.

shadcn is **not an npm dependency** in the usual sense — its CLI (`npx shadcn@latest add <component>`)
copies each component's source directly into `client/src/components/ui/`, which the project then
owns and can edit freely. Only shadcn's underlying pieces (Radix primitives, `class-variance-authority`,
`clsx`, `tailwind-merge`) are real npm dependencies.

**Icons:** `lucide-react` replaces `@mui/icons-material` (covers every icon currently in use:
trophy, lock/unlock, archive, edit, etc.).

**Color palette** (fresh, warm/playful, defined as CSS variables per shadcn's token convention in
the global stylesheet):
- Primary: warm terracotta/coral (e.g. `#D9724C` — tune during implementation for contrast/a11y)
- Background: warm off-white/cream, not stark white
- Accent: a muted gold, used sparingly (winners, prizes, rank highlights — thematic fit for a
  card-game app)
- Larger border radius app-wide (cards, buttons, inputs) for the friendly feel

**Typography:** Replace `'Trebuchet MS', 'Segoe UI', sans-serif` with a warm, rounded, modern
Google-Fonts sans-serif — **Nunito** or **Figtree** (both free, both have solid Dutch diacritic
support). Pick one during implementation based on how it actually renders in the dense score
table; either satisfies this design.

**Feedback pattern:** Replace the current inline MUI `Alert` success/error banners (pushed above
page content) with **toast notifications** via `sonner` (shadcn's standard toast pairing). Every
page's success/error message (e.g. "Speler toegevoegd.", "Toevoegen mislukt. Controleer of de
naam uniek is.") becomes a toast instead of a banner. Toast text stays exactly what the banner
text was today — Dutch, same wording — this is a presentation change, not a copy change.

## 4) Component architecture

- **Navigation shell:** keep the sidebar pattern (fits desktop-first; shadcn's `Sidebar` block is
  a first-class, well-documented pattern) rebuilt with shadcn primitives instead of MUI `Drawer`.
  Same grouping as today: Hoofd → Kaartavonden/Klassement; Instellingen → Seizoenen/Spelers/
  Databeheer. User email + logout at the top. The pending-sync indicator (from the client retry
  queue) becomes a small `Badge` instead of an MUI `Chip` — same text, same trigger condition
  (`usePendingSyncCount() > 0`), no logic change.
- **Data tables:** shadcn's `Table` primitive for every list/table (players, seasons, events,
  ranking, score-entry). **Do not** introduce a table library (e.g. TanStack Table) — the existing
  sort/filter state logic in `EventDetailPage.tsx` and elsewhere already works and isn't part of
  this redesign's scope; only the rendering changes.
- **Forms & inputs:** `Input`, `Label`, `Select`, `Checkbox`, `Button` (variants: default/outline/
  destructive map from today's `variant="contained"/"outlined"` + `color="error"` usage).
- **Cards:** shadcn `Card` replaces MUI `Card`/`CardContent` for grouped sections.
- **Confirmations:** Databeheer's "wipe all data" action upgrades from a native `window.confirm()`
  to shadcn's `AlertDialog` — the only destructive-action confirmation in the app. Locking an
  event stays a direct button (reversible via unlock, no confirmation needed, matches today).
- **Feedback:** `sonner` toasts everywhere (see Section 3), replacing every inline `Alert` banner.

## 5) Page-by-page treatment

Straightforward reskin (same layout/information, new primitives, no structural change):
- **Login:** centered `Card` + `Input`/`Button`.
- **Seasons, Players, Events:** existing list + create-form pattern, restyled.
- **Klassement (season ranking):** same table; ranks 1-3 get a small medal-colored `Badge`
  (gold/silver/bronze) instead of a plain number.
- **Databeheer:** same actions, restyled buttons, wipe-all confirmation upgraded to `AlertDialog`.

**Kaartavonden detail (score entry) — deliberate attention:**
- The score table keeps its current shape (participants × R1/R2/R3/total) — a table remains the
  right pattern for this data on desktop — but per-round rank highlighting changes from arbitrary
  colored cell backgrounds to a clear gold/silver/bronze-tinted background for ranks 1-3
  specifically (everything else neutral), so "who's winning" reads at a glance.
- Prijswinnaars / Kaartavondresultaten / Vergrendelen stay a 3-card row (current layout works),
  restyled with `Card` + `lucide-react` icons (trophy for event winner, medals for round
  winners).
- The optimistic-update + debounced-save interaction (built in the prior latency-fix session:
  `client/src/utils/keyedDebouncer.ts`, `EventDetailPage.tsx`'s `updateScore`/`saveScore`/
  `loadEvent` merge logic) is **unchanged** — this redesign touches only the visual container
  those functions render into, never their logic.
- Lock/unlock: stays a direct button, no `AlertDialog`.

## 6) Out of scope

- Any change to `docs/specs.md`'s business rules (max 60 participants, unique names,
  `topScoresCount >= 1`, NULL = unknown score, lock semantics, top-X season ranking).
- Any change to the Netlify Functions API (`netlify/lib/`, `netlify/functions/`) or Supabase
  schema.
- Any change to `client/src/api.ts`, `retryQueue.ts`, `keyedDebouncer.ts`, `auth/AuthContext.tsx`,
  `supabaseClient.ts`, or `types.ts` — the data/auth/sync layer is untouched.
- Mobile-first optimization (desktop-first, responsive only, per Section 2).
- Dark mode.
- Task 11b (Cloudflare R2 backups) — still postponed, unrelated to this work.

## 7) Verification approach

This codebase has no React component-testing infrastructure (no React Testing Library, no
`*.test.tsx` files anywhere) — every prior page-level UI change in this project (Tasks 12-16, the
latency fix) was verified via manual/Playwright browser testing against a local Supabase
instance, not component unit tests. This redesign follows the same convention: each page is
verified in a real browser after its reskin (screenshot + interaction check), not via new test
infrastructure invented for this one effort. Existing non-UI tests (`client/src/retryQueue.test.ts`,
`client/src/utils/keyedDebouncer.test.ts`, everything under `netlify/`) must continue passing
unchanged — this redesign shouldn't touch any file they cover.

## 8) Migration mechanics (high-level, detailed in the implementation plan)

- Add: `tailwindcss`, `@tailwindcss/vite`, shadcn's underlying deps (`class-variance-authority`,
  `clsx`, `tailwind-merge`, Radix packages as pulled in per-component), `lucide-react`, `sonner`.
- Remove: `@mui/material`, `@mui/icons-material`, `@emotion/react`, `@emotion/styled`.
- Delete: `client/src/theme.ts` (MUI theme) — replaced by Tailwind CSS variables in the global
  stylesheet.
- New: `client/components.json` (shadcn config), `client/src/lib/utils.ts` (the `cn()` helper),
  `client/src/components/ui/*` (shadcn component sources, added incrementally via
  `npx shadcn@latest add <name>` as each page needs them).
