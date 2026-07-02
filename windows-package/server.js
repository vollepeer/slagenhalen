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
  let decoded;
  try {
    decoded = decodeURIComponent(urlPath.split("?")[0].split("#")[0]);
  } catch (err) {
    return null;
  }
  if (decoded.indexOf("\0") !== -1) {
    return null;
  }
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
