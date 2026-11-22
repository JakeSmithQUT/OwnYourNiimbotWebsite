#!/usr/bin/env node
// Builds the static website into dist/.
//
// Usage:
//   node build.mjs             gets the latest release from GitHub, then builds
//   node build.mjs --offline   uses the release data that the last online build saved in .cache/
//
// The build has no npm dependencies. Page sources are HTML fragments in content/
// with a front matter block. See README.md for the page format and the macros.

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ICONS } from './src/icons.mjs';
import { DOWNLOADS, LABEL_TYPES, OS_NAMES, PRINTER_PAGES, SITE, WIKI_SECTIONS } from './src/site.mjs';
import { renderPage } from './src/layout.mjs';
import { escapeAttr, escapeHtml, htmlToText, slugify } from './src/html.mjs';

const ROOT = dirname(fileURLToPath(import.meta.url));
const CONTENT = join(ROOT, 'content');
const DIST = join(ROOT, 'dist');
const CACHE = join(ROOT, '.cache');
const offline = process.argv.includes('--offline');

// ---------------------------------------------------------------- release data

const RELEASE_PREFIX = `https://github.com/${SITE.repo}/releases/download/`;

async function fetchText(url, accept = 'text/plain') {
  const headers = { accept, 'user-agent': 'ownyourniimbot-website-build' };
  // GITHUB_TOKEN raises the API rate limit in CI. It is sent to api.github.com only.
  if (process.env.GITHUB_TOKEN && new URL(url).hostname === 'api.github.com') headers.authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const res = await fetch(url, { headers, redirect: 'follow', signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.text();
}

/** Gets the latest release, its checksums, the printer table and the roll list at the release tag. */
async function loadRelease() {
  const cacheFile = join(CACHE, 'release.json');
  if (offline) {
    if (!existsSync(cacheFile)) throw new Error('No cached release data. Run the build once without --offline.');
    return JSON.parse(readFileSync(cacheFile, 'utf8'));
  }
  const rel = JSON.parse(await fetchText(`https://api.github.com/repos/${SITE.repo}/releases/latest`, 'application/vnd.github+json'));
  const tag = String(rel.tag_name);
  if (!/^v\d+\.\d+\.\d+$/.test(tag)) throw new Error(`Unexpected release tag ${tag}`);
  const assets = rel.assets.map((a) => ({ name: String(a.name), size: Number(a.size), url: String(a.browser_download_url) }));
  for (const a of assets) {
    if (!/^[A-Za-z0-9._-]+$/.test(a.name) || a.url !== `${RELEASE_PREFIX}${tag}/${a.name}`) throw new Error(`Unexpected release asset ${a.name} ${a.url}`);
  }
  const sha256 = {};
  const sums = assets.find((a) => a.name === 'SHA256SUMS.txt');
  if (sums) {
    for (const line of (await fetchText(sums.url)).split('\n')) {
      const m = /^([0-9a-f]{64}) [ *]?(\S+)$/.exec(line.trim());
      if (m) sha256[m[2]] = m[1];
    }
  }
  const raw = (path) => `https://raw.githubusercontent.com/${SITE.repo}/${tag}/${path}`;
  const data = {
    tag,
    version: tag.slice(1),
    published: String(rel.published_at),
    url: `${SITE.repoUrl}/releases/tag/${tag}`,
    assets,
    sha256,
    printersMd: await fetchText(raw('docs/supported-printers.md')),
    labels: JSON.parse(await fetchText(raw('src/printer/labels.json'))),
  };
  mkdirSync(CACHE, { recursive: true });
  writeFileSync(cacheFile, JSON.stringify(data, null, 1));
  return data;
}

const release = await loadRelease();

/** The download files of this release, with checksums. */
const downloads = DOWNLOADS.flatMap((d) => {
  const matches = release.assets.filter((a) => d.pattern.test(a.name));
  if (matches.length > 1) throw new Error(`More than one release file matches ${d.id}`);
  if (!matches.length) {
    if (d.required) throw new Error(`The release has no file for ${d.id}`);
    return [];
  }
  const a = matches[0];
  return [{ ...d, file: a.name, size: a.size, url: a.url, sha256: release.sha256[a.name] ?? '' }];
});
const download = (id) => {
  const d = downloads.find((x) => x.id === id);
  if (!d) throw new Error(`Unknown download ${id}`);
  return d;
};
const sumsFile = release.assets.find((a) => a.name === 'SHA256SUMS.txt');

// ---------------------------------------------------------------- printer data

/** Parses the Markdown tables of docs/supported-printers.md. */
function parsePrinterTables(md) {
  const tables = [];
  let current = null;
  for (const line of md.split('\n')) {
    if (line.startsWith('|')) {
      const cells = line.split('|').slice(1, -1).map((c) => c.trim());
      if (cells.every((c) => /^-+$/.test(c))) continue;
      if (!current) {
        current = { head: cells, rows: [] };
        tables.push(current);
      } else current.rows.push(cells);
    } else current = null;
  }
  const [supported, other] = tables;
  if (!supported || supported.head[0] !== 'Model' || supported.rows.length < 10) throw new Error('The printer table has an unexpected format');
  const toObj = (t) => t.rows.map((r) => Object.fromEntries(t.head.map((h, i) => [h, r[i] ?? ''])));
  return { supported: toObj(supported), other: other ? toObj(other) : [] };
}

const printers = parsePrinterTables(release.printersMd);
const printerByName = new Map(printers.supported.map((p) => [p.Model, p]));
for (const page of PRINTER_PAGES) {
  for (const m of page.models) if (!printerByName.has(m)) throw new Error(`Printer page ${page.slug}: model ${m} is not in the table`);
}

/** Rolls for a series name from labels.json. */
function rollsFor(series) {
  return release.labels.filter((r) => Array.isArray(r.series) && r.series.includes(series));
}

function rollName(r) {
  const n = (v) => String(Number(v));
  return `${n(r.widthMm)} × ${n(r.lengthMm)} mm`;
}

function rollTable(series) {
  const rolls = rollsFor(series);
  if (!rolls.length) return '';
  const rows = rolls
    .map((r) => {
      const notes = [r.note, r.shape === 'round' ? 'round' : '', r.tailMm ? `cable label, ${Number(r.tailMm)} mm tail` : ''].filter(Boolean).join(', ');
      return `<tr><td>${escapeHtml(rollName(r))}</td><td>${escapeHtml(LABEL_TYPES[r.type] ?? `Type ${Number(r.type)}`)}</td><td>${escapeHtml(notes)}</td></tr>`;
    })
    .join('');
  return `<div class="table-wrap"><table><thead><tr><th>Label size (width × length)</th><th>Label type</th><th>Notes</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

const MODEL_COLUMNS = ['Model', 'DPI', 'Print width', 'Density (default)', 'Label types', 'Command set'];

function modelTable(names, { link = false } = {}) {
  const slugOf = new Map(PRINTER_PAGES.flatMap((p) => p.models.map((m) => [m, p.slug])));
  const rows = names
    .map((name) => {
      const p = printerByName.get(name);
      const model = link && slugOf.has(name) ? `<a href="/printers/${slugOf.get(name)}/">${escapeHtml(name)}</a>` : escapeHtml(name);
      return `<tr id="model-${slugify(name)}"><td>${model}</td>${MODEL_COLUMNS.slice(1).map((c) => `<td>${escapeHtml(p[c])}</td>`).join('')}</tr>`;
    })
    .join('');
  return `<div class="table-wrap"><table class="models"><thead><tr>${MODEL_COLUMNS.map((c) => `<th>${c}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div>`;
}

function otherTable() {
  const rows = printers.other.map((p) => `<tr><td>${escapeHtml(p.Model)}</td><td>${escapeHtml(p['Command set'])}</td></tr>`).join('');
  return `<div class="table-wrap"><table><thead><tr><th>Model</th><th>Command set</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

// ---------------------------------------------------------------- formatting

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
/** 22 November 2026, in Australian Eastern Standard Time so the date matches the release notes. */
function longDate(iso) {
  const d = new Date(new Date(iso).getTime() + 10 * 3600 * 1000);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}
const mb = (bytes) => `${Math.round(bytes / 1024 / 1024)} MB`;
const icon = (name, cls = 'icon') => {
  if (!ICONS[name]) throw new Error(`Unknown icon ${name}`);
  return `<svg class="${cls}" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${ICONS[name]}</svg>`;
};

// ---------------------------------------------------------------- images

const IMG = join(ROOT, 'assets', 'img');
function imageSize(file) {
  const buf = readFileSync(file);
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') {
    const type = buf.toString('ascii', 12, 16);
    if (type === 'VP8X') return { w: 1 + buf.readUIntLE(24, 3), h: 1 + buf.readUIntLE(27, 3) };
    if (type === 'VP8 ') return { w: buf.readUInt16LE(26) & 0x3fff, h: buf.readUInt16LE(28) & 0x3fff };
    if (type === 'VP8L') {
      const b = buf.readUInt32LE(21);
      return { w: (b & 0x3fff) + 1, h: ((b >> 14) & 0x3fff) + 1 };
    }
  }
  if (buf.readUInt32BE(0) === 0x89504e47) return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
  throw new Error(`Unknown image format: ${file}`);
}

/** A screenshot with a 960 px version for small screens. Click opens the full size. */
function figure(name, alt, caption = '', { eager = false, cls = '' } = {}) {
  const full = join(IMG, `${name}.webp`);
  if (!existsSync(full)) throw new Error(`No image ${name}.webp`);
  const { w, h } = imageSize(full);
  const small = join(IMG, `${name}-960.webp`);
  const srcset = existsSync(small) ? ` srcset="/assets/img/${name}-960.webp 960w, /assets/img/${name}.webp ${w}w" sizes="(max-width: 1000px) 100vw, 1000px"` : '';
  const src = existsSync(small) ? `/assets/img/${name}-960.webp` : `/assets/img/${name}.webp`;
  const loading = eager ? ' fetchpriority="high"' : ' loading="lazy"';
  const img = `<img src="${src}"${srcset} width="${w}" height="${h}" alt="${escapeAttr(alt)}"${loading} decoding="async">`;
  const cap = caption ? `<figcaption>${caption}</figcaption>` : '';
  return `<figure class="shot${cls ? ` ${cls}` : ''}"><a class="zoom" href="/assets/img/${name}.webp" data-caption="${escapeAttr(alt)}">${img}</a>${cap}</figure>`;
}

// ---------------------------------------------------------------- download HTML

function downloadButton(d, cls = 'btn btn-primary') {
  return `<a class="${cls}" href="${escapeAttr(d.url)}" download>${icon('download')}<span>${escapeHtml(d.title)} <span class="arch">${escapeHtml(d.arch)}</span></span></a>`;
}

function downloadCards() {
  return ['windows', 'macos', 'linux']
    .map((os) => {
      const items = downloads.filter((d) => d.os === os);
      const osIcon = { windows: 'monitor', macos: 'laptop', linux: 'terminal' }[os];
      const list = items
        .map(
          (d) => `<li class="dl-item">
  <div class="dl-main">${downloadButton(d, d.required ? 'btn btn-primary' : 'btn')}<p class="dl-note">${escapeHtml(d.note)}</p></div>
  <dl class="dl-meta"><dt>File</dt><dd><code>${escapeHtml(d.file)}</code></dd><dt>Size</dt><dd>${mb(d.size)}</dd>${d.sha256 ? `<dt>SHA-256</dt><dd><code class="hash">${d.sha256}</code> <button class="copy" type="button" data-copy="${d.sha256}" aria-label="Copy the SHA-256 checksum">${icon('copy')}</button></dd>` : ''}</dl>
</li>`,
        )
        .join('\n');
      return `<section class="dl-os" id="${os}" aria-labelledby="${os}-title">
<h2 id="${os}-title">${icon(osIcon)} ${OS_NAMES[os]}</h2>
<ul class="dl-list">
${list}
</ul>
<p class="dl-help"><a href="/wiki/install-${os}/">Install on ${OS_NAMES[os]}</a></p>
</section>`;
    })
    .join('\n');
}

/** The hero button. site.js changes it to the file for the visitor's system. */
function heroDownload() {
  const attrs = downloads.map((d) => ` data-dl-${d.id}="${escapeAttr(d.url)}"`).join('');
  return `<div class="hero-download" data-detect${attrs}>
<a class="btn btn-primary btn-large" href="/download/" data-dl-main>${icon('download')}<span data-dl-label>Download</span></a>
<a class="btn btn-large" href="${SITE.repoUrl}" rel="noopener">${icon('code')}<span>Source on GitHub</span></a>
<p class="hero-meta">Version ${escapeHtml(release.version)}, released ${longDate(release.published)}. <span data-dl-alt></span><a href="/download/">All downloads</a></p>
</div>`;
}

// ---------------------------------------------------------------- macros

const MACROS = {
  version: () => escapeHtml(release.version),
  tag: () => escapeHtml(release.tag),
  date: () => longDate(release.published),
  'release-url': () => escapeAttr(release.url),
  'releases-url': () => `${SITE.repoUrl}/releases`,
  repo: () => SITE.repoUrl,
  dl: (id) => escapeAttr(download(id).url),
  file: (id) => escapeHtml(download(id).file),
  size: (id) => mb(download(id).size),
  sha: (id) => download(id).sha256,
  'sums-url': () => (sumsFile ? escapeAttr(sumsFile.url) : escapeAttr(release.url)),
  'download-cards': () => downloadCards(),
  'hero-download': () => heroDownload(),
  'printer-count': () => String(printers.supported.length),
  'other-count': () => String(printers.other.length),
  'printers-table': () => modelTable(printers.supported.map((p) => p.Model), { link: true }),
  'printers-other': () => otherTable(),
  'printer-links': () =>
    `<ul class="chips">${PRINTER_PAGES.map((p) => `<li><a class="chip" href="/printers/${p.slug}/">${escapeHtml(p.name)}</a></li>`).join('')}</ul>`,
  rolls: (series) => rollTable(series.trim()),
  icon: (name) => icon(name.trim()),
  figure: (args) => {
    const [name, alt, caption = '', opts = ''] = args.split('|').map((s) => s.trim());
    return figure(name, alt, caption, { eager: opts.includes('eager'), cls: opts.replace('eager', '').trim() });
  },
};

function expandMacros(text, where) {
  return text.replace(/\{%\s*([a-z-]+)(?:\s+([^%]*?))?\s*%\}/g, (_m, name, args = '') => {
    const fn = MACROS[name];
    if (!fn) throw new Error(`${where}: unknown macro ${name}`);
    return fn(args);
  });
}

// ---------------------------------------------------------------- pages

function parseFrontMatter(raw, file) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/.exec(raw);
  if (!m) throw new Error(`${file}: no front matter`);
  const meta = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = /^([a-zA-Z]+):\s*(.*)$/.exec(line);
    if (kv) meta[kv[1]] = kv[2].trim();
  }
  for (const key of ['title', 'description']) if (!meta[key]) throw new Error(`${file}: front matter needs ${key}`);
  return { meta, body: m[2] };
}

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : e.name.endsWith('.html') ? [join(dir, e.name)] : []));
}

function urlFor(file) {
  const rel = relative(CONTENT, file).split(sep).join('/').replace(/\.html$/, '');
  if (rel === 'index') return '/';
  if (rel === '404') return '/404';
  return `/${rel.replace(/\/index$/, '')}/`;
}

/** Git date of the last change to a file, or the build date. */
function lastModified(file) {
  try {
    const out = execFileSync('git', ['log', '-1', '--format=%cI', '--', file], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    if (out) return out.slice(0, 10);
  } catch {}
  return new Date().toISOString().slice(0, 10);
}

/** Adds ids to h2 and h3 headings and returns the h2 list for the page contents. */
function addHeadingIds(html) {
  const toc = [];
  const used = new Set();
  const out = html.replace(/<h([23])(\s[^>]*)?>([\s\S]*?)<\/h\1>/g, (whole, level, attrs = '', inner) => {
    let id = /\sid="([^"]+)"/.exec(attrs)?.[1];
    if (!id) {
      id = slugify(htmlToText(inner));
      let n = 2;
      while (used.has(id)) id = `${slugify(htmlToText(inner))}-${n++}`;
      attrs = `${attrs} id="${id}"`;
    }
    used.add(id);
    if (level === '2') toc.push({ id, text: htmlToText(inner).trim() });
    return `<h${level}${attrs}>${inner}</h${level}>`;
  });
  return { html: out, toc };
}

const pages = walk(CONTENT).map((file) => {
  const { meta, body } = parseFrontMatter(readFileSync(file, 'utf8'), file);
  // Front matter text can use simple macros such as {%version%}. The layout escapes it.
  for (const key of ['title', 'titleTag', 'heading', 'description']) if (meta[key]) meta[key] = htmlToText(expandMacros(meta[key], file)).trim();
  const url = urlFor(file);
  return { file, url, meta, body, layout: meta.layout ?? (url.startsWith('/wiki/') ? 'wiki' : 'page'), lastmod: lastModified(file) };
});

// Printer pages from the printer table and the roll list.
const printerTemplate = parseFrontMatter(readFileSync(join(ROOT, 'src', 'printer-page.html'), 'utf8'), 'src/printer-page.html');
for (const p of PRINTER_PAGES) {
  const first = printerByName.get(p.models[0]);
  const fill = (s) =>
    s
      .replaceAll('[name]', escapeHtml(p.name))
      .replaceAll('[models]', escapeHtml(p.models.length > 1 ? `${p.models.slice(0, -1).join(', ')} and ${p.models.at(-1)}` : p.models[0]))
      .replaceAll('[dpi]', escapeHtml(first.DPI))
      .replaceAll('[width]', escapeHtml(first['Print width']))
      .replaceAll('[commandset]', escapeHtml(first['Command set']));
  const rollSections = p.rolls
    .map((series) => {
      const table = rollTable(series);
      if (!table) return '';
      const title = series === 'B18 & N1' ? 'Rolls for the B18 and N1' : `Rolls for the ${series}`;
      return `<h3>${escapeHtml(title)}</h3>\n${table}`;
    })
    .join('\n');
  const body = fill(printerTemplate.body).replace('[model-table]', modelTable(p.models)).replace('[roll-tables]', rollSections || '<p>The app has no roll list for this model. Select the label size in the design view, or enter the width and height.</p>');
  pages.push({
    file: join(ROOT, 'src', 'printer-page.html'),
    url: `/printers/${p.slug}/`,
    meta: { ...printerTemplate.meta, title: fill(printerTemplate.meta.title), description: fill(printerTemplate.meta.description), crumb: `NIIMBOT ${p.name}`, heading: fill(printerTemplate.meta.heading) },
    body,
    layout: 'page',
    printer: p,
    lastmod: release.published.slice(0, 10),
  });
}

// Wiki navigation: sections in order, pages by their order number.
const wikiPages = pages
  .filter((p) => p.layout === 'wiki' && p.url !== '/wiki/')
  .sort((a, b) => WIKI_SECTIONS.indexOf(a.meta.section) - WIKI_SECTIONS.indexOf(b.meta.section) || Number(a.meta.order) - Number(b.meta.order));
for (const p of wikiPages) if (!WIKI_SECTIONS.includes(p.meta.section)) throw new Error(`${p.file}: unknown wiki section ${p.meta.section}`);
const wikiNav = WIKI_SECTIONS.map((section) => ({ section, pages: wikiPages.filter((p) => p.meta.section === section).map((p) => ({ url: p.url, title: p.meta.nav ?? p.meta.title })) }));

MACROS['wiki-index'] = () =>
  wikiNav
    .map(
      (s) => `<section class="wiki-index-section"><h2>${escapeHtml(s.section)}</h2><ul class="wiki-index-list">${s.pages
        .map((p) => {
          const page = pages.find((x) => x.url === p.url);
          return `<li><a href="${p.url}">${escapeHtml(page.meta.title)}<span>${escapeHtml(page.meta.description)}</span></a></li>`;
        })
        .join('')}</ul></section>`,
    )
    .join('\n');

// ---------------------------------------------------------------- assets

rmSync(DIST, { recursive: true, force: true });
mkdirSync(join(DIST, 'assets', 'h'), { recursive: true });

function hashedAsset(name) {
  const src = readFileSync(join(ROOT, 'assets', name));
  const hash = createHash('sha256').update(src).digest('hex').slice(0, 10);
  const [base, ext] = name.split('.');
  const out = `/assets/h/${base}.${hash}.${ext}`;
  writeFileSync(join(DIST, out), src);
  return out;
}
const assets = { css: hashedAsset('site.css'), js: hashedAsset('site.js') };
cpSync(IMG, join(DIST, 'assets', 'img'), { recursive: true });
cpSync(join(ROOT, 'static'), DIST, { recursive: true });

// ---------------------------------------------------------------- JSON-LD

const softwareLd = {
  '@type': 'SoftwareApplication',
  '@id': `${SITE.url}/#software`,
  name: SITE.name,
  description: SITE.description,
  url: `${SITE.url}/`,
  applicationCategory: 'DesignApplication',
  operatingSystem: 'Windows 10, Windows 11, macOS, Linux',
  softwareVersion: release.version,
  datePublished: release.published.slice(0, 10),
  releaseNotes: release.url,
  downloadUrl: `${SITE.url}/download/`,
  installUrl: download('windows-x64').url,
  license: 'https://opensource.org/license/mit',
  isAccessibleForFree: true,
  offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
  author: { '@type': 'Person', name: SITE.author, url: 'https://github.com/JakeSmithQUT' },
  codeRepository: SITE.repoUrl,
  screenshot: ['editor', 'templates', 'data'].map((n) => `${SITE.url}/assets/img/${n}.webp`),
  featureList: [
    'Label editor with text, barcodes, QR codes, Data Matrix, PDF417, Aztec, images, shapes, tables and 571 symbols',
    'Template library with 529 designs',
    'Batch printing from Excel, CSV and TSV files',
    'Serial numbers and calculated dates',
    'Automatic label size detection',
    'Print preview at printer resolution',
    'Bluetooth and USB connection',
    'Interface in 22 languages',
    'Local MCP server for AI assistants',
  ],
};
const websiteLd = { '@type': 'WebSite', '@id': `${SITE.url}/#website`, name: SITE.name, url: `${SITE.url}/`, inLanguage: 'en' };

function breadcrumbsLd(crumbs) {
  return { '@type': 'BreadcrumbList', itemListElement: crumbs.map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.name, item: `${SITE.url}${c.url}` })) };
}

/** Question and answer pairs from the FAQ page markup. */
function faqLd(html) {
  const items = [...html.matchAll(/<section class="faq-item"[^>]*>\s*<h2[^>]*>([\s\S]*?)<\/h2>([\s\S]*?)<\/section>/g)];
  return { '@type': 'FAQPage', mainEntity: items.map((m) => ({ '@type': 'Question', name: htmlToText(m[1]).trim(), acceptedAnswer: { '@type': 'Answer', text: htmlToText(m[2]).trim() } })) };
}

// ---------------------------------------------------------------- render

const searchIndex = [];
const llmsEntries = [];
const fullText = [];

for (const page of pages) {
  const where = relative(ROOT, page.file);
  const expanded = expandMacros(page.body, where);
  const { html, toc } = addHeadingIds(expanded);
  const isWiki = page.layout === 'wiki';
  const crumbs = [{ name: 'Home', url: '/' }];
  if (isWiki && page.url !== '/wiki/') crumbs.push({ name: 'Wiki', url: '/wiki/' });
  if (page.printer) crumbs.push({ name: 'Printers', url: '/printers/' });
  if (page.url !== '/') crumbs.push({ name: page.meta.crumb ?? page.meta.nav ?? page.meta.title, url: page.url });

  const graph = [websiteLd];
  if (page.url === '/' || page.url === '/download/') graph.push(softwareLd);
  if (page.url !== '/' && page.url !== '/404') graph.push(breadcrumbsLd(crumbs));
  if (page.url === '/faq/') graph.push(faqLd(html));
  if (isWiki || page.printer) {
    graph.push({
      '@type': 'TechArticle',
      headline: page.meta.heading ?? page.meta.title,
      description: page.meta.description,
      url: `${SITE.url}${page.url}`,
      dateModified: page.lastmod,
      inLanguage: 'en',
      author: { '@type': 'Person', name: SITE.author },
      about: { '@id': `${SITE.url}/#software` },
    });
  }

  let prev;
  let next;
  if (isWiki && page.url !== '/wiki/') {
    const i = wikiPages.indexOf(page);
    prev = wikiPages[i - 1];
    next = wikiPages[i + 1];
  }

  const out = renderPage({
    page,
    html,
    toc: isWiki && page.url !== '/wiki/' && toc.length > 1 ? toc : [],
    crumbs,
    wikiNav: isWiki ? wikiNav : null,
    prev: prev && { url: prev.url, title: prev.meta.nav ?? prev.meta.title },
    next: next && { url: next.url, title: next.meta.nav ?? next.meta.title },
    jsonld: { '@context': 'https://schema.org', '@graph': graph },
    assets,
    icon,
    release: { version: release.version, date: longDate(release.published), url: release.url },
    editUrl: page.printer ? `${SITE.websiteRepoUrl}/blob/main/src/printer-page.html` : `${SITE.websiteRepoUrl}/blob/main/${relative(ROOT, page.file).split(sep).join('/')}`,
  });

  const outFile = page.url === '/404' ? join(DIST, '404.html') : join(DIST, ...page.url.split('/').filter(Boolean), 'index.html');
  mkdirSync(dirname(outFile), { recursive: true });
  writeFileSync(outFile, out);

  if (page.url === '/404') continue;
  const text = htmlToText(html);
  if (isWiki || page.printer || page.url === '/faq/' || page.url === '/download/') {
    searchIndex.push({ t: page.meta.heading ?? page.meta.title, u: page.url, s: page.meta.section ?? (page.printer ? 'Printers' : ''), d: page.meta.description, x: text.replace(/^#+ /gm, '').replace(/\s*\|\s*/g, ' ').replace(/^- /gm, '').replace(/\s+/g, ' ').trim().slice(0, 6000) });
  }
  llmsEntries.push({ url: page.url, title: page.meta.heading ?? page.meta.title, description: page.meta.description, group: page.printer ? 'Printers' : isWiki ? 'Wiki' : 'Pages' });
  fullText.push(`# ${page.meta.heading ?? page.meta.title}\n\nURL: ${SITE.url}${page.url}\n\n${text.trim()}\n`);
}

// ---------------------------------------------------------------- generated files

const pageUrls = pages.filter((p) => p.url !== '/404');
writeFileSync(
  join(DIST, 'sitemap.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${pageUrls.map((p) => `  <url><loc>${SITE.url}${p.url}</loc><lastmod>${p.lastmod}</lastmod></url>`).join('\n')}
</urlset>
`,
);

writeFileSync(
  join(DIST, 'robots.txt'),
  `# Search engines and AI assistants may read and index every page.
User-agent: *
Allow: /

Sitemap: ${SITE.url}/sitemap.xml
`,
);

const llmsGroups = ['Pages', 'Wiki', 'Printers'];
writeFileSync(
  join(DIST, 'llms.txt'),
  `# ${SITE.name}

> ${SITE.name} is a free, open-source (MIT) desktop app that designs and prints labels on NIIMBOT label printers from Windows, macOS and Linux. It connects to the printer over Bluetooth or a USB cable and needs no account, no cloud service and no internet connection. It supports ${printers.supported.length} NIIMBOT models, including the D11, D110, D101, H1S, B1, B18, B21, B3S, B31, K3, M2 and M3. It is an independent project and is not made by NIIMBOT.

The latest version is ${release.version}, released ${longDate(release.published)}. Downloads: ${SITE.url}/download/. Source code: ${SITE.repoUrl}.

${llmsGroups
  .map(
    (g) => `## ${g}

${llmsEntries
  .filter((e) => e.group === g)
  .map((e) => `- [${e.title}](${SITE.url}${e.url}): ${e.description}`)
  .join('\n')}`,
  )
  .join('\n\n')}

## Optional

- [Full text of this website](${SITE.url}/llms-full.txt): every page as plain text in one file.
`,
);
writeFileSync(join(DIST, 'llms-full.txt'), `${fullText.join('\n---\n\n')}`);
writeFileSync(join(DIST, 'search-index.json'), JSON.stringify(searchIndex));
writeFileSync(join(DIST, 'version.json'), `${JSON.stringify({ version: release.version, tag: release.tag, published: release.published })}\n`);

writeFileSync(
  join(DIST, 'site.webmanifest'),
  `${JSON.stringify(
    {
      name: SITE.name,
      short_name: SITE.name,
      description: 'Label designer for NIIMBOT printers',
      start_url: '/',
      display: 'browser',
      background_color: '#0f1115',
      theme_color: '#0f1115',
      icons: [
        { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
        { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
      ],
    },
    null,
    2,
  )}\n`,
);

// Short links: /dl/<id> goes to the file of the latest release.
writeFileSync(
  join(DIST, '_redirects'),
  `${[
    ...downloads.map((d) => `/dl/${d.id} ${d.url} 302`),
    `/dl/windows ${download('windows-x64').url} 302`,
    `/dl/macos ${download('macos-arm64').url} 302`,
    `/dl/linux ${download('linux-x64-appimage').url} 302`,
    `/github ${SITE.repoUrl} 302`,
    `/releases ${SITE.repoUrl}/releases 302`,
    `/wiki/supported-printers /printers/ 301`,
    `/wiki/supported-printers/ /printers/ 301`,
  ].join('\n')}\n`,
);

// Security headers for every response. Cloudflare reads this file with the static assets.
const CSP = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self'",
  "font-src 'self'",
  "connect-src 'self'",
  "manifest-src 'self'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
  "require-trusted-types-for 'script'",
  "trusted-types 'none'",
  'upgrade-insecure-requests',
].join('; ');
writeFileSync(
  join(DIST, '_headers'),
  `/*
  Content-Security-Policy: ${CSP}
  Strict-Transport-Security: max-age=31536000; includeSubDomains
  X-Content-Type-Options: nosniff
  X-Frame-Options: DENY
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: accelerometer=(), autoplay=(), bluetooth=(), browsing-topics=(), camera=(), display-capture=(), geolocation=(), gyroscope=(), hid=(), magnetometer=(), microphone=(), midi=(), payment=(), serial=(), usb=()
  Cross-Origin-Opener-Policy: same-origin
  Cross-Origin-Resource-Policy: same-origin
  X-Permitted-Cross-Domain-Policies: none

/assets/h/*
  Cache-Control: public, max-age=31536000, immutable

/assets/img/*
  Cache-Control: public, max-age=86400

/llms.txt
  Content-Type: text/plain; charset=utf-8

/llms-full.txt
  Content-Type: text/plain; charset=utf-8
`,
);

mkdirSync(join(DIST, '.well-known'), { recursive: true });
const expires = new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString().slice(0, 10);
writeFileSync(
  join(DIST, '.well-known', 'security.txt'),
  `Contact: ${SITE.repoUrl}/security/advisories/new
Expires: ${expires}T00:00:00.000Z
Preferred-Languages: en
Canonical: ${SITE.url}/.well-known/security.txt
`,
);

console.log(`Built ${pages.length} pages for version ${release.version} into dist/`);
