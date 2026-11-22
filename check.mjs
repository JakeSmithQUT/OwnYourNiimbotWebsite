#!/usr/bin/env node
// Checks the built site in dist/:
// - every internal link and image points to a file, and every #anchor exists,
// - no inline script, inline style or event handler attribute (the CSP blocks them),
// - every image has an alt attribute,
// - every page has a title, a description and a canonical link,
// - external links go to known hosts only.
// Usage: node check.mjs

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIST = fileURLToPath(new URL('./dist/', import.meta.url));
const EXTERNAL_HOSTS = new Set(['github.com', 'docs.github.com', 'www.cloudflare.com', 'opensource.org', 'lucide.dev']);

const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]));
const files = walk(DIST);
const pages = files.filter((f) => f.endsWith('.html'));
const redirects = new Set(
  readFileSync(join(DIST, '_redirects'), 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => l.split(' ')[0]),
);

const idsByUrl = new Map();
const urlOf = (file) => {
  const rel = relative(DIST, file).split(sep).join('/');
  return rel === 'index.html' ? '/' : `/${rel.replace(/index\.html$/, '')}`;
};
for (const file of pages) {
  const html = readFileSync(file, 'utf8');
  idsByUrl.set(urlOf(file), new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1])));
}

const problems = [];
const report = (file, text) => problems.push(`${relative(DIST, file)}: ${text}`);

function resolveInternal(path) {
  if (redirects.has(path.replace(/\/$/, '')) || redirects.has(path)) return true;
  const target = join(DIST, ...path.split('/').filter(Boolean));
  if (existsSync(target) && statSync(target).isFile()) return true;
  return existsSync(join(target, 'index.html'));
}

for (const file of pages) {
  const html = readFileSync(file, 'utf8');
  const pageUrl = urlOf(file);

  for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)) {
    const attrs = m[1];
    if (/type="application\/ld\+json"/.test(attrs)) {
      try {
        JSON.parse(m[2]);
      } catch {
        report(file, 'JSON-LD is not valid JSON');
      }
    } else if (!/\ssrc="/.test(attrs) || m[2].trim()) report(file, 'inline script');
  }
  if (/<style[\s>]/.test(html)) report(file, 'style element');
  if (/\sstyle="/.test(html)) report(file, 'style attribute');
  if (/\son[a-z]+="/i.test(html)) report(file, 'event handler attribute');
  for (const m of html.matchAll(/<img\b[^>]*>/g)) if (!/\salt="/.test(m[0])) report(file, `image without alt: ${m[0].slice(0, 80)}`);
  if (!/<title>[^<]+<\/title>/.test(html)) report(file, 'no title');
  if (!/<meta name="description" content="[^"]{50,}"/.test(html)) report(file, 'no description, or shorter than 50 characters');
  if (!/<link rel="canonical"/.test(html)) report(file, 'no canonical link');
  const h1 = html.match(/<h1[\s>]/g) ?? [];
  if (h1.length !== 1) report(file, `${h1.length} h1 elements`);

  for (const m of html.matchAll(/\s(?:href|src)="([^"]+)"/g)) {
    const link = m[1].replace(/&amp;/g, '&');
    if (link.startsWith('https://') || link.startsWith('http://')) {
      const url = new URL(link);
      if (url.protocol !== 'https:') report(file, `insecure link ${link}`);
      if (url.hostname === 'ownyourniimbot.com') continue;
      if (!EXTERNAL_HOSTS.has(url.hostname)) report(file, `unexpected external host ${url.hostname}`);
      continue;
    }
    if (link.startsWith('mailto:')) continue;
    if (link.startsWith('#')) {
      if (link.length > 1 && !idsByUrl.get(pageUrl)?.has(link.slice(1))) report(file, `missing anchor ${link}`);
      continue;
    }
    if (!link.startsWith('/')) {
      report(file, `relative link ${link}`);
      continue;
    }
    const [path, hash] = link.split('#');
    if (!resolveInternal(path)) report(file, `broken link ${link}`);
    else if (hash && idsByUrl.has(path) && !idsByUrl.get(path).has(hash)) report(file, `missing anchor ${link}`);
  }
}

for (const f of ['robots.txt', 'sitemap.xml', 'llms.txt', 'llms-full.txt', '_headers', '_redirects', 'search-index.json', '404.html', '.well-known/security.txt']) {
  if (!existsSync(join(DIST, f))) problems.push(`missing ${f}`);
}

if (problems.length) {
  console.error(problems.join('\n'));
  console.error(`\n${problems.length} problems`);
  process.exit(1);
}
console.log(`Checked ${pages.length} pages: no problems`);
