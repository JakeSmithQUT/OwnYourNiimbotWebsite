#!/usr/bin/env node
// Serves dist/ on http://localhost:8788 for a local check of the built site.
// It applies the headers from dist/_headers for "/*", so that the Content
// Security Policy is the same as on Cloudflare, and it follows the Cloudflare
// static asset rules for folders, index.html and 404.html.
// Usage: node serve.mjs [port]

import { createServer } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIST = resolve(fileURLToPath(new URL('.', import.meta.url)), 'dist');
const PORT = Number(process.argv[2] ?? 8788);
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml',
};

/** Headers of the "/*" block in _headers. */
function globalHeaders() {
  const file = join(DIST, '_headers');
  if (!existsSync(file)) return {};
  const headers = {};
  let inBlock = false;
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    if (!line.startsWith(' ')) inBlock = line.trim() === '/*';
    else if (inBlock) {
      const i = line.indexOf(':');
      const name = line.slice(0, i).trim();
      // HSTS and upgrade-insecure-requests do not apply to http://localhost.
      if (name === 'Strict-Transport-Security') continue;
      headers[name] = line.slice(i + 1).trim().replace('; upgrade-insecure-requests', '');
    }
  }
  return headers;
}

createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  let path = decodeURIComponent(url.pathname);
  const file = normalize(join(DIST, path));
  if (!file.startsWith(DIST + sep) && file !== DIST) {
    res.writeHead(400).end();
    return;
  }
  let target = file;
  if (existsSync(target) && statSync(target).isDirectory()) {
    if (!path.endsWith('/')) {
      res.writeHead(308, { location: `${path}/` }).end();
      return;
    }
    target = join(target, 'index.html');
  } else if (!existsSync(target) && existsSync(join(file, 'index.html'))) {
    res.writeHead(308, { location: `${path}/` }).end();
    return;
  }
  let status = 200;
  if (!existsSync(target) || statSync(target).isDirectory()) {
    status = 404;
    target = join(DIST, '404.html');
  }
  res.writeHead(status, { ...globalHeaders(), 'content-type': TYPES[extname(target)] ?? 'application/octet-stream', 'cache-control': 'no-store' });
  res.end(readFileSync(target));
}).listen(PORT, '127.0.0.1', () => console.log(`Serving dist/ on http://localhost:${PORT}`));
