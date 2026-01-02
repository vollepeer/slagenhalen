#!/bin/sh
set -eu

cd "$(dirname "$0")/client/dist"
python -m http.server 8000 &
SERVER_PID=$!

open -a "Google Chrome" http://localhost:8000

wait "$SERVER_PID"
