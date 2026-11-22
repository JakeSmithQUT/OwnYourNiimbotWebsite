// Page layout: head, header, wiki navigation and footer.

import { escapeAttr, escapeHtml } from './html.mjs';
import { NAV, SITE } from './site.mjs';

function jsonLd(data) {
  // "<" is escaped so that the JSON cannot close the script element.
  return `<script type="application/ld+json">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>`;
}

function head({ page, jsonld, assets }) {
  const url = `${SITE.url}${page.url === '/404' ? '/' : page.url}`;
  const title = page.url === '/' ? page.meta.title : `${page.meta.titleTag ?? page.meta.title} | ${SITE.name}`;
  const desc = page.meta.description;
  const robots = page.url === '/404' ? '<meta name="robots" content="noindex">\n' : '';
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeAttr(desc)}">
${robots}<link rel="canonical" href="${escapeAttr(url)}">
<meta name="color-scheme" content="dark light">
<meta name="theme-color" content="#0f1115" media="(prefers-color-scheme: dark)">
<meta name="theme-color" content="#f4f5f7" media="(prefers-color-scheme: light)">
<meta name="author" content="${escapeAttr(SITE.author)}">
<meta property="og:type" content="${page.layout === 'wiki' || page.printer ? 'article' : 'website'}">
<meta property="og:site_name" content="${SITE.name}">
<meta property="og:title" content="${escapeAttr(page.meta.heading ?? page.meta.title)}">
<meta property="og:description" content="${escapeAttr(desc)}">
<meta property="og:url" content="${escapeAttr(url)}">
<meta property="og:image" content="${SITE.url}/assets/img/og-image.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="The OwnYourNiimbot label editor with a service record label">
<meta property="og:locale" content="en_AU">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="/favicon.ico" sizes="48x48">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="manifest" href="/site.webmanifest">
<link rel="alternate" type="text/plain" title="Text for AI assistants" href="/llms.txt">
<link rel="stylesheet" href="${assets.css}">
<script src="${assets.js}" defer></script>
${jsonLd(jsonld)}
</head>`;
}

function header({ page, icon }) {
  const items = NAV.map((n) => {
    const current = page.url.startsWith(n.href) || (n.href === '/printers/' && page.printer);
    return `<li><a href="${n.href}"${current ? ' aria-current="page"' : ''}>${n.label}</a></li>`;
  }).join('');
  return `<a class="skip" href="#main">Skip to the content</a>
<header class="site-header">
<div class="wrap header-row">
<a class="brand" href="/" aria-label="${SITE.name} home"><img src="/assets/img/logo-64.png" width="32" height="32" alt=""><span>${SITE.name}</span></a>
<nav class="site-nav" aria-label="Main"><ul>${items}<li><a class="ext" href="${SITE.repoUrl}" rel="noopener">GitHub${icon('external-link', 'icon icon-small')}</a></li></ul></nav>
<a class="btn btn-primary btn-small header-download" href="/download/">${icon('download')}<span>Download</span></a>
</div>
</header>`;
}

function breadcrumbs(crumbs) {
  if (crumbs.length < 2) return '';
  const items = crumbs
    .map((c, i) => (i === crumbs.length - 1 ? `<li aria-current="page">${escapeHtml(c.name)}</li>` : `<li><a href="${c.url}">${escapeHtml(c.name)}</a></li>`))
    .join('');
  return `<nav class="crumbs" aria-label="Breadcrumb"><ol>${items}</ol></nav>`;
}

function footer({ release, icon }) {
  const year = new Date().getUTCFullYear();
  return `<footer class="site-footer">
<div class="wrap footer-grid">
<div class="footer-about">
<a class="brand" href="/"><img src="/assets/img/logo-64.png" width="32" height="32" alt=""><span>${SITE.name}</span></a>
<p>Free label designer for NIIMBOT printers. Version ${escapeHtml(release.version)}, ${escapeHtml(release.date)}.</p>
<p><img class="badge" src="/assets/img/made-in-australia.svg" width="269" height="28" alt="Made with love in Australia"></p>
</div>
<nav aria-label="App"><h2>App</h2><ul>
<li><a href="/download/">Download</a></li>
<li><a href="/screenshots/">Screenshots</a></li>
<li><a href="/printers/">Supported printers</a></li>
<li><a href="/faq/">Questions and answers</a></li>
</ul></nav>
<nav aria-label="Wiki"><h2>Wiki</h2><ul>
<li><a href="/wiki/install-windows/">Install</a></li>
<li><a href="/wiki/connect-a-printer/">Connect a printer</a></li>
<li><a href="/wiki/batch-printing/">Batch printing</a></li>
<li><a href="/wiki/troubleshooting/">Troubleshooting</a></li>
</ul></nav>
<nav aria-label="Project"><h2>Project</h2><ul>
<li><a href="${SITE.repoUrl}" rel="noopener">Source code${icon('external-link', 'icon icon-small')}</a></li>
<li><a href="${SITE.repoUrl}/releases" rel="noopener">Release notes${icon('external-link', 'icon icon-small')}</a></li>
<li><a href="${SITE.repoUrl}/issues" rel="noopener">Report a problem${icon('external-link', 'icon icon-small')}</a></li>
<li><a href="/privacy/">Website privacy</a></li>
</ul></nav>
</div>
<div class="wrap footer-legal">
<p>OwnYourNiimbot is an independent project. NIIMBOT did not make, approve or support it. NIIMBOT is a trademark of its owner, and this site uses the name only to identify compatible printers.</p>
<p>© ${year} ${SITE.author}. The app is open source under the MIT licence. <a href="${SITE.websiteRepoUrl}" rel="noopener">Website source</a>.</p>
</div>
</footer>`;
}

function wikiSide(page, wikiNav) {
  const sections = wikiNav
    .map(
      (s) => `<li><span class="wiki-nav-section">${escapeHtml(s.section)}</span><ul>${s.pages
        .map((p) => `<li><a href="${p.url}"${p.url === page.url ? ' aria-current="page"' : ''}>${escapeHtml(p.title)}</a></li>`)
        .join('')}</ul></li>`,
    )
    .join('');
  return {
    search: `<div class="wiki-search" role="search">
<label class="sr-only" for="wiki-search">Search the wiki</label>
<input id="wiki-search" type="search" placeholder="Search the wiki" autocomplete="off" spellcheck="false" aria-controls="wiki-results">
<ol id="wiki-results" class="search-results" hidden></ol>
</div>`,
    nav: `<nav class="wiki-nav" aria-label="Wiki pages"><ul><li><a href="/wiki/"${page.url === '/wiki/' ? ' aria-current="page"' : ''}>Wiki home</a></li>${sections}</ul></nav>`,
  };
}

export function renderPage({ page, html, toc, crumbs, wikiNav, prev, next, jsonld, assets, icon, release, editUrl }) {
  const top = head({ page, jsonld, assets });
  const bar = header({ page, icon });
  const bottom = footer({ release, icon });
  const heading = page.meta.heading ?? page.meta.title;

  let main;
  if (page.layout === 'home') {
    main = `<main id="main">${html}</main>`;
  } else if (page.layout === 'wiki') {
    const side = wikiSide(page, wikiNav);
    const tocHtml = toc.length
      ? `<nav class="wiki-toc" aria-label="On this page"><h2>On this page</h2><ul>${toc.map((t) => `<li><a href="#${t.id}">${escapeHtml(t.text)}</a></li>`).join('')}</ul></nav>`
      : '<div class="wiki-toc"></div>';
    const pager =
      prev || next
        ? `<nav class="pager" aria-label="Previous and next page">${prev ? `<a class="pager-prev" href="${prev.url}"><span>Previous</span>${escapeHtml(prev.title)}</a>` : '<span></span>'}${next ? `<a class="pager-next" href="${next.url}"><span>Next</span>${escapeHtml(next.title)}</a>` : ''}</nav>`
        : '';
    main = `<div class="wrap wiki-layout">
${side.search}
<main id="main" class="wiki-main">
${breadcrumbs(crumbs)}
<article class="prose">
<h1>${escapeHtml(heading)}</h1>
${html}
</article>
${pager}
<p class="edit-link"><a href="${escapeAttr(editUrl)}" rel="noopener">Edit this page on GitHub${icon('external-link', 'icon icon-small')}</a></p>
</main>
${side.nav}
${tocHtml}
</div>`;
  } else {
    main = `<main id="main" class="wrap page${page.meta.wide ? ' page-wide' : ''}">
${breadcrumbs(crumbs)}
<article class="prose">
<h1>${escapeHtml(heading)}</h1>
${html}
</article>
</main>`;
  }

  return `${top}
<body class="layout-${page.layout}">
${bar}
${main}
${bottom}
</body>
</html>
`;
}
