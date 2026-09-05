# KaartBuddy UI Redesign: MUI → shadcn/ui Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the KaartBuddy client's entire UI component layer (MUI 5) with shadcn/ui
(Tailwind CSS v4 + Radix UI primitives), producing a cleaner, warmer, more modern look — with
zero change to business rules, the API, or the client's data/auth/sync logic.

**Architecture:** Full replace, all at once (no MUI/shadcn coexistence in any shipped state).
Foundation first (Tailwind v4 + shadcn config + primitives), then the nav shell, then each page
in isolation (preserving every existing handler/state/memo byte-for-byte, changing only the
rendered JSX and how errors/success messages are reported), then MUI removal and a final
full-app verification pass.

**Tech Stack:** Tailwind CSS v4, shadcn/ui (Radix UI primitives, copied into the repo, not an
npm package), `lucide-react` (icons), `sonner` (toasts) — added to the existing React 18 +
Vite + TypeScript + react-router-dom client. No backend/API changes.

**Spec:** `docs/superpowers/specs/2026-09-05-shadcn-ui-redesign-design.md`

## Global Constraints

- All UI text stays Dutch — every button label, toast message, dialog string, and placeholder
  must match the current Dutch copy exactly unless the design spec explicitly changes it (it
  doesn't; this is a visual redesign, not a copy change).
- Zero changes to `docs/specs.md`'s business rules, the Netlify Functions API
  (`netlify/lib/`, `netlify/functions/`), or the client's data/auth/sync layer: `client/src/api.ts`,
  `retryQueue.ts`, `keyedDebouncer.ts`, `auth/AuthContext.tsx`, `supabaseClient.ts`, `types.ts`.
  Every page task's existing state/handler/memo logic must be preserved unchanged — only the
  rendered JSX and the error/success reporting mechanism (inline MUI `Alert` → `sonner` toast)
  change.
- Full replace, all at once — no task should leave a page half-MUI/half-shadcn in a state meant
  to be shipped. Interim tasks (foundation, primitives) may leave other pages still on MUI
  since nothing ships mid-plan.
- Desktop-first, responsive (not mobile-first). Light mode only, no dark mode toggle.
- No React component-testing infrastructure exists in this codebase (no React Testing Library,
  no `*.test.tsx` anywhere) — every page task is verified via manual/Playwright browser check
  against a running `netlify dev` + local Supabase, matching this project's established
  convention. Do not introduce new test infrastructure as part of this plan.
- Existing non-UI tests must keep passing unchanged throughout: `client/src/retryQueue.test.ts`,
  `client/src/utils/keyedDebouncer.test.ts`, everything under `netlify/`.

---

### Task 1: Tailwind v4 + shadcn foundation

**Files:**
- Modify: `client/package.json` (add dependencies)
- Modify: `client/vite.config.ts`
- Modify: `client/tsconfig.json`
- Create: `client/components.json`
- Create: `client/src/lib/utils.ts`
- Create: `client/src/index.css`
- Modify: `client/src/main.tsx` (import the new stylesheet only — nav/theme rebuild is Task 4)

**Interfaces:**
- Produces: the `cn()` helper (`client/src/lib/utils.ts`), the `@/*` path alias (resolving to
  `client/src/*`), Tailwind utility classes and the CSS variable palette (`--background`,
  `--foreground`, `--primary`, `--primary-foreground`, `--secondary`, `--secondary-foreground`,
  `--muted`, `--muted-foreground`, `--accent`, `--accent-foreground`, `--destructive`,
  `--destructive-foreground`, `--border`, `--input`, `--ring`, `--radius`) — every later task
  depends on these being in place.

- [ ] **Step 1: Install dependencies**

```bash
cd client
npm install tailwindcss @tailwindcss/vite tw-animate-css clsx tailwind-merge class-variance-authority lucide-react sonner
npm install -D @types/node
```

- [ ] **Step 2: Rewrite `client/vite.config.ts`**

```ts
import path from "path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src")
    }
  },
  server: {
    port: 5173
  }
});
```

- [ ] **Step 3: Add the path alias to `client/tsconfig.json`**

Add `"baseUrl": "."` and `"paths": { "@/*": ["./src/*"] }` inside `compilerOptions`, keeping
every existing option:

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "Bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["src"]
}
```

- [ ] **Step 4: Create `client/components.json`**

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "new-york",
  "rsc": false,
  "tsx": true,
  "tailwind": {
    "config": "",
    "css": "src/index.css",
    "baseColor": "neutral",
    "cssVariables": true,
    "prefix": ""
  },
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils",
    "ui": "@/components/ui",
    "lib": "@/lib",
    "hooks": "@/hooks"
  },
  "iconLibrary": "lucide"
}
```

- [ ] **Step 5: Create `client/src/lib/utils.ts`**

```ts
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

- [ ] **Step 6: Create `client/src/index.css`**

This defines the warm/playful palette from the design spec (Section 3) as CSS variables, plus
Tailwind's base layer. Colors are plain hex (not `oklch()`) so every value is exactly what's
written here — no color-space conversion to reason about.

```css
@import "tailwindcss";
@import "tw-animate-css";

@theme inline {
  --radius-sm: calc(var(--radius) - 4px);
  --radius-md: calc(var(--radius) - 2px);
  --radius-lg: var(--radius);
  --radius-xl: calc(var(--radius) + 4px);
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-card: var(--card);
  --color-card-foreground: var(--card-foreground);
  --color-popover: var(--popover);
  --color-popover-foreground: var(--popover-foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-secondary: var(--secondary);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-accent: var(--accent);
  --color-accent-foreground: var(--accent-foreground);
  --color-destructive: var(--destructive);
  --color-destructive-foreground: var(--destructive-foreground);
  --color-border: var(--border);
  --color-input: var(--input);
  --color-ring: var(--ring);
  --font-sans: "Figtree", ui-sans-serif, system-ui, sans-serif;
}

:root {
  --radius: 0.75rem;
  --background: #fdf8f3;
  --foreground: #3a2e22;
  --card: #ffffff;
  --card-foreground: #3a2e22;
  --popover: #ffffff;
  --popover-foreground: #3a2e22;
  --primary: #d9724c;
  --primary-foreground: #fffaf5;
  --secondary: #f3e4d7;
  --secondary-foreground: #4a3b2c;
  --muted: #f3ece3;
  --muted-foreground: #7a6a58;
  --accent: #d9a441;
  --accent-foreground: #3a2e22;
  --destructive: #c0432e;
  --destructive-foreground: #fffaf5;
  --border: #e7dccc;
  --input: #e7dccc;
  --ring: #d9724c;
}

body {
  @apply bg-background text-foreground;
  font-family: var(--font-sans);
}
```

- [ ] **Step 7: Add the Figtree font and import the stylesheet**

Add to `client/index.html`'s `<head>`, after the existing `<link rel="icon">` line:

```html
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Figtree:wght@400;500;600;700&display=swap" rel="stylesheet" />
```

In `client/src/main.tsx`, add `import "./index.css";` as the first import (before
`import React from "react";`). Do not change anything else in `main.tsx` yet — the
`ThemeProvider`/`CssBaseline` removal happens in Task 12 once every page no longer needs MUI.

- [ ] **Step 8: Verify**

```bash
cd client && npx tsc -b --noEmit && npm run build
```

Expected: both pass with no errors. The running app will look visually rough right now (Tailwind's
base reset applies on top of still-MUI-rendered pages) — that's expected and fine; nothing in
this plan ships until every page is migrated (Task 12).

- [ ] **Step 9: Commit**

```bash
git add client/package.json client/package-lock.json client/vite.config.ts client/tsconfig.json \
  client/components.json client/src/lib/utils.ts client/src/index.css client/src/main.tsx client/index.html
git commit -m "Add Tailwind v4 + shadcn/ui foundation"
```

---

### Task 2: Core shadcn primitives (forms, cards, tables, badges)

**Files:**
- Create: `client/src/components/ui/button.tsx`
- Create: `client/src/components/ui/input.tsx`
- Create: `client/src/components/ui/label.tsx`
- Create: `client/src/components/ui/card.tsx`
- Create: `client/src/components/ui/table.tsx`
- Create: `client/src/components/ui/badge.tsx`
- Create: `client/src/components/ui/checkbox.tsx`
- Create: `client/src/components/ui/select.tsx`
- Create: `client/src/components/ui/textarea.tsx`

**Interfaces:**
- Consumes: `client/components.json`, `client/src/lib/utils.ts` (Task 1).
- Produces: `Button`, `Input`, `Label`, `Card`/`CardHeader`/`CardTitle`/`CardContent`/`CardFooter`,
  `Table`/`TableHeader`/`TableBody`/`TableRow`/`TableHead`/`TableCell`, `Badge`, `Checkbox`,
  `Select`/`SelectTrigger`/`SelectValue`/`SelectContent`/`SelectItem`, `Textarea` — imported by
  every page task from here on via `@/components/ui/<name>`.

- [ ] **Step 1: Add the components via the shadcn CLI**

```bash
cd client
npx shadcn@latest add button input label card table badge checkbox select textarea --yes
```

- [ ] **Step 2: Verify each file was created**

```bash
ls src/components/ui/
```

Expected: `button.tsx`, `input.tsx`, `label.tsx`, `card.tsx`, `table.tsx`, `badge.tsx`,
`checkbox.tsx`, `select.tsx`, `textarea.tsx` all present (the CLI may also add a handful of
Radix packages to `package.json` automatically — that's expected).

- [ ] **Step 3: Verify the project still typechecks**

```bash
npx tsc -b --noEmit
```

Expected: no errors (these files aren't imported anywhere yet, but must be self-consistent).

- [ ] **Step 4: Commit**

```bash
git add client/package.json client/package-lock.json client/src/components/ui/
git commit -m "Add core shadcn/ui primitives: button, input, label, card, table, badge, checkbox, select, textarea"
```

---

### Task 3: Sidebar, alert-dialog, and toast primitives

**Files:**
- Create: `client/src/components/ui/sidebar.tsx` (plus its dependencies: `sheet.tsx`,
  `tooltip.tsx`, `skeleton.tsx`, `separator.tsx` — the CLI adds these automatically)
- Create: `client/src/components/ui/alert-dialog.tsx`
- Create: `client/src/components/ui/sonner.tsx`
- Create: `client/src/hooks/use-mobile.ts` (the sidebar's responsive-collapse hook, added
  automatically by the CLI alongside `sidebar.tsx`)
- Modify: `client/src/main.tsx` (mount the `Toaster`)

**Interfaces:**
- Consumes: Task 1's foundation.
- Produces: `Sidebar`/`SidebarProvider`/`SidebarHeader`/`SidebarContent`/`SidebarGroup`/
  `SidebarGroupLabel`/`SidebarGroupContent`/`SidebarMenu`/`SidebarMenuItem`/
  `SidebarMenuButton`/`SidebarInset`/`SidebarTrigger` (consumed by Task 4's `App.tsx`),
  `AlertDialog`/`AlertDialogTrigger`/`AlertDialogContent`/`AlertDialogHeader`/
  `AlertDialogTitle`/`AlertDialogDescription`/`AlertDialogFooter`/`AlertDialogCancel`/
  `AlertDialogAction` (consumed by Task 10's `DataPage.tsx`), the `Toaster` component from
  `@/components/ui/sonner` and the `toast` function from the `sonner` package directly
  (consumed by every page task from Task 5 onward).

- [ ] **Step 1: Add the components via the shadcn CLI**

```bash
cd client
npx shadcn@latest add sidebar alert-dialog sonner --yes
```

- [ ] **Step 2: Verify the files exist**

```bash
ls src/components/ui/sidebar.tsx src/components/ui/alert-dialog.tsx src/components/ui/sonner.tsx src/hooks/use-mobile.ts
```

Expected: all four paths exist.

- [ ] **Step 3: Mount the `Toaster` in `client/src/main.tsx`**

Add the import and render it as a sibling of `App`, inside `AuthProvider` (so it can eventually
show toasts triggered by anything in the tree — it doesn't itself need auth):

```tsx
import { Toaster } from "@/components/ui/sonner";
```

Change the render tree from:

```tsx
<AuthProvider>
  <App />
</AuthProvider>
```

to:

```tsx
<AuthProvider>
  <App />
  <Toaster richColors position="top-right" />
</AuthProvider>
```

- [ ] **Step 4: Verify**

```bash
npx tsc -b --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add client/package.json client/package-lock.json client/src/components/ui/sidebar.tsx \
  client/src/components/ui/alert-dialog.tsx client/src/components/ui/sonner.tsx \
  client/src/hooks/use-mobile.ts client/src/main.tsx
git commit -m "Add shadcn sidebar, alert-dialog, and sonner toast primitives"
```

---

### Task 4: Rebuild the navigation shell (`App.tsx`)

**Files:**
- Modify: `client/src/App.tsx` (full rewrite)

**Interfaces:**
- Consumes: `useAuth()` (unchanged, from `auth/AuthContext.tsx`), `usePendingSyncCount()`
  (unchanged), `rawRequest`/`startAutoFlush` (unchanged, from `api.ts`/`retryQueue.ts`),
  shadcn's `Sidebar*` family and `Badge` (Tasks 2-3).
- Produces: the app's route shell — every page task (5-11) renders inside this unchanged.

**Do not change:** the route list, the `mainNav`/`settingsNav` path structure, the
`loading`/`session` guard logic, or the `startAutoFlush(rawRequest)` effect — only the JSX
changes, from MUI `Drawer`/`Tabs` to shadcn's `Sidebar`.

- [ ] **Step 1: Replace `client/src/App.tsx` in full**

```tsx
import { useEffect } from "react";
import { Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { PlayersPage } from "./pages/PlayersPage";
import { SeasonsPage } from "./pages/SeasonsPage";
import { EventsPage } from "./pages/EventsPage";
import { EventDetailPage } from "./pages/EventDetailPage";
import { RankingPage } from "./pages/RankingPage";
import { DataPage } from "./pages/DataPage";
import { LoginPage } from "./pages/LoginPage";
import { useAuth } from "./auth/AuthContext";
import { rawRequest } from "./api";
import { startAutoFlush } from "./retryQueue";
import { usePendingSyncCount } from "./usePendingSyncCount";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger
} from "@/components/ui/sidebar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const mainNav = [
  { label: "Kaartavonden", path: "/events" },
  { label: "Klassement", path: "/ranking" }
];

const settingsNav = [
  { label: "Seizoenen", path: "/" },
  { label: "Spelers", path: "/players" },
  { label: "Databeheer", path: "/data" }
];

function isActivePath(pathname: string, path: string): boolean {
  return path === "/" ? pathname === "/" : pathname.startsWith(path);
}

export function App() {
  const { session, loading, signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const pendingCount = usePendingSyncCount();

  useEffect(() => startAutoFlush(rawRequest), []);

  if (loading) return null;
  if (!session) return <LoginPage />;

  return (
    <SidebarProvider>
      <Sidebar>
        <SidebarHeader className="gap-1 px-3 py-3">
          <span className="text-lg font-bold text-primary">KaartBuddy</span>
          <span className="truncate text-xs text-muted-foreground">{session.user.email}</span>
          <Button
            variant="link"
            size="sm"
            className="h-auto w-fit justify-start px-0 text-foreground"
            onClick={() => void signOut()}
          >
            Uitloggen
          </Button>
          {pendingCount > 0 && (
            <Badge
              variant="outline"
              className="mt-1 w-fit border-accent bg-accent/20 text-accent-foreground"
            >
              {pendingCount} wijziging{pendingCount === 1 ? "" : "en"} wacht
              {pendingCount === 1 ? "" : "en"} op synchronisatie
            </Badge>
          )}
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>Hoofd</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {mainNav.map((item) => (
                  <SidebarMenuItem key={item.path}>
                    <SidebarMenuButton
                      isActive={isActivePath(location.pathname, item.path)}
                      onClick={() => navigate(item.path)}
                    >
                      {item.label}
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
          <SidebarGroup>
            <SidebarGroupLabel>Instellingen</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {settingsNav.map((item) => (
                  <SidebarMenuItem key={item.path}>
                    <SidebarMenuButton
                      isActive={isActivePath(location.pathname, item.path)}
                      onClick={() => navigate(item.path)}
                    >
                      {item.label}
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
      </Sidebar>
      <SidebarInset>
        <header className="flex items-center gap-2 border-b px-4 py-3 md:hidden">
          <SidebarTrigger />
          <span className="font-semibold text-primary">KaartBuddy</span>
        </header>
        <main className="flex-1 p-6">
          <Routes>
            <Route path="/" element={<SeasonsPage />} />
            <Route path="/players" element={<PlayersPage />} />
            <Route path="/data" element={<DataPage />} />
            <Route path="/events" element={<EventsPage />} />
            <Route path="/events/:id" element={<EventDetailPage />} />
            <Route path="/ranking" element={<RankingPage />} />
          </Routes>
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
```

- [ ] **Step 2: Verify it typechecks (pages still use MUI — a full build will only succeed once
  Task 12 removes MUI; a typecheck of `App.tsx`'s own contents is what matters here)**

```bash
cd client && npx tsc -b --noEmit
```

Expected: no errors attributable to `App.tsx` itself. If `tsc` reports pre-existing errors from
still-unmigrated MUI pages, that's not possible — MUI pages compile fine on their own regardless
of `App.tsx`'s changes, since neither imports from the other's internals. Any real error here is
in this file; fix it before proceeding.

- [ ] **Step 3: Manually verify**

```bash
supabase start   # if not already running
netlify dev
```

Log in (any existing test account) and confirm: the sidebar renders with "KaartBuddy", your
email, "Uitloggen", the Hoofd/Instellingen groups with correct nav items, and clicking a nav
item navigates and highlights it as active. Every *page's content* will still look like the old
MUI version — only the shell around it has changed. Take a screenshot for the record.

- [ ] **Step 4: Commit**

```bash
git add client/src/App.tsx
git commit -m "Rebuild navigation shell with shadcn Sidebar"
```

---

### Task 5: Rebuild `LoginPage.tsx`

**Files:**
- Modify: `client/src/pages/LoginPage.tsx` (full rewrite)

**Interfaces:**
- Consumes: `useAuth()` (unchanged), `Button`/`Card`/`CardHeader`/`CardTitle`/`CardContent`/
  `Input`/`Label` (Task 2), `toast` from `sonner` (Task 3).

**Do not change:** the `signIn(email, password)` call or its Dutch error string — that lives in
`auth/AuthContext.tsx` and is out of scope.

- [ ] **Step 1: Replace `client/src/pages/LoginPage.tsx` in full**

```tsx
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { useAuth } from "../auth/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function LoginPage() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    const error = await signIn(email, password);
    if (error) toast.error(error);
    setSubmitting(false);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <Card className="w-[360px]">
        <CardHeader>
          <CardTitle className="text-xl">KaartBuddy inloggen</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="login-email">E-mailadres</Label>
              <Input
                id="login-email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="login-password">Wachtwoord</Label>
              <Input
                id="login-password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
            </div>
            <Button type="submit" disabled={submitting}>
              Inloggen
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 2: Verify**

```bash
cd client && npx tsc -b --noEmit
```

- [ ] **Step 3: Manually verify**

With `netlify dev` running, log out (or open an incognito window at the app URL) and confirm:
the login form renders centered, submitting with a wrong password shows a red toast reading
"Ongeldige inloggegevens." (top-right), and a correct login proceeds into the app. Screenshot
both the empty form and the error-toast state.

- [ ] **Step 4: Commit**

```bash
git add client/src/pages/LoginPage.tsx
git commit -m "Rebuild LoginPage with shadcn components"
```

---

### Task 6: Rebuild `SeasonsPage.tsx`

**Files:**
- Modify: `client/src/pages/SeasonsPage.tsx` (full rewrite)

**Interfaces:**
- Consumes: `apiGet`/`apiSend` (unchanged), `Season` type (unchanged), `formatEventDate`
  (unchanged), `Button`/`Card`/`CardContent`/`Checkbox`/`Input`/`Label` (Task 2), `toast`
  (Task 3).

**Preserve unchanged (byte-for-byte logic, only the error-reporting call changes from
`setError(...)` to `toast.error(...)`):** `loadSeasons`, `addSeason`, `toggleArchive`,
`updateScoreCount`. Remove the `error` state entirely — it's replaced by toasts.

- [ ] **Step 1: Replace `client/src/pages/SeasonsPage.tsx` in full**

```tsx
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiGet, apiSend } from "../api";
import { Season } from "../types";
import { formatEventDate } from "../utils/date";

export function SeasonsPage() {
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [includeArchived, setIncludeArchived] = useState(false);
  const [name, setName] = useState("");
  const [scoreCountBySeason, setScoreCountBySeason] = useState<Record<number, string>>({});

  const loadSeasons = async () => {
    try {
      const data = await apiGet<Season[]>(`/api/seasons?includeArchived=${includeArchived}`);
      setSeasons(data);
      setScoreCountBySeason((current) => {
        const next = { ...current };
        data.forEach((season) => {
          next[season.id] = String(season.topScoresCount);
        });
        return next;
      });
    } catch (err) {
      toast.error("Kon seizoenen niet laden.");
    }
  };

  useEffect(() => {
    void loadSeasons();
  }, [includeArchived]);

  const addSeason = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      toast.error("Vul een seizoensnaam in.");
      return;
    }
    try {
      const created = await apiSend<{ id: number }>("/api/seasons", "POST", { name });
      setName("");
      setSeasons((current) => [
        {
          id: created.id,
          name: trimmedName,
          topScoresCount: 7,
          startDate: null,
          endDate: null,
          isArchived: false
        },
        ...current
      ]);
      setScoreCountBySeason((current) => ({ ...current, [created.id]: "7" }));
    } catch (err) {
      toast.error("Seizoen toevoegen mislukt.");
    }
  };

  const toggleArchive = async (season: Season) => {
    try {
      await apiSend(`/api/seasons/${season.id}`, "PATCH", { isArchived: !season.isArchived });
      await loadSeasons();
    } catch (err) {
      toast.error("Archiveren mislukt.");
    }
  };

  const updateScoreCount = async (season: Season, rawValue: string) => {
    const parsed = Number(rawValue);
    if (!Number.isInteger(parsed) || parsed < 1) {
      toast.error("Vul een geldig aantal beste scores in.");
      setScoreCountBySeason((current) => ({ ...current, [season.id]: String(season.topScoresCount) }));
      return;
    }
    if (parsed === season.topScoresCount) return;
    try {
      await apiSend(`/api/seasons/${season.id}`, "PATCH", { topScoresCount: parsed });
      await loadSeasons();
    } catch (err) {
      toast.error("Aantal beste scores opslaan mislukt.");
      setScoreCountBySeason((current) => ({ ...current, [season.id]: String(season.topScoresCount) }));
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-bold">Seizoenen</h1>
        <p className="text-muted-foreground">Maak seizoenen aan en beheer archivering.</p>
      </div>

      <Card>
        <CardContent className="flex items-center gap-2 pt-6">
          <Checkbox
            id="seasons-include-archived"
            checked={includeArchived}
            onCheckedChange={(checked) => setIncludeArchived(checked === true)}
          />
          <Label htmlFor="seasons-include-archived">Toon gearchiveerde seizoenen</Label>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-2 pt-6 md:flex-row">
          <Input
            placeholder="Nieuw seizoen"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
          <Button onClick={addSeason}>Seizoen toevoegen</Button>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-3">
        {seasons.map((season) => (
          <Card key={season.id}>
            <CardContent className="flex flex-col items-start justify-between gap-3 pt-6 md:flex-row md:items-center">
              <div>
                <div className="flex flex-col gap-2 md:flex-row md:items-center">
                  <span className="text-lg font-semibold">{season.name}</span>
                  <Input
                    className="w-40"
                    type="number"
                    min={1}
                    value={scoreCountBySeason[season.id] ?? String(season.topScoresCount)}
                    onChange={(event) =>
                      setScoreCountBySeason((current) => ({ ...current, [season.id]: event.target.value }))
                    }
                    onBlur={(event) => updateScoreCount(season, event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        updateScoreCount(season, (event.target as HTMLInputElement).value);
                      }
                    }}
                    disabled={season.isArchived}
                  />
                </div>
                {(season.startDate || season.endDate) && (
                  <p className="text-sm text-muted-foreground">
                    {season.startDate && season.endDate
                      ? `Periode: ${formatEventDate(season.startDate)} - ${formatEventDate(season.endDate)}`
                      : season.startDate
                        ? `Start: ${formatEventDate(season.startDate)}`
                        : `Einde: ${formatEventDate(season.endDate ?? "")}`}
                  </p>
                )}
                {season.isArchived && <p className="text-sm text-muted-foreground">Gearchiveerd</p>}
              </div>
              <Button variant="outline" onClick={() => toggleArchive(season)}>
                {season.isArchived ? "Herstellen" : "Archiveren"}
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify**

```bash
cd client && npx tsc -b --noEmit
```

- [ ] **Step 3: Manually verify**

With `netlify dev` running, go to Seizoenen: create a season (appears immediately at the top),
toggle "Toon gearchiveerde seizoenen", edit a season's "beste scores" count (blur or Enter
saves it, an invalid value shows a red toast and reverts the field), archive/restore a season.
Screenshot the page with at least one season listed.

- [ ] **Step 4: Commit**

```bash
git add client/src/pages/SeasonsPage.tsx
git commit -m "Rebuild SeasonsPage with shadcn components"
```

---

### Task 7: Rebuild `PlayersPage.tsx`

**Files:**
- Modify: `client/src/pages/PlayersPage.tsx` (full rewrite)

**Interfaces:**
- Consumes: `apiGet`/`apiSend` (unchanged), `Player` type (unchanged), `formatPlayerId`
  (unchanged), `Button`/`Card`/`CardContent`/`Checkbox`/`Input`/`Label` (Task 2), `toast`
  (Task 3).

**Preserve unchanged:** `loadPlayers`, `addPlayer`, `toggleArchive`, `startEdit`, `cancelEdit`,
`saveEdit` — only the error-reporting calls change to `toast.error(...)`. Remove the `error`
state.

- [ ] **Step 1: Replace `client/src/pages/PlayersPage.tsx` in full**

```tsx
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiGet, apiSend } from "../api";
import { Player } from "../types";
import { formatPlayerId } from "../utils/playerId";

export function PlayersPage() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [query, setQuery] = useState("");
  const [includeArchived, setIncludeArchived] = useState(false);
  const [name, setName] = useState("");
  const [editingPlayerId, setEditingPlayerId] = useState<number | null>(null);
  const [editingName, setEditingName] = useState("");

  const loadPlayers = async () => {
    try {
      const data = await apiGet<Player[]>(
        `/api/players?query=${encodeURIComponent(query)}&includeArchived=${includeArchived}`
      );
      setPlayers(data);
    } catch (err) {
      toast.error("Kon spelers niet laden.");
    }
  };

  useEffect(() => {
    void loadPlayers();
  }, [query, includeArchived]);

  const addPlayer = async () => {
    if (!name.trim()) {
      toast.error("Vul een naam in.");
      return;
    }
    try {
      const created = await apiSend<{ id: number; name: string }>("/api/players", "POST", { name });
      setName("");
      const normalizedQuery = query.trim().toLowerCase();
      if (!normalizedQuery || created.name.toLowerCase().includes(normalizedQuery)) {
        setPlayers((current) =>
          [...current, { id: created.id, name: created.name, isArchived: false }].sort((a, b) =>
            a.name.localeCompare(b.name)
          )
        );
      }
    } catch (err) {
      toast.error("Toevoegen mislukt. Controleer of de naam uniek is.");
    }
  };

  const toggleArchive = async (player: Player) => {
    try {
      await apiSend(`/api/players/${player.id}`, "PATCH", { isArchived: !player.isArchived });
      await loadPlayers();
    } catch (err) {
      toast.error("Archiveren mislukt.");
    }
  };

  const startEdit = (player: Player) => {
    setEditingPlayerId(player.id);
    setEditingName(player.name);
  };

  const cancelEdit = () => {
    setEditingPlayerId(null);
    setEditingName("");
  };

  const saveEdit = async (player: Player) => {
    if (!editingName.trim()) {
      toast.error("Vul een naam in.");
      return;
    }
    try {
      await apiSend(`/api/players/${player.id}`, "PATCH", { name: editingName });
      await loadPlayers();
      cancelEdit();
    } catch (err) {
      toast.error("Bewerken mislukt. Controleer of de naam uniek is.");
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-bold">Spelers</h1>
        <p className="text-muted-foreground">Beheer spelers en zorg dat namen uniek blijven.</p>
      </div>

      <Card>
        <CardContent className="flex flex-col gap-3 pt-6 md:flex-row md:items-center">
          <Input placeholder="Zoeken" value={query} onChange={(event) => setQuery(event.target.value)} />
          <div className="flex items-center gap-2">
            <Checkbox
              id="players-include-archived"
              checked={includeArchived}
              onCheckedChange={(checked) => setIncludeArchived(checked === true)}
            />
            <Label htmlFor="players-include-archived">Toon gearchiveerde spelers</Label>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-2 pt-6 md:flex-row">
          <Input
            placeholder="Nieuwe speler"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
          <Button onClick={addPlayer}>Speler toevoegen</Button>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-3">
        {players.map((player) => (
          <Card key={player.id}>
            <CardContent className="flex flex-col justify-between gap-3 pt-6 md:flex-row md:items-center">
              <div>
                {editingPlayerId === player.id ? (
                  <Input value={editingName} onChange={(event) => setEditingName(event.target.value)} />
                ) : (
                  <span className="text-lg font-semibold">{player.name}</span>
                )}
                <p className="text-sm text-muted-foreground">Speler-ID: {formatPlayerId(player.id)}</p>
                {player.isArchived && <p className="text-sm text-muted-foreground">Gearchiveerd</p>}
              </div>
              <div className="flex gap-2">
                {editingPlayerId === player.id ? (
                  <>
                    <Button onClick={() => saveEdit(player)} disabled={editingName.trim() === ""}>
                      Opslaan
                    </Button>
                    <Button variant="outline" onClick={cancelEdit}>
                      Annuleren
                    </Button>
                  </>
                ) : (
                  <>
                    <Button variant="outline" onClick={() => startEdit(player)}>
                      Bewerken
                    </Button>
                    <Button variant="outline" onClick={() => toggleArchive(player)}>
                      {player.isArchived ? "Herstellen" : "Archiveren"}
                    </Button>
                  </>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify**

```bash
cd client && npx tsc -b --noEmit
```

- [ ] **Step 3: Manually verify**

With `netlify dev` running, go to Spelers: add a player (appears immediately, sorted), search
to filter, toggle archived visibility, edit a name (Opslaan/Annuleren), archive/restore.
Screenshot the page with at least one player listed and one in edit mode.

- [ ] **Step 4: Commit**

```bash
git add client/src/pages/PlayersPage.tsx
git commit -m "Rebuild PlayersPage with shadcn components"
```

---

### Task 8: Rebuild `EventsPage.tsx`

**Files:**
- Modify: `client/src/pages/EventsPage.tsx` (full rewrite)

**Interfaces:**
- Consumes: `apiGet`/`apiSend` (unchanged), `EventSummary`/`Season` types (unchanged),
  `formatEventDate` (unchanged), `Button`/`Card`/`CardContent`/`Checkbox`/`Input`/`Label`
  (Task 2), `Select`/`SelectTrigger`/`SelectValue`/`SelectContent`/`SelectItem` (Task 2),
  `toast` (Task 3).

**Preserve unchanged:** `loadSeasons`, `loadEvents`, `addEvent`, and the archive-toggle inline
handler — only error reporting changes to `toast.error(...)`. Remove the `error` state. Note:
shadcn's `Select` only works with string values, so the season `<Select>` converts
`String(season.id)` / `Number(value)` at its boundary — the `seasonId` state itself stays
`number | ""` exactly as before.

- [ ] **Step 1: Replace `client/src/pages/EventsPage.tsx` in full**

```tsx
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiGet, apiSend } from "../api";
import { EventSummary, Season } from "../types";
import { formatEventDate } from "../utils/date";

export function EventsPage() {
  const navigate = useNavigate();
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [events, setEvents] = useState<EventSummary[]>([]);
  const [seasonId, setSeasonId] = useState<number | "">("");
  const [eventDate, setEventDate] = useState("");
  const [title, setTitle] = useState("");
  const [includeArchived, setIncludeArchived] = useState(false);

  const loadSeasons = async () => {
    try {
      const data = await apiGet<Season[]>("/api/seasons?includeArchived=false");
      setSeasons(data.filter((season) => !season.isArchived));
      if (data.length > 0 && seasonId === "") {
        setSeasonId(data[0].id);
      }
    } catch (err) {
      toast.error("Kon seizoenen niet laden.");
    }
  };

  const loadEvents = async (activeSeasonId: number | "", showArchived: boolean) => {
    if (activeSeasonId === "") {
      setEvents([]);
      return;
    }
    try {
      const data = await apiGet<EventSummary[]>(
        `/api/events?seasonId=${activeSeasonId}&includeArchived=${showArchived}`
      );
      setEvents(data);
    } catch (err) {
      toast.error("Kon kaartavonden niet laden.");
    }
  };

  useEffect(() => {
    void loadSeasons();
  }, []);

  useEffect(() => {
    void loadEvents(seasonId, includeArchived);
  }, [seasonId, includeArchived]);

  const addEvent = async () => {
    if (seasonId === "" || !eventDate) {
      toast.error("Kies een seizoen en datum.");
      return;
    }
    try {
      const response = await apiSend<{ id: number }>("/api/events", "POST", {
        seasonId,
        eventDate,
        title: title.trim() || null
      });
      setEventDate("");
      setTitle("");
      await loadEvents(seasonId, includeArchived);
      navigate(`/events/${response.id}`);
    } catch (err) {
      toast.error("Kaartavond toevoegen mislukt.");
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-bold">Kaartavonden</h1>
        <p className="text-muted-foreground">Beheer kaartavonden per seizoen en open de detailpagina.</p>
      </div>

      <Card>
        <CardContent className="flex flex-col gap-3 pt-6 md:flex-row md:items-center">
          <Select value={seasonId === "" ? undefined : String(seasonId)} onValueChange={(value) => setSeasonId(Number(value))}>
            <SelectTrigger className="md:w-56">
              <SelectValue placeholder="Seizoen" />
            </SelectTrigger>
            <SelectContent>
              {seasons.map((season) => (
                <SelectItem key={season.id} value={String(season.id)}>
                  {season.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            type="date"
            value={eventDate}
            onChange={(event) => setEventDate(event.target.value)}
            className="md:w-48"
          />
          <Input
            placeholder="Titel (optioneel)"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
          <Button onClick={addEvent}>Voeg toe</Button>
          <div className="flex items-center gap-2">
            <Checkbox
              id="events-include-archived"
              checked={includeArchived}
              onCheckedChange={(checked) => setIncludeArchived(checked === true)}
            />
            <Label htmlFor="events-include-archived">Toon gearchiveerde kaartavonden</Label>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-3">
        {events.map((event) => (
          <Card key={event.id}>
            <CardContent className="flex items-center justify-between gap-3 pt-6">
              <div>
                <span className="text-lg font-semibold">
                  {event.title || "Kaartavond"} · {formatEventDate(event.eventDate)}
                </span>
                <p className="text-sm text-muted-foreground">
                  Status: {event.status === "LOCKED" ? "Vergrendeld" : "Open"}
                </p>
                {event.isArchived && <p className="text-sm text-muted-foreground">Gearchiveerd</p>}
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => navigate(`/events/${event.id}`)}>
                  Openen
                </Button>
                <Button
                  variant="outline"
                  onClick={async () => {
                    try {
                      await apiSend(`/api/events/${event.id}`, "PATCH", { isArchived: !event.isArchived });
                      await loadEvents(seasonId, includeArchived);
                    } catch (err) {
                      toast.error("Archiveren mislukt.");
                    }
                  }}
                >
                  {event.isArchived ? "Herstellen" : "Archiveren"}
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify**

```bash
cd client && npx tsc -b --noEmit
```

- [ ] **Step 3: Manually verify**

With `netlify dev` running, go to Kaartavonden: pick a season, add an event (navigates into its
detail page — that page still looks like MUI until Task 11), go back, toggle archived, archive/
restore an event. Screenshot the list with at least one event.

- [ ] **Step 4: Commit**

```bash
git add client/src/pages/EventsPage.tsx
git commit -m "Rebuild EventsPage with shadcn components"
```

---

### Task 9: Rebuild `RankingPage.tsx` (with medal badges)

**Files:**
- Create: `client/src/utils/medalColors.ts`
- Modify: `client/src/pages/RankingPage.tsx` (full rewrite)

**Interfaces:**
- Consumes: `apiGet` (unchanged), `Season`/`SeasonRanking` types (unchanged), `formatPlayerId`
  (unchanged), `Card`/`CardContent`/`Table`-family/`Badge` (Task 2), `Select`-family (Task 2).
- Produces: `RANK_MEDAL_COLORS` (`client/src/utils/medalColors.ts`) — a 3-entry array of hex
  colors for gold/silver/bronze, indexed `[0]`/`[1]`/`[2]` for rank 1/2/3. **Task 11 consumes
  this too** — do not duplicate these hex values there.

**Preserve unchanged:** `loadSeasons`, `loadRanking`, and the `rankingDisplay` tie-detection
memo's *logic* (which scores tie, which rows get a highlight) — only what it stores as the
highlight value changes, from an MUI `alpha()`-computed color string to a Tailwind class name.

- [ ] **Step 1: Create `client/src/utils/medalColors.ts`**

```ts
// Index 0/1/2 = rank 1/2/3 (gold/silver/bronze). Shared between RankingPage and
// EventDetailPage so both rankings use the same visual language for "who's winning."
export const RANK_MEDAL_COLORS = ["#f6d365", "#c0c0c0", "#cd7f32"];
```

- [ ] **Step 2: Replace `client/src/pages/RankingPage.tsx` in full**

```tsx
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { apiGet } from "../api";
import { Season, SeasonRanking } from "../types";
import { formatPlayerId } from "../utils/playerId";
import { RANK_MEDAL_COLORS } from "../utils/medalColors";

const TIE_HIGHLIGHT_CLASSES = ["bg-accent/20", "bg-primary/10", "bg-secondary"];

export function RankingPage() {
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [seasonId, setSeasonId] = useState<number | "">("");
  const [ranking, setRanking] = useState<SeasonRanking | null>(null);

  const rankingDisplay = useMemo(() => {
    if (!ranking?.ranking) {
      return { rows: [], tieClassByScore: new Map<number, string>() };
    }

    const rows = [...ranking.ranking].sort((a, b) => a.rank - b.rank);
    const scoreCounts = new Map<number, number>();
    rows.forEach((entry) => {
      scoreCounts.set(entry.seasonTotal, (scoreCounts.get(entry.seasonTotal) ?? 0) + 1);
    });

    const tieClassByScore = new Map<number, string>();
    let tieIndex = 0;
    rows.forEach((entry) => {
      if ((scoreCounts.get(entry.seasonTotal) ?? 0) > 1) {
        if (!tieClassByScore.has(entry.seasonTotal)) {
          tieClassByScore.set(entry.seasonTotal, TIE_HIGHLIGHT_CLASSES[tieIndex % TIE_HIGHLIGHT_CLASSES.length]);
          tieIndex += 1;
        }
      }
    });

    return { rows, tieClassByScore };
  }, [ranking]);

  const loadSeasons = async () => {
    try {
      const data = await apiGet<Season[]>("/api/seasons?includeArchived=false");
      setSeasons(data.filter((season) => !season.isArchived));
      if (data.length > 0 && seasonId === "") {
        setSeasonId(data[0].id);
      }
    } catch (err) {
      toast.error("Kon seizoenen niet laden.");
    }
  };

  const loadRanking = async (activeSeasonId: number | "") => {
    if (activeSeasonId === "") {
      setRanking(null);
      return;
    }
    try {
      const data = await apiGet<SeasonRanking>(`/api/seasons/${activeSeasonId}/ranking`);
      setRanking(data);
    } catch (err) {
      toast.error("Kon klassement niet laden.");
    }
  };

  useEffect(() => {
    void loadSeasons();
  }, []);

  useEffect(() => {
    void loadRanking(seasonId);
  }, [seasonId]);

  const activeSeason = seasonId === "" ? null : seasons.find((season) => season.id === seasonId) ?? null;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-bold">Klassement</h1>
        <p className="text-muted-foreground">
          Het klassement wordt alleen getoond wanneer alle kaartavonden zijn vergrendeld.
        </p>
      </div>

      <Card>
        <CardContent className="pt-6">
          <Select value={seasonId === "" ? undefined : String(seasonId)} onValueChange={(value) => setSeasonId(Number(value))}>
            <SelectTrigger className="md:w-56">
              <SelectValue placeholder="Seizoen" />
            </SelectTrigger>
            <SelectContent>
              {seasons.map((season) => (
                <SelectItem key={season.id} value={String(season.id)}>
                  {season.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {activeSeason && (
            <p className="mt-2 text-sm text-muted-foreground">
              Beste {activeSeason.topScoresCount} scores tellen mee voor het klassement.
            </p>
          )}
        </CardContent>
      </Card>

      {ranking && !ranking.available && (
        <Card>
          <CardContent className="pt-6 text-sm">{ranking.message}</CardContent>
        </Card>
      )}

      {ranking?.available && ranking.ranking && (
        <Card>
          <CardContent className="pt-6">
            {ranking.tieWarning && (
              <p className="mb-4 text-sm font-medium text-destructive">
                Er is een gelijke stand in het klassement.
              </p>
            )}
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Rang</TableHead>
                  <TableHead>Speler-ID</TableHead>
                  <TableHead>Speler</TableHead>
                  <TableHead>Totaal punten</TableHead>
                  <TableHead>Kaartavonden</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rankingDisplay.rows.map((entry) => (
                  <TableRow key={entry.playerId} className={rankingDisplay.tieClassByScore.get(entry.seasonTotal)}>
                    <TableCell className="font-semibold">
                      {entry.rank <= 3 ? (
                        <Badge style={{ backgroundColor: RANK_MEDAL_COLORS[entry.rank - 1] }} className="text-foreground">
                          {entry.rank}
                        </Badge>
                      ) : (
                        entry.rank
                      )}
                    </TableCell>
                    <TableCell>{formatPlayerId(entry.playerId)}</TableCell>
                    <TableCell>{entry.playerName}</TableCell>
                    <TableCell>{entry.seasonTotal}</TableCell>
                    <TableCell>{entry.appearances}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Verify**

```bash
cd client && npx tsc -b --noEmit
```

- [ ] **Step 4: Manually verify**

With `netlify dev` running, go to Klassement with a season that has locked events: confirm the
table renders, ranks 1-3 show a gold/silver/bronze badge, tied rows share a subtle background
tint. Screenshot the ranking table.

- [ ] **Step 5: Commit**

```bash
git add client/src/utils/medalColors.ts client/src/pages/RankingPage.tsx
git commit -m "Rebuild RankingPage with shadcn components and medal badges"
```

---

### Task 10: Rebuild `DataPage.tsx` (with `AlertDialog` confirmation)

**Files:**
- Modify: `client/src/pages/DataPage.tsx` (full rewrite)

**Interfaces:**
- Consumes: `apiGet`/`apiSend` (unchanged), `Button`/`Card`/`CardContent`/`Textarea` (Task 2),
  `AlertDialog`-family (Task 3), `toast` (Task 3).

**Preserve unchanged:** `downloadFile`, `buildExportFilename`, `handleExport`, `handleImport`,
`handleImportPlayers` logic exactly as-is (only their `setError`/`setSuccess` calls become
`toast.error`/`toast.success`). **`handleReset` changes**: remove its internal
`window.confirm(...)` check entirely — the confirmation now happens in the `AlertDialog` before
`handleReset` is ever called, so `handleReset` becomes just the try/catch body that wipes data.

- [ ] **Step 1: Replace `client/src/pages/DataPage.tsx` in full**

```tsx
import { useRef, useState } from "react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
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
  const [playerImportText, setPlayerImportText] = useState("");

  const handleExport = async () => {
    try {
      const payload = await apiGet<unknown>("/api/data/export");
      downloadFile(JSON.stringify(payload, null, 2), buildExportFilename(), "application/json");
      toast.success("Back-up opgeslagen.");
    } catch {
      toast.error("Exporteren mislukt.");
    }
  };

  const handleImport = async (file: File) => {
    try {
      const parsed = JSON.parse(await file.text());
      await apiSend("/api/data/import", "POST", parsed);
      toast.success("Back-up geïmporteerd.");
    } catch {
      toast.error("Importeren mislukt. Controleer het bestand.");
    }
  };

  const handleReset = async () => {
    try {
      await apiSend("/api/data/wipe", "POST");
      toast.success("Alle data is gewist.");
    } catch {
      toast.error("Wissen mislukt.");
    }
  };

  const handleImportPlayers = async () => {
    const lines = playerImportText.split(/\r?\n/).map((line) => line.trim()).filter((line) => line.length > 0);
    if (lines.length === 0) {
      toast.error("Plak minimaal één spelersnaam.");
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
      toast.error("Geen nieuwe spelers toegevoegd.");
      return;
    }
    toast.success(`${added} spelers toegevoegd.`);
    setPlayerImportText("");
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-bold">Databeheer</h1>
        <p>Maak een back-up, importeer data of wis de opgeslagen data.</p>
        <p className="text-sm text-muted-foreground">Importeren vervangt de huidige data.</p>
      </div>

      <Card>
        <CardContent className="flex flex-col gap-2 pt-6 md:flex-row">
          <Button onClick={handleExport}>Exporteer back-up</Button>
          <Button variant="outline" onClick={() => inputRef.current?.click()}>
            Importeer back-up
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive">Wis alle data</Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Weet je zeker dat je alle data wilt wissen?</AlertDialogTitle>
                <AlertDialogDescription>Dit kan niet ongedaan worden gemaakt.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Annuleren</AlertDialogCancel>
                <AlertDialogAction onClick={handleReset}>Wissen</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          <input
            ref={inputRef}
            type="file"
            accept="application/json"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void handleImport(file);
              if (inputRef.current) inputRef.current.value = "";
            }}
          />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-3 pt-6">
          <h2 className="text-lg font-semibold">Spelers importeren</h2>
          <p className="text-sm text-muted-foreground">Plak spelersnamen, één naam per regel.</p>
          <Textarea
            rows={6}
            placeholder={"Jan Jansen\nPiet de Vries\n..."}
            value={playerImportText}
            onChange={(event) => setPlayerImportText(event.target.value)}
          />
          <Button onClick={handleImportPlayers}>Importeer spelers</Button>
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 2: Verify**

```bash
cd client && npx tsc -b --noEmit
```

- [ ] **Step 3: Manually verify**

With `netlify dev` running, go to Databeheer: export (downloads a file, green toast), paste a
couple of names into "Spelers importeren" and import them, click "Wis alle data" and confirm
the `AlertDialog` appears with "Annuleren"/"Wissen" — cancelling does nothing, confirming wipes
data and shows a green toast. Screenshot the open confirmation dialog.

- [ ] **Step 4: Commit**

```bash
git add client/src/pages/DataPage.tsx
git commit -m "Rebuild DataPage with shadcn components and AlertDialog confirmation"
```

---

### Task 11: Rebuild `EventDetailPage.tsx` (deliberate attention — score table + results)

**Files:**
- Modify: `client/src/pages/EventDetailPage.tsx` (full rewrite)

**Interfaces:**
- Consumes: `apiGet`/`apiSend` (unchanged), `EventDetail`/`EventParticipant`/`Player` types
  (unchanged), `formatEventDate`/`formatPlayerId` (unchanged), `createKeyedDebouncer`
  (unchanged, from Task 13 of the cloud-migration plan — **do not modify
  `client/src/utils/keyedDebouncer.ts`**), `RANK_MEDAL_COLORS` (Task 9),
  `Button`/`Card`/`CardContent`/`Input`/`Table`-family/`Select`-family (Task 2), `toast`
  (Task 3), `lucide-react`'s `Trophy` and `Medal` icons.

**Preserve unchanged, byte-for-byte:** `rankingDisplay` memo's sort/tie-detection *logic*,
`handleSort`, `focusNextInColumn`, `loadEvent` (including its pending-edit-preserving merge —
this is the fix from the earlier latency-fix session, do not touch it), `loadPlayers`,
`availablePlayers`/`playerIdByName`/`participantByName` memos, `formatWinnerLabel`/
`formatPoints`/`getRoundPoints`/`getTotalPoints`, `saveScore`, `updateScore`,
`removeParticipant`, `lockEvent`, `savePrizeRanks`, `unlockEvent`, and the `scoreSaveDebouncer`
ref + its flush-on-unmount effect. **Only these things change:**
1. `error`/`success` state removed; every `setError(...)`/`setSuccess(...)` call becomes
   `toast.error(...)`/`toast.success(...)`.
2. The MUI `useTheme()` call and its one use (the active-row outline color) is replaced by a
   Tailwind `ring-2 ring-primary` class applied conditionally.
3. `rankColorByValue`'s color source changes from an inline 3-hex-value array to the shared
   `RANK_MEDAL_COLORS` import (same values, same per-round highlighting logic).
4. All JSX: MUI → shadcn/Tailwind, per the mapping below. The sortable column headers (MUI's
   `TableSortLabel`) become plain clickable `TableHead` cells showing a `▲`/`▼` suffix when
   active — same `handleSort`/`sortKey`/`sortDirection` wiring, just simpler markup (no new
   component needed).

- [ ] **Step 1: Replace `client/src/pages/EventDetailPage.tsx` in full**

```tsx
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useNavigate, useParams } from "react-router-dom";
import { Trophy, Medal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { apiGet, apiSend } from "../api";
import { EventDetail, EventParticipant, Player } from "../types";
import { formatEventDate } from "../utils/date";
import { formatPlayerId } from "../utils/playerId";
import { createKeyedDebouncer } from "../utils/keyedDebouncer";
import { RANK_MEDAL_COLORS } from "../utils/medalColors";

const SCORE_SAVE_DEBOUNCE_MS = 500;

type SortDirection = "asc" | "desc";
type SortKey =
  | "activeRank"
  | "playerName"
  | "playerId"
  | "pointsR1"
  | "pointsR2"
  | "pointsR3"
  | "totalPoints";

export function EventDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const eventId = Number(id);
  const [event, setEvent] = useState<EventDetail | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [playerId, setPlayerId] = useState<number | "">("");
  const [activeParticipantId, setActiveParticipantId] = useState<number | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("playerName");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const inputRefs = useRef<
    Record<number, Partial<Record<"pointsR1" | "pointsR2" | "pointsR3", HTMLInputElement | null>>>
  >({});
  const scoreSaveDebouncer = useRef(
    createKeyedDebouncer<[EventParticipant, "pointsR1" | "pointsR2" | "pointsR3", number | null]>(
      SCORE_SAVE_DEBOUNCE_MS
    )
  );

  useEffect(() => {
    const debouncer = scoreSaveDebouncer.current;
    return () => debouncer.flushAll();
  }, []);

  const [prizeRanks, setPrizeRanks] = useState<[string, string, string]>(["1", "18", "25"]);

  const rankingDisplay = useMemo(() => {
    if (!event) {
      return {
        rows: [] as EventParticipant[],
        activeById: new Map<number, { rank: number | null; score: number | null }>(),
        rankColorByValue: new Map<number, string>()
      };
    }

    const snapshots = event.participants.map((participant) => {
      if (participant.rankR3 !== null) {
        return { participant, rank: participant.rankR3, score: participant.totalPoints };
      }
      if (participant.rankR2 !== null) {
        const score = (participant.pointsR1 ?? 0) + (participant.pointsR2 ?? 0);
        return { participant, rank: participant.rankR2, score };
      }
      if (participant.rankR1 !== null) {
        return { participant, rank: participant.rankR1, score: participant.pointsR1 };
      }
      return { participant, rank: null, score: null };
    });

    const activeById = new Map<number, { rank: number | null; score: number | null }>();
    snapshots.forEach((entry) => {
      activeById.set(entry.participant.id, { rank: entry.rank, score: entry.score });
    });

    const rankColorByValue = new Map<number, string>();
    event.prizeRanks.forEach((rank, index) => {
      if (!rankColorByValue.has(rank)) {
        rankColorByValue.set(rank, RANK_MEDAL_COLORS[index] ?? RANK_MEDAL_COLORS[0]);
      }
    });

    const getSortValue = (entry: (typeof snapshots)[number], key: SortKey) => {
      const participant = entry.participant;
      switch (key) {
        case "activeRank":
          return entry.rank;
        case "playerName":
          return participant.playerName;
        case "playerId":
          return participant.playerId;
        case "pointsR1":
          return participant.pointsR1;
        case "pointsR2":
          return participant.pointsR2;
        case "pointsR3":
          return participant.pointsR3;
        case "totalPoints":
          return participant.totalPoints;
      }
    };

    const sorted = [...snapshots].sort((a, b) => {
      const aVal = getSortValue(a, sortKey);
      const bVal = getSortValue(b, sortKey);

      if (aVal === null || aVal === undefined) {
        if (bVal === null || bVal === undefined) {
          return a.participant.playerName.localeCompare(b.participant.playerName);
        }
        return 1;
      }
      if (bVal === null || bVal === undefined) {
        return -1;
      }

      let comparison = 0;
      if (typeof aVal === "string" && typeof bVal === "string") {
        comparison = aVal.localeCompare(bVal);
      } else {
        comparison = Number(aVal) - Number(bVal);
      }

      if (comparison === 0) {
        comparison = a.participant.playerName.localeCompare(b.participant.playerName);
      }

      return sortDirection === "asc" ? comparison : comparison * -1;
    });

    return {
      rows: sorted.map((entry) => entry.participant),
      activeById,
      rankColorByValue
    };
  }, [event, sortDirection, sortKey]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(key);
    setSortDirection("asc");
  };

  const sortIndicator = (key: SortKey) => (sortKey === key ? (sortDirection === "asc" ? " ▲" : " ▼") : "");

  const focusNextInColumn = (
    field: "pointsR1" | "pointsR2" | "pointsR3",
    currentId: number,
    direction: 1 | -1
  ) => {
    const ids = rankingDisplay.rows.map((participant) => participant.id);
    const currentIndex = ids.indexOf(currentId);
    if (currentIndex === -1) return;
    const nextIndex = currentIndex + direction;
    if (nextIndex < 0 || nextIndex >= ids.length) {
      return;
    }
    const nextId = ids[nextIndex];
    const nextInput = inputRefs.current[nextId]?.[field];
    if (nextInput) {
      nextInput.focus();
      nextInput.select();
    }
  };

  const loadEvent = async () => {
    try {
      const data = await apiGet<EventDetail>(`/api/events/${eventId}`);
      setEvent((current) => {
        if (!current) return data;
        return {
          ...data,
          participants: data.participants.map((fresh) => {
            const displayed = current.participants.find((p) => p.id === fresh.id);
            if (!displayed) return fresh;
            const merged = { ...fresh };
            (["pointsR1", "pointsR2", "pointsR3"] as const).forEach((field) => {
              if (scoreSaveDebouncer.current.hasPending(`${fresh.id}:${field}`)) {
                merged[field] = displayed[field];
              }
            });
            return merged;
          })
        };
      });
      if (data.prizeRanks.length === 3) {
        setPrizeRanks([String(data.prizeRanks[0]), String(data.prizeRanks[1]), String(data.prizeRanks[2])]);
      }
    } catch (err) {
      toast.error("Kon kaartavond niet laden.");
    }
  };

  const loadPlayers = async () => {
    try {
      const data = await apiGet<Player[]>("/api/players?query=&includeArchived=false");
      setPlayers(data.filter((player) => !player.isArchived));
      if (data.length > 0 && playerId === "") {
        setPlayerId(data[0].id);
      }
    } catch (err) {
      toast.error("Kon spelers niet laden.");
    }
  };

  useEffect(() => {
    if (!Number.isFinite(eventId)) {
      navigate("/events");
      return;
    }
    void loadEvent();
    void loadPlayers();
  }, [eventId]);

  const availablePlayers = useMemo(() => {
    if (!event) return players;
    const existing = new Set(event.participants.map((p) => p.playerId));
    return players.filter((player) => !existing.has(player.id));
  }, [players, event]);

  const addParticipant = async () => {
    if (playerId === "") {
      toast.error("Kies een speler.");
      return;
    }
    try {
      await apiSend(`/api/events/${eventId}/participants`, "POST", { playerId });
      toast.success("Deelnemer toegevoegd.");
      await loadEvent();
    } catch (err) {
      toast.error("Deelnemer toevoegen mislukt.");
    }
  };

  const playerIdByName = useMemo(() => {
    if (!event) return new Map<string, number>();
    const map = new Map<string, number>();
    event.participants.forEach((participant) => {
      map.set(participant.playerName, participant.playerId);
    });
    return map;
  }, [event]);

  const participantByName = useMemo(() => {
    if (!event) return new Map<string, EventParticipant>();
    const map = new Map<string, EventParticipant>();
    event.participants.forEach((participant) => {
      map.set(participant.playerName, participant);
    });
    return map;
  }, [event]);

  const formatWinnerLabel = (name: string) => {
    const winnerPlayerId = playerIdByName.get(name);
    if (!winnerPlayerId) return name;
    return `${formatPlayerId(winnerPlayerId)} · ${name}`;
  };

  const formatPoints = (points: number | null | undefined) => {
    if (points === null || points === undefined) return "";
    return `${points} p`;
  };

  const getRoundPoints = (name: string, round: 1 | 2 | 3) => {
    const participant = participantByName.get(name);
    if (!participant) return null;
    if (round === 1) return participant.pointsR1;
    if (round === 2) return participant.pointsR2;
    return participant.pointsR3;
  };

  const getTotalPoints = (name: string) => {
    const participant = participantByName.get(name);
    return participant?.totalPoints ?? null;
  };

  const saveScore = async (
    participant: EventParticipant,
    field: "pointsR1" | "pointsR2" | "pointsR3",
    payloadValue: number | null
  ) => {
    try {
      await apiSend(`/api/events/${eventId}/participants/${participant.id}`, "PATCH", { [field]: payloadValue });
    } catch (err) {
      toast.error("Punten opslaan mislukt.");
    } finally {
      await loadEvent();
    }
  };

  const updateScore = (
    participant: EventParticipant,
    field: "pointsR1" | "pointsR2" | "pointsR3",
    value: string
  ) => {
    const payloadValue = value === "" ? null : Number(value);
    if (value !== "" && Number.isNaN(payloadValue)) return;

    setEvent((current) => {
      if (!current) return current;
      return {
        ...current,
        participants: current.participants.map((p) => (p.id === participant.id ? { ...p, [field]: payloadValue } : p))
      };
    });

    scoreSaveDebouncer.current.schedule(`${participant.id}:${field}`, saveScore, participant, field, payloadValue);
  };

  const removeParticipant = async (participant: EventParticipant) => {
    try {
      await apiSend(`/api/events/${eventId}/participants/${participant.id}`, "DELETE");
      toast.success("Deelnemer verwijderd.");
      await loadEvent();
      await loadPlayers();
    } catch (err) {
      toast.error("Deelnemer verwijderen mislukt.");
    }
  };

  const lockEvent = async () => {
    try {
      await apiSend(`/api/events/${eventId}/lock`, "POST");
      toast.success("Kaartavond vergrendeld.");
      await loadEvent();
    } catch (err) {
      toast.error("Vergrendelen mislukt. Controleer de voorwaarden.");
    }
  };

  const savePrizeRanks = async () => {
    const parsed = prizeRanks.map((value) => Number(value));
    if (parsed.some((value) => !Number.isInteger(value) || value < 1 || value > 60)) {
      toast.error("Vul drie geldige rangnummers in.");
      return;
    }
    const unique = new Set(parsed);
    if (unique.size !== parsed.length) {
      toast.error("Prijsrangen moeten uniek zijn.");
      return;
    }
    try {
      await apiSend(`/api/events/${eventId}`, "PATCH", {
        prizeRank1: parsed[0],
        prizeRank2: parsed[1],
        prizeRank3: parsed[2]
      });
      toast.success("Prijsrangen opgeslagen.");
      await loadEvent();
    } catch (err) {
      toast.error("Prijsrangen opslaan mislukt.");
    }
  };

  const unlockEvent = async () => {
    try {
      await apiSend(`/api/events/${eventId}/unlock`, "POST");
      toast.success("Kaartavond ontgrendeld.");
      await loadEvent();
    } catch (err) {
      toast.error("Ontgrendelen mislukt.");
    }
  };

  if (!event) {
    return (
      <div>
        <p>Kaartavond laden...</p>
      </div>
    );
  }

  const endWinners = event.eventWinners.length > 0 ? event.eventWinners : event.eventWinner ? [event.eventWinner] : [];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-bold">{event.title || "Kaartavond"}</h1>
        <p>
          Datum: {formatEventDate(event.eventDate)} · Status: {event.status === "LOCKED" ? "Vergrendeld" : "Open"}
        </p>
      </div>

      {event.status === "LOCKED" && (
        <Card className="border-primary/40 bg-secondary">
          <CardContent className="pt-6 text-sm">
            Deze kaartavond is vergrendeld. Ontgrendel om wijzigingen te doen.
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="flex flex-col gap-3 pt-6 md:flex-row md:items-center">
          <Select
            value={playerId === "" ? undefined : String(playerId)}
            onValueChange={(value) => setPlayerId(Number(value))}
            disabled={event.status === "LOCKED"}
          >
            <SelectTrigger className="md:w-64">
              <SelectValue placeholder="Deelnemer toevoegen" />
            </SelectTrigger>
            <SelectContent>
              {availablePlayers.map((player) => (
                <SelectItem key={player.id} value={String(player.id)}>
                  {formatPlayerId(player.id)} · {player.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button onClick={addParticipant} disabled={event.status === "LOCKED" || availablePlayers.length === 0}>
            Deelnemer toevoegen
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <h2 className="mb-4 text-lg font-semibold">Scores en rangschikking</h2>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="cursor-pointer select-none" onClick={() => handleSort("activeRank")}>
                  Rang{sortIndicator("activeRank")}
                </TableHead>
                <TableHead className="cursor-pointer select-none" onClick={() => handleSort("playerId")}>
                  ID{sortIndicator("playerId")}
                </TableHead>
                <TableHead className="cursor-pointer select-none" onClick={() => handleSort("playerName")}>
                  Naam{sortIndicator("playerName")}
                </TableHead>
                <TableHead className="cursor-pointer select-none" onClick={() => handleSort("pointsR1")}>
                  Punten R1{sortIndicator("pointsR1")}
                </TableHead>
                <TableHead className="cursor-pointer select-none" onClick={() => handleSort("pointsR2")}>
                  Punten R2{sortIndicator("pointsR2")}
                </TableHead>
                <TableHead className="cursor-pointer select-none" onClick={() => handleSort("pointsR3")}>
                  Punten R3{sortIndicator("pointsR3")}
                </TableHead>
                <TableHead className="cursor-pointer select-none" onClick={() => handleSort("totalPoints")}>
                  Totaal punten{sortIndicator("totalPoints")}
                </TableHead>
                <TableHead>Acties</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rankingDisplay.rows.map((participant) => {
                const active = rankingDisplay.activeById.get(participant.id);
                const colorFor = (rank: number | null | undefined) =>
                  rank !== null && rank !== undefined ? rankingDisplay.rankColorByValue.get(rank) : undefined;

                return (
                  <TableRow
                    key={participant.id}
                    className={cn(activeParticipantId === participant.id && "ring-2 ring-inset ring-primary")}
                  >
                    <TableCell className="font-semibold">{active?.rank ?? ""}</TableCell>
                    <TableCell>{formatPlayerId(participant.playerId)}</TableCell>
                    <TableCell>{participant.playerName}</TableCell>
                    <TableCell style={{ backgroundColor: colorFor(participant.rankR1) }}>
                      <Input
                        type="number"
                        min={0}
                        className="w-20"
                        value={participant.pointsR1 ?? ""}
                        onFocus={() => setActiveParticipantId(participant.id)}
                        ref={(element) => {
                          inputRefs.current[participant.id] = inputRefs.current[participant.id] || {};
                          inputRefs.current[participant.id].pointsR1 = element;
                        }}
                        onChange={(event) => updateScore(participant, "pointsR1", event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Tab") {
                            event.preventDefault();
                            focusNextInColumn("pointsR1", participant.id, event.shiftKey ? -1 : 1);
                          }
                        }}
                        disabled={event.status === "LOCKED"}
                      />
                    </TableCell>
                    <TableCell style={{ backgroundColor: colorFor(participant.rankR2) }}>
                      <Input
                        type="number"
                        min={0}
                        className="w-20"
                        value={participant.pointsR2 ?? ""}
                        onFocus={() => setActiveParticipantId(participant.id)}
                        ref={(element) => {
                          inputRefs.current[participant.id] = inputRefs.current[participant.id] || {};
                          inputRefs.current[participant.id].pointsR2 = element;
                        }}
                        onChange={(event) => updateScore(participant, "pointsR2", event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Tab") {
                            event.preventDefault();
                            focusNextInColumn("pointsR2", participant.id, event.shiftKey ? -1 : 1);
                          }
                        }}
                        disabled={event.status === "LOCKED"}
                      />
                    </TableCell>
                    <TableCell style={{ backgroundColor: colorFor(participant.rankR3) }}>
                      <Input
                        type="number"
                        min={0}
                        className="w-20"
                        value={participant.pointsR3 ?? ""}
                        onFocus={() => setActiveParticipantId(participant.id)}
                        ref={(element) => {
                          inputRefs.current[participant.id] = inputRefs.current[participant.id] || {};
                          inputRefs.current[participant.id].pointsR3 = element;
                        }}
                        onChange={(event) => updateScore(participant, "pointsR3", event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Tab") {
                            event.preventDefault();
                            focusNextInColumn("pointsR3", participant.id, event.shiftKey ? -1 : 1);
                          }
                        }}
                        disabled={event.status === "LOCKED"}
                      />
                    </TableCell>
                    <TableCell>{participant.totalPoints ?? ""}</TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        className="text-destructive"
                        onClick={() => removeParticipant(participant)}
                        disabled={event.status === "LOCKED"}
                      >
                        Verwijderen
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="flex flex-col gap-2 pt-6">
            <h2 className="text-lg font-semibold">Prijswinnaars</h2>
            <p className="text-sm font-medium">Prijsrangen per ronde</p>
            <div className="flex flex-col gap-2">
              {prizeRanks.map((value, index) => (
                <Input
                  key={`prize-rank-${index}`}
                  type="number"
                  min={1}
                  className="max-w-40"
                  placeholder={`R${index + 1}`}
                  value={value}
                  onChange={(event) =>
                    setPrizeRanks((current) => {
                      const next = [...current] as [string, string, string];
                      next[index] = event.target.value;
                      return next;
                    })
                  }
                  disabled={event.status === "LOCKED"}
                />
              ))}
              <Button variant="outline" onClick={savePrizeRanks} disabled={event.status === "LOCKED"}>
                Opslaan
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-secondary">
          <CardContent className="flex flex-col gap-3 pt-6">
            <h2 className="text-lg font-semibold">Kaartavondresultaten</h2>
            {event.roundWinners.every((round) => round.winners.length === 0) ? (
              <p className="text-sm text-muted-foreground">Nog geen prijswinnaars beschikbaar.</p>
            ) : (
              event.roundWinners.map((round) => (
                <div key={`round-${round.round}`} className="rounded-lg border bg-card p-3">
                  <div className="flex items-center gap-2">
                    <Medal className="h-4 w-4 text-accent" />
                    <span className="font-semibold">R{round.round}</span>
                  </div>
                  <div className="mt-1">
                    {round.winners.length === 0 ? (
                      <p className="text-sm text-muted-foreground">Geen prijswinnaars.</p>
                    ) : (
                      round.winners.map((winner) => {
                        const points = getRoundPoints(winner.playerName, round.round);
                        const suffix = formatPoints(points);
                        return (
                          <p key={`round-${round.round}-${winner.rank}`}>
                            Rang {winner.rank}: {formatWinnerLabel(winner.playerName)}
                            {suffix ? ` · ${suffix}` : ""}
                          </p>
                        );
                      })
                    )}
                  </div>
                </div>
              ))
            )}
            <div className="rounded-lg border border-accent/40 bg-accent/10 p-3">
              <div className="flex items-center gap-2">
                <Trophy className="h-4 w-4 text-accent" />
                <span className="font-semibold">Eindwinnaar</span>
              </div>
              <div className="mt-1">
                {endWinners.length > 0 ? (
                  endWinners.map((winner, index) => {
                    const suffix = formatPoints(getTotalPoints(winner.playerName));
                    return (
                      <p key={`event-winner-${winner.rank}-${winner.playerName}-${index}`}>
                        Rang {winner.rank}: {formatWinnerLabel(winner.playerName)}
                        {suffix ? ` · ${suffix}` : ""}
                      </p>
                    );
                  })
                ) : (
                  <p className="text-sm text-muted-foreground">Nog geen eindwinnaar beschikbaar.</p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            {event.status === "LOCKED" ? (
              <>
                <h2 className="text-lg font-semibold">Ontgrendelen</h2>
                <p className="text-sm text-muted-foreground">Ontgrendel om de scores en deelnemers te wijzigen.</p>
                <Button className="mt-2" variant="secondary" onClick={unlockEvent}>
                  Kaartavond ontgrendelen
                </Button>
              </>
            ) : (
              <>
                <h2 className="text-lg font-semibold">Vergrendelen</h2>
                {event.canLock ? (
                  <p className="text-sm">Alle voorwaarden zijn in orde.</p>
                ) : (
                  <p className="text-sm text-muted-foreground">Voorwaarden niet voldaan: {event.lockReasons.join(", ")}</p>
                )}
                <Button className="mt-2" onClick={lockEvent} disabled={!event.canLock}>
                  Kaartavond vergrendelen
                </Button>
              </>
            )}
            {event.tieErrors.length > 0 && (
              <p className="mt-4 text-sm font-medium text-destructive">
                Let op: gelijke totaalscores in de eindstand. Vergrendelen is toegestaan.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify**

```bash
cd client && npx tsc -b --noEmit
```

- [ ] **Step 3: Manually verify — this page needs the most thorough check**

With `netlify dev` running and local Supabase up, open an event with at least 2 participants
and confirm, matching the behavior the earlier latency-fix session established:
- Typing a score shows the digit immediately (no visible lag), and it's still there after the
  ~500ms debounced save completes (check the Network tab or wait and reload — the value must
  persist).
- Editing two different participants' scores within ~200ms of each other does not clobber
  either value (this was a specific regression fixed earlier — re-verify it still holds with
  the new JSX).
- Column headers sort when clicked, arrow indicator flips direction on repeat clicks.
- Rank 1/2/3 cells (whichever round) show the gold/silver/bronze tint; adding/removing
  participants updates the table and dropdown correctly.
- Prijswinnaars/Kaartavondresultaten/Eindwinnaar render as a 3-card row with the trophy/medal
  icons.
- Locking disables all score inputs and the participant-add controls, shows "Ontgrendelen"
  card; unlocking restores editability.
- A tie in the final standings shows the destructive-colored warning text.

Screenshot: the table with scores entered, and the locked state.

- [ ] **Step 4: Commit**

```bash
git add client/src/pages/EventDetailPage.tsx
git commit -m "Rebuild EventDetailPage with shadcn components, preserving all score-entry logic"
```

---

### Task 12: Remove MUI, delete the old theme, final verification

**Files:**
- Modify: `client/package.json` (remove MUI/emotion dependencies)
- Delete: `client/src/theme.ts`
- Modify: `client/src/main.tsx` (remove `ThemeProvider`/`CssBaseline`)

**Interfaces:** none — this is cleanup only, every page is already shadcn-only after Tasks 5-11.

- [ ] **Step 1: Confirm nothing still imports MUI**

```bash
cd client && grep -rn "@mui" src/
```

Expected: no matches. If anything matches, that file was missed in an earlier task — go fix it
before continuing (do not remove the dependency while something still imports it).

- [ ] **Step 2: Remove the MUI/emotion dependencies**

```bash
npm uninstall @mui/material @mui/icons-material @emotion/react @emotion/styled
```

- [ ] **Step 3: Delete `client/src/theme.ts`**

```bash
git rm client/src/theme.ts
```

- [ ] **Step 4: Update `client/src/main.tsx`**

Remove the `ThemeProvider`/`CssBaseline` import and usage entirely. Final file:

```tsx
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { App } from "./App";
import { AuthProvider } from "./auth/AuthContext";
import { Toaster } from "@/components/ui/sonner";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
        <Toaster richColors position="top-right" />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);
```

- [ ] **Step 5: Verify the build is clean**

```bash
npx tsc -b --noEmit && npm run build
```

Expected: no errors. Check the build output size dropped noticeably (MUI + emotion were a
sizable chunk of the bundle).

- [ ] **Step 6: Run the full existing test suite (must be untouched by this whole plan)**

```bash
npx vitest run
cd ../netlify && npx vitest run
```

Expected: all tests still pass — this plan never touched `retryQueue.ts`, `keyedDebouncer.ts`,
or anything under `netlify/`.

- [ ] **Step 7: Full manual walkthrough**

With `netlify dev` running and local Supabase up, repeat the same walkthrough used for the
cloud-migration rollout: log in → create a season → create a player → create an event → add
participants → enter scores across all 3 rounds → confirm ranking/winners → lock → confirm
editing is blocked → check Klassement → exercise Databeheer (export/import/wipe with the
confirmation dialog) → log out. Confirm no visual trace of MUI (old navy/bronze colors, old
Trebuchet MS font) remains anywhere, and the new warm/terracotta palette is consistent across
every page. Take a final screenshot of each page for the record.

- [ ] **Step 8: Commit**

```bash
git add client/package.json client/package-lock.json client/src/main.tsx
git commit -m "Remove MUI and emotion; shadcn/ui redesign complete"
```

---
