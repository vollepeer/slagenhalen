# Windows 11 offline package — design

## Goal

Let a non-technical user run Filip Card fully offline on a Windows 11 PC by
double-clicking one launcher, with zero installs (no Node, no Python, no
admin rights) and zero changes to the app's functionality. The app already
runs entirely client-side (see below), so this is a packaging problem, not
an app-architecture problem.

## Context / why this works

- `client/src/localApi.ts` + `client/src/localStore.ts` reimplement the API
  surface entirely against browser `localStorage`. `client/src/api.ts` calls
  these directly — there is no network request to a backend anywhere in the
  built client.
- `server/` (Express + mysql2) and `db/` are leftovers from an earlier
  architecture. They are not imported by the client and are not part of the
  production build. This work does not touch them.
- The client uses `react-router-dom`'s `BrowserRouter` (`client/src/main.tsx`)
  and the built `index.html` references absolute paths (`/assets/...`,
  `/favicon.ico`). Both require a real HTTP origin — opening
  `client/dist/index.html` directly via `file://` will not work (routing and
  asset resolution break). This is why `serve.sh` / `serve-spa.sh` exist for
  macOS. Windows 11 has no preinstalled Python or Node, so we bundle a
  portable Node runtime instead of relying on either.
- The chosen UX is a browser tab (not a native app window) — simplest to
  build reliably from macOS, and it's how the app already runs today via
  `serve-spa.sh`. Nothing about the app's look, behavior, or data model
  changes.

## Deliverable

A new top-level `windows-package/` directory in the repo containing the
*build tooling* (checked into git), plus a build script that produces a
`FilipKaartavond/` output folder (not checked into git — it's a build
artifact) that gets copied to the Windows PC, e.g. via USB stick or zip.

```
windows-package/                     (checked into git)
  build.sh                           builds client + assembles the output folder
  server.js                          static file server template (copied into output)
  Start Filip Kaartavond.bat         launcher template (copied into output)
  Maak snelkoppeling.bat             desktop-shortcut helper template (copied into output)
  LEES MIJ.txt                       Dutch end-user instructions template (copied into output)
  .gitignore                         ignores the build output + downloaded node runtime

FilipKaartavond/                     (git-ignored build OUTPUT, produced by build.sh)
  Start Filip Kaartavond.bat
  Maak snelkoppeling.bat
  LEES MIJ.txt
  node/                              portable node.exe + dlls (downloaded from nodejs.org)
  app/
    server.js
    dist/                            client/dist, copied verbatim after `npm run build`
```

## Components

### `windows-package/build.sh`

Run manually on the dev Mac whenever a new offline package is needed
(analogous to a release build). Steps:

1. `cd client && npm run build` (existing script, untouched).
2. Create/clean `FilipKaartavond/`.
3. Copy `client/dist` → `FilipKaartavond/app/dist`.
4. Copy `windows-package/server.js` → `FilipKaartavond/app/server.js`.
5. Copy the `.bat` files and `LEES MIJ.txt` into `FilipKaartavond/`.
6. Download the official Node.js Windows x64 binary zip from
   `https://nodejs.org/dist/vX.Y.Z/node-vX.Y.Z-win-x64.zip` (version pinned
   as a variable in the script, default matching the dev machine's current
   Node LTS), if not already cached locally, and extract `node.exe` plus its
   required files into `FilipKaartavond/node/`.
7. Zip `FilipKaartavond/` → `FilipKaartavond.zip` for easy transfer.

Idempotent: safe to re-run; re-downloads only happen if the cached Node zip
is missing.

### `windows-package/server.js` (copied to `app/server.js`)

Plain Node, **zero npm dependencies** (only built-in `http`, `fs`, `path`,
`child_process`), so no `npm install` step is needed on the output side.

- Serves static files from `./dist` (relative to itself).
- SPA fallback: unknown paths (no matching file, no extension) serve
  `dist/index.html` — same behavior as `serve-spa.sh`.
- Binds to `127.0.0.1:8000` only (not `0.0.0.0`) — avoids most Windows
  Firewall "allow this app on public/private networks" prompts, since it's
  not reachable from the network.
- On successful listen, shells out to `start "" http://localhost:8000` to
  open the OS default browser automatically.
- If port 8000 is already taken (e.g. user double-clicked the launcher
  twice), it does not crash — it just opens the browser to the existing
  instance and exits cleanly.

### `windows-package/Start Filip Kaartavond.bat` (copied to output root)

```bat
@echo off
cd /d "%~dp0"
node\node.exe app\server.js
```

Runs in the foreground so the visible console window *is* the server's
lifetime — closing the window (X button or Ctrl+C) stops the server. No
background processes, no orphaned node.exe, no tray icon complexity.

### `windows-package/Maak snelkoppeling.bat` (optional convenience)

A small PowerShell-via-.bat one-liner that creates a Desktop shortcut
pointing at `Start Filip Kaartavond.bat`, so after running it once the user
can launch from an icon on their Desktop going forward instead of digging
into the folder.

### `windows-package/LEES MIJ.txt`

Dutch-language instructions (matching the app's UI language) covering:

- Double-click `Start Filip Kaartavond.bat` to start; the browser opens
  automatically.
- Close the black console window to stop the app.
- Optional: run `Maak snelkoppeling.bat` once to get a Desktop icon.
- Windows SmartScreen may warn about an "unknown app" the first time (since
  the files came from outside the Windows Store/a signed installer) — click
  "More info" → "Run anyway".
- Data lives in the browser's local storage for `http://localhost:8000` —
  don't clear that browser's site data for this app. Use the existing
  in-app "Databeheer" tab to export/import backups periodically.

## Data flow

Unchanged from today's local-storage architecture. The only new element is
*how the static assets reach the browser* (portable Node static server
instead of `python -m http.server` / a dev's `npm run dev`). No new state,
no new persistence mechanism, no schema changes.

## Error handling

- Port already in use → reuse existing instance (see `server.js` above),
  don't error out.
- Missing `dist/` folder at server start → clear console error message
  ("app/dist ontbreekt — herbouw het pakket met build.sh") instead of a
  stack trace, since the end user can't debug a stack trace.
- Build script (`build.sh`) fails fast (`set -euo pipefail`) on any step
  failure (build error, download failure, etc.) with the failing command
  visible — this script is run by the developer, not the end user, so a
  visible failure is fine.

## Testing / verification

- `server.js` is plain Node and can be run and verified locally on macOS
  directly (`node windows-package/server.js` against a built `dist/`) to
  confirm static serving + SPA fallback + port-in-use behavior all work,
  before ever touching Windows.
- `build.sh` will be run end-to-end on the dev Mac to confirm it produces a
  correctly-structured `FilipKaartavond/` folder and a valid zip.
- Actually double-clicking the `.bat` files can only be verified on real
  Windows — this is out of scope for automated verification here; the
  design keeps the `.bat` files minimal (one line of real logic) specifically
  to minimize what can only be tested on-device.
- No existing app code, tests, or behavior changes — no regression risk to
  the existing client/server.

## Out of scope

- Removing the unused `server/`/`db/` folders (separate cleanup, not
  requested).
- A native app window (Electron/Tauri) — explicitly declined in favor of
  the simpler browser-tab experience.
- Auto-update mechanism for the offline package — it's a manual rebuild +
  re-copy process, matching the app's low release cadence.
