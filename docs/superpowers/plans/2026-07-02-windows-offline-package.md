# Windows 11 Offline Package Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce a `windows-package/` build toolchain that assembles a double-click-to-run, fully offline `FilipKaartavond/` folder for Windows 11 — zero installs, zero changes to existing app behavior.

**Architecture:** A zero-dependency Node static file server (`server.js`, SPA-fallback aware) is bundled with a portable, official Node.js Windows binary and the existing production `client/dist` build. A `.bat` launcher runs the server in the foreground (closing the window stops it); the server auto-opens the default browser. A `build.sh` script (run on the developer's Mac) assembles and zips the whole thing.

**Tech Stack:** Node.js (CommonJS, no npm deps) for `server.js`; POSIX shell (`bash`) for `build.sh`; Windows Batch for the launcher scripts. Existing stack (Vite/React client) is untouched.

## Global Constraints

- The app must stay 100% functionally intact — no edits to `client/src` or `server/` (the existing Express/MySQL backend is unused dead code and is out of scope).
- No new npm runtime dependency for the packaged server — `server.js` uses only Node's built-in `http`, `fs`, `path`, `child_process` modules.
- End-user experience must require no installs, no admin rights, no typed commands — double-click only.
- Server binds to `127.0.0.1` only (not `0.0.0.0`).
- All end-user-facing text (`.bat` output, `LEES MIJ.txt`) is in Dutch, matching the app's UI language.
- Pinned portable Node version: `22.14.0` (confirmed available at `https://nodejs.org/dist/v22.14.0/node-v22.14.0-win-x64.zip`, contains a single self-contained `node.exe` with no adjacent DLLs required).
- Server port: `8000`.

---

### Task 1: Static file server (`server.js`)

**Files:**
- Create: `windows-package/server.js`

**Interfaces:**
- Consumes: nothing (zero deps).
- Produces: a script invoked as `node.exe app\server.js` (Task 3 copies it into the assembled package at `app/server.js`, sitting next to `app/dist/`). Later tasks rely on: it serving on `http://127.0.0.1:8000`, exiting with `process.exitCode = 1` and a Dutch stderr message when `./dist/index.html` is missing, and exiting cleanly (code 0) after opening the browser when the port is already in use.

- [ ] **Step 1: Write `windows-package/server.js`**

```js
"use strict";

const http = require("http");
const fs = require("fs");
const path = require("path");
const { exec } = require("child_process");

const PORT = 8000;
const HOST = "127.0.0.1";
const ROOT = path.join(__dirname, "dist");
const INDEX = path.join(ROOT, "index.html");

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".map": "application/json; charset=utf-8"
};

function safeResolve(urlPath) {
  const decoded = decodeURIComponent(urlPath.split("?")[0].split("#")[0]);
  const resolved = path.normalize(path.join(ROOT, decoded));
  if (resolved !== ROOT && !resolved.startsWith(ROOT + path.sep)) {
    return null;
  }
  return resolved;
}

function sendFile(res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || "application/octet-stream";
  const stream = fs.createReadStream(filePath);
  stream.on("open", () => {
    res.writeHead(200, { "Content-Type": contentType });
    stream.pipe(res);
  });
  stream.on("error", () => {
    res.writeHead(500);
    res.end("Interne serverfout.");
  });
}

function sendIndex(res) {
  sendFile(res, INDEX);
}

const server = http.createServer((req, res) => {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405);
    res.end();
    return;
  }

  const requestPath = req.url === "/" ? "/index.html" : req.url;
  const resolved = safeResolve(requestPath);

  if (!resolved) {
    res.writeHead(403);
    res.end();
    return;
  }

  fs.stat(resolved, (err, stats) => {
    if (!err && stats.isFile()) {
      sendFile(res, resolved);
      return;
    }

    if (!err && stats.isDirectory()) {
      const indexInDir = path.join(resolved, "index.html");
      fs.stat(indexInDir, (dirErr, dirStats) => {
        if (!dirErr && dirStats.isFile()) {
          sendFile(res, indexInDir);
        } else {
          sendIndex(res);
        }
      });
      return;
    }

    sendIndex(res);
  });
});

function openBrowser(url) {
  if (process.platform === "win32") {
    exec(`start "" "${url}"`);
  } else {
    console.log(`Open ${url} in je browser.`);
  }
}

function main() {
  if (!fs.existsSync(INDEX)) {
    console.error("Fout: app/dist ontbreekt of is onvolledig.");
    console.error("Herbouw het pakket met windows-package/build.sh.");
    process.exitCode = 1;
    return;
  }

  server.on("error", (err) => {
    if (err.code === "EADDRINUSE") {
      console.log("Filip Kaartavond draait al. Browser wordt geopend...");
      openBrowser(`http://${HOST}:${PORT}`);
      return;
    }
    console.error("Serverfout:", err.message);
    process.exitCode = 1;
  });

  server.listen(PORT, HOST, () => {
    const url = `http://${HOST}:${PORT}`;
    console.log(`Filip Kaartavond draait op ${url}`);
    console.log("Sluit dit venster om de app te stoppen.");
    openBrowser(url);
  });
}

main();
```

- [ ] **Step 2: Build a throwaway fixture to test against**

Run (uses the session scratchpad, not the repo):

```bash
FIXTURE=/private/tmp/claude-501/-Users-jan-Projects-filip-card/917b8f4c-075c-46d8-95d0-64d8fca50ad1/scratchpad/fixture-app
rm -rf "$FIXTURE"
mkdir -p "$FIXTURE/dist/assets"
cp windows-package/server.js "$FIXTURE/server.js"
printf '<!DOCTYPE html><html><body>root-marker</body></html>' > "$FIXTURE/dist/index.html"
printf 'body{color:red}' > "$FIXTURE/dist/assets/app.css"
```

Expected: no output, exit code 0.

- [ ] **Step 3: Verify missing-dist error path**

Run:

```bash
NO_DIST=/private/tmp/claude-501/-Users-jan-Projects-filip-card/917b8f4c-075c-46d8-95d0-64d8fca50ad1/scratchpad/no-dist-test
mkdir -p "$NO_DIST"
cp windows-package/server.js "$NO_DIST/server.js"
node "$NO_DIST/server.js"; echo "exit code: $?"
```

Expected output includes:
```
Fout: app/dist ontbreekt of is onvolledig.
Herbouw het pakket met windows-package/build.sh.
exit code: 1
```

- [ ] **Step 4: Verify static serving, SPA fallback, and path traversal protection**

Run (starts the server against the fixture from Step 2, runs checks, then stops it):

```bash
FIXTURE=/private/tmp/claude-501/-Users-jan-Projects-filip-card/917b8f4c-075c-46d8-95d0-64d8fca50ad1/scratchpad/fixture-app
node "$FIXTURE/server.js" & SERVER_PID=$!
sleep 0.5

echo "-- root --"
curl -s http://127.0.0.1:8000/ | grep -o root-marker

echo "-- SPA fallback for unknown route --"
curl -s http://127.0.0.1:8000/seasons/42 | grep -o root-marker

echo "-- static asset content-type --"
curl -sI http://127.0.0.1:8000/assets/app.css | grep -i "content-type: text/css"

echo "-- path traversal blocked --"
curl -s --path-as-is -o /dev/null -w "%{http_code}\n" "http://127.0.0.1:8000/../../../../etc/passwd"

kill $SERVER_PID
```

Expected output:
```
-- root --
root-marker
-- SPA fallback for unknown route --
root-marker
-- static asset content-type --
content-type: text/css; charset=utf-8
-- path traversal blocked --
403
```

- [ ] **Step 5: Verify port-in-use behavior does not crash**

Run:

```bash
FIXTURE=/private/tmp/claude-501/-Users-jan-Projects-filip-card/917b8f4c-075c-46d8-95d0-64d8fca50ad1/scratchpad/fixture-app
node "$FIXTURE/server.js" & FIRST_PID=$!
sleep 0.5
node "$FIXTURE/server.js"; echo "second instance exit code: $?"
kill $FIRST_PID
```

Expected output includes:
```
Filip Kaartavond draait al. Browser wordt geopend...
second instance exit code: 0
```

- [ ] **Step 6: Commit**

```bash
git add windows-package/server.js
git commit -m "Add zero-dependency static server for offline Windows package"
```

---

### Task 2: Windows launcher scripts and Dutch instructions

**Files:**
- Create: `windows-package/Start Filip Kaartavond.bat`
- Create: `windows-package/Maak snelkoppeling.bat`
- Create: `windows-package/LEES MIJ.txt`

**Interfaces:**
- Consumes: assumes the final assembled folder layout from the design doc — `node\node.exe` and `app\server.js` sitting alongside these files (Task 3 assembles that layout; these files only reference relative paths, so they work unmodified once copied into the output folder).
- Produces: nothing consumed by later tasks besides being copied verbatim by `build.sh` in Task 3.

- [ ] **Step 1: Write `windows-package/Start Filip Kaartavond.bat`**

```bat
@echo off
cd /d "%~dp0"
node\node.exe app\server.js
pause
```

- [ ] **Step 2: Write `windows-package/Maak snelkoppeling.bat`**

```bat
@echo off
set "SCRIPT_DIR=%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -Command "$dir = $env:SCRIPT_DIR; $ws = New-Object -ComObject WScript.Shell; $shortcut = $ws.CreateShortcut((Join-Path ([Environment]::GetFolderPath('Desktop')) 'Filip Kaartavond.lnk')); $shortcut.TargetPath = Join-Path $dir 'Start Filip Kaartavond.bat'; $shortcut.WorkingDirectory = $dir; $shortcut.IconLocation = Join-Path $dir 'node\node.exe'; $shortcut.Save()"
echo Snelkoppeling aangemaakt op het bureaublad.
pause
```

- [ ] **Step 3: Write `windows-package/LEES MIJ.txt`**

```
FILIP KAARTAVOND — OFFLINE VERSIE
==================================

STARTEN
-------
Dubbelklik op "Start Filip Kaartavond.bat".
Er verschijnt een zwart venster en na een paar seconden opent je browser
vanzelf met de app.

STOPPEN
-------
Sluit het zwarte venster om de app te stoppen.

SNELKOPPELING OP BUREAUBLAD (optioneel, eenmalig)
--------------------------------------------------
Dubbelklik één keer op "Maak snelkoppeling.bat".
Er verschijnt daarna een icoon "Filip Kaartavond" op je bureaublad waarmee
je de app voortaan rechtstreeks kan starten.

WAARSCHUWING VAN WINDOWS ("SmartScreen")
-----------------------------------------
Omdat deze map niet uit de Microsoft Store komt, kan Windows de eerste keer
een waarschuwing tonen ("Windows heeft de pc beschermd" of gelijkaardig).
Klik op "Meer info" en daarna op "Toch uitvoeren" om verder te gaan.

JE GEGEVENS
------------
Alle gegevens (spelers, seizoenen, kaartavonden, scores) worden lokaal
bewaard in de browser die opent (meestal Microsoft Edge), gekoppeld aan
http://localhost:8000. Gebruik de app dus altijd via dezelfde snelkoppeling,
en wis geen browsergegevens voor deze site.

Maak regelmatig een back-up via het tabblad "Databeheer" in de app zelf
(exporteren/importeren), zeker voor je iets ingrijpends doet.

VERPLAATSEN
------------
Deze hele map mag je gerust verplaatsen (bv. naar een USB-stick of een
andere pc) — alles wat nodig is zit erin. Maak nadien wel opnieuw een
snelkoppeling met "Maak snelkoppeling.bat" als je die had gemaakt.
```

- [ ] **Step 4: Verify file contents were written exactly as specified**

Run:

```bash
grep -c "node.exe app\\\\server.js" "windows-package/Start Filip Kaartavond.bat"
grep -c "New-Object -ComObject WScript.Shell" "windows-package/Maak snelkoppeling.bat"
grep -c "SmartScreen" "windows-package/LEES MIJ.txt"
```

Expected: each command prints `1`.

Note: `.bat` files can only be double-click-tested on real Windows. That verification is out of scope here (see design doc) — keep these three files exactly as written above so the only untested surface is a handful of literal lines.

- [ ] **Step 5: Commit**

```bash
git add "windows-package/Start Filip Kaartavond.bat" "windows-package/Maak snelkoppeling.bat" "windows-package/LEES MIJ.txt"
git commit -m "Add Windows launcher scripts and Dutch end-user instructions"
```

---

### Task 3: Build script, `.gitignore`, and end-to-end verification

**Files:**
- Create: `windows-package/build.sh`
- Modify: `.gitignore`
- Modify: `README.md` (add a short "Windows-pakket bouwen" section)

**Interfaces:**
- Consumes: `client/dist` (via `npm run build` in `client/`, existing script — untouched), `windows-package/server.js` (Task 1), `windows-package/Start Filip Kaartavond.bat`, `windows-package/Maak snelkoppeling.bat`, `windows-package/LEES MIJ.txt` (Task 2).
- Produces: `FilipKaartavond/` folder and `FilipKaartavond.zip` at the repo root (both git-ignored build artifacts, not committed).

- [ ] **Step 1: Write `windows-package/build.sh`**

```bash
#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
CLIENT_DIR="$ROOT_DIR/client"
OUT_DIR="$ROOT_DIR/FilipKaartavond"
ZIP_PATH="$ROOT_DIR/FilipKaartavond.zip"
CACHE_DIR="$SCRIPT_DIR/.cache"

NODE_VERSION="${NODE_VERSION:-22.14.0}"
NODE_ZIP_NAME="node-v${NODE_VERSION}-win-x64.zip"
NODE_URL="https://nodejs.org/dist/v${NODE_VERSION}/${NODE_ZIP_NAME}"
NODE_ZIP_PATH="$CACHE_DIR/$NODE_ZIP_NAME"
NODE_EXE_ENTRY="node-v${NODE_VERSION}-win-x64/node.exe"

echo "==> Building client production bundle"
(cd "$CLIENT_DIR" && npm run build)

if [ ! -f "$CLIENT_DIR/dist/index.html" ]; then
  echo "Fout: client/dist/index.html niet gevonden na build." >&2
  exit 1
fi

echo "==> Assembling FilipKaartavond/"
rm -rf "$OUT_DIR"
mkdir -p "$OUT_DIR/app" "$OUT_DIR/node"
cp -R "$CLIENT_DIR/dist" "$OUT_DIR/app/dist"
cp "$SCRIPT_DIR/server.js" "$OUT_DIR/app/server.js"
cp "$SCRIPT_DIR/Start Filip Kaartavond.bat" "$OUT_DIR/"
cp "$SCRIPT_DIR/Maak snelkoppeling.bat" "$OUT_DIR/"
cp "$SCRIPT_DIR/LEES MIJ.txt" "$OUT_DIR/"

echo "==> Fetching portable Node.js ${NODE_VERSION} (Windows x64)"
mkdir -p "$CACHE_DIR"
if [ ! -f "$NODE_ZIP_PATH" ]; then
  curl -fL -o "$NODE_ZIP_PATH" "$NODE_URL"
fi
unzip -j -o "$NODE_ZIP_PATH" "$NODE_EXE_ENTRY" -d "$OUT_DIR/node" >/dev/null

if [ ! -f "$OUT_DIR/node/node.exe" ]; then
  echo "Fout: node.exe niet gevonden na uitpakken." >&2
  exit 1
fi

echo "==> Zipping package"
rm -f "$ZIP_PATH"
(cd "$ROOT_DIR" && zip -r -q "$ZIP_PATH" "$(basename "$OUT_DIR")")

echo "==> Done"
echo "Folder: $OUT_DIR"
echo "Zip:    $ZIP_PATH"
```

- [ ] **Step 2: Make it executable**

Run: `chmod +x windows-package/build.sh`

- [ ] **Step 3: Add build artifacts to `.gitignore`**

Modify `.gitignore` — current content is:

```
node_modules/
```

New content:

```
node_modules/

# Windows offline package build artifacts (regenerate with windows-package/build.sh)
/FilipKaartavond/
/FilipKaartavond.zip
/windows-package/.cache/
```

- [ ] **Step 4: Add a build section to `README.md`**

Add this section at the end of `README.md` (after the existing "## Specificaties" section):

```markdown

## Windows-pakket bouwen (offline, dummy-proof)

Om een dubbelklik-bare offline versie voor Windows 11 te maken (geen Node of
Python nodig op de doel-pc):

```bash
./windows-package/build.sh
```

Dit bouwt de client, bundelt een portable Node.js-runtime en zet alles klaar
in `FilipKaartavond/` (en `FilipKaartavond.zip`). Kopieer die map of zip naar
de Windows-pc — zie `windows-package/LEES MIJ.txt` voor de instructies die
in de map meegaan.
```

- [ ] **Step 5: Run the build end-to-end**

Run: `./windows-package/build.sh`

Expected: exits 0, prints `==> Done` followed by the `Folder:` and `Zip:` lines, no errors. First run downloads ~34MB to `windows-package/.cache/`; subsequent runs reuse the cache.

- [ ] **Step 6: Verify the assembled folder structure**

Run:

```bash
find FilipKaartavond -maxdepth 3 | sort
```

Expected output (order may vary slightly, but every line must be present):

```
FilipKaartavond
FilipKaartavond/LEES MIJ.txt
FilipKaartavond/Maak snelkoppeling.bat
FilipKaartavond/Start Filip Kaartavond.bat
FilipKaartavond/app
FilipKaartavond/app/dist
FilipKaartavond/app/dist/assets
FilipKaartavond/app/dist/favicon.ico
FilipKaartavond/app/dist/index.html
FilipKaartavond/app/server.js
FilipKaartavond/node
FilipKaartavond/node/node.exe
```

- [ ] **Step 7: Verify the assembled server actually serves the real build**

Run:

```bash
node FilipKaartavond/app/server.js & SERVER_PID=$!
sleep 0.5
curl -s http://127.0.0.1:8000/ | grep -o "<title>Slagen halen</title>"
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8000/spelers
kill $SERVER_PID
```

Expected output:
```
<title>Slagen halen</title>
200
```

- [ ] **Step 8: Verify the zip was created and contains the expected top-level entries**

Run: `unzip -l FilipKaartavond.zip | grep -E "Start Filip Kaartavond.bat|node.exe|server.js"`

Expected: three matching lines, one per filename.

- [ ] **Step 9: Confirm git status only shows the intended source files as new/changed**

Run: `git status --short`

Expected: shows only `windows-package/build.sh`, `.gitignore`, `README.md` as modified/new — `FilipKaartavond/`, `FilipKaartavond.zip`, and `windows-package/.cache/` must NOT appear (confirms `.gitignore` step worked).

- [ ] **Step 10: Commit**

```bash
git add windows-package/build.sh .gitignore README.md
git commit -m "Add build script for offline Windows package"
```

---

## Manual verification still needed on real Windows 11 (not automatable here)

- Double-clicking `Start Filip Kaartavond.bat` from a copied `FilipKaartavond/` folder actually opens the default browser to a working app.
- Double-clicking `Maak snelkoppeling.bat` actually creates a working Desktop shortcut.
- Whether Windows SmartScreen shows a warning, and that the `LEES MIJ.txt` instructions for it are accurate.
- Closing the console window actually stops `node.exe` (expected, since it runs in the foreground, but worth a real check).
