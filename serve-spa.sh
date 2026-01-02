#!/bin/sh
set -eu

cd "$(dirname "$0")/client/dist"
python - <<'PY' &
import SimpleHTTPServer
import SocketServer
import os

PORT = 8000
ROOT = os.getcwd()
INDEX = os.path.join(ROOT, "index.html")

class SPAHandler(SimpleHTTPServer.SimpleHTTPRequestHandler):
  def do_GET(self):
    path = self.translate_path(self.path)
    if os.path.isdir(path):
      for index in ("index.html", "index.htm"):
        index_path = os.path.join(path, index)
        if os.path.exists(index_path):
          self.path = os.path.join(self.path, index)
          return SimpleHTTPServer.SimpleHTTPRequestHandler.do_GET(self)
    if os.path.exists(path):
      return SimpleHTTPServer.SimpleHTTPRequestHandler.do_GET(self)
    self.send_response(200)
    self.send_header("Content-type", "text/html")
    self.end_headers()
    with open(INDEX, "rb") as handle:
      self.wfile.write(handle.read())

  def do_HEAD(self):
    path = self.translate_path(self.path)
    if os.path.isdir(path):
      for index in ("index.html", "index.htm"):
        index_path = os.path.join(path, index)
        if os.path.exists(index_path):
          self.path = os.path.join(self.path, index)
          return SimpleHTTPServer.SimpleHTTPRequestHandler.do_HEAD(self)
    if os.path.exists(path):
      return SimpleHTTPServer.SimpleHTTPRequestHandler.do_HEAD(self)
    self.send_response(200)
    self.send_header("Content-type", "text/html")
    self.end_headers()

SocketServer.TCPServer.allow_reuse_address = True
httpd = SocketServer.TCPServer(("", PORT), SPAHandler)
print("Serving SPA on http://localhost:%d" % PORT)
httpd.serve_forever()
PY
SERVER_PID=$!

open -a "Google Chrome" http://localhost:8000

wait "$SERVER_PID"
