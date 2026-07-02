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
