# OwnYourNiimbot website

Source of [ownyourniimbot.com](https://ownyourniimbot.com), the website of [OwnYourNiimbot](https://github.com/JakeSmithQUT/OwnYourNiimbot), the free label designer for NIIMBOT printers.

The site is static. A Node.js script with no npm dependencies builds it into `dist/`, and Cloudflare serves it as the static assets of a Worker with no script (`wrangler.jsonc`).

## Build

You need Node.js 22 or later.

```bash
node build.mjs          # gets the latest app release from GitHub, then builds dist/
node build.mjs --offline   # uses the release data that the last build saved in .cache/
node check.mjs          # checks links, anchors, images and the CSP rules in dist/
node serve.mjs          # serves dist/ on http://localhost:8788 with the headers from _headers
```

The build reads the latest release of the app repository through the GitHub API: the download files, their sizes, `SHA256SUMS.txt`, `docs/supported-printers.md` and `src/printer/labels.json` at the release tag. The download buttons link directly to the release files on GitHub.

## Layout

| Path | Contents |
|---|---|
| `content/` | Page sources: HTML fragments with a front matter block. The path sets the URL: `content/wiki/settings.html` is `/wiki/settings/` |
| `src/printer-page.html` | Template for the pages in `/printers/<model>/` |
| `src/site.mjs` | Site settings, navigation, wiki sections, download files and printer pages |
| `src/layout.mjs` | Head, header, wiki navigation and footer |
| `src/icons.mjs` | Icon shapes from Lucide (ISC licence), the icon set of the app |
| `assets/` | Style sheet, script and images. The build adds a hash to the names of the style sheet and the script |
| `static/` | Files copied to the root of the site: favicons |
| `build.mjs` | The build |
| `check.mjs` | Checks for the built site |
| `serve.mjs` | Local server for `dist/` |
| `wrangler.jsonc` | Cloudflare deployment settings |

## Page format

```html
---
title: Install on Windows
description: One or two sentences for search results, 50 to 160 characters.
section: Install and set up
order: 1
---
<p class="lead">First paragraph.</p>
<h2>Install the app</h2>
```

Front matter keys:

| Key | Use |
|---|---|
| `title` | Page title and h1 |
| `description` | Meta description, search index and `llms.txt` |
| `heading` | Optional h1 if it is different from the title |
| `titleTag` | Optional text for the `<title>` element |
| `section`, `order` | Wiki pages: the section in the side bar and the position in it |
| `nav` | Optional short title for the wiki side bar |
| `crumb` | Optional short name for the breadcrumb |
| `layout` | `home`, `page` or `wiki`. Pages under `content/wiki/` use `wiki` |
| `wide` | `true` for a full-width page |

The build adds ids to `h2` and `h3` headings, and the wiki layout lists the `h2` headings under "On this page".

## Macros

Write `{%name arguments%}` in a page. Data fields of the app, such as `{{Name}}`, are not macros and stay as they are.

| Macro | Result |
|---|---|
| `{%version%}`, `{%date%}` | Version and release date of the latest release |
| `{%release-url%}`, `{%releases-url%}`, `{%repo%}` | GitHub links |
| `{%dl windows-x64%}`, `{%file …%}`, `{%size …%}`, `{%sha …%}` | URL, file name, size and SHA-256 of a download. The ids are in `src/site.mjs` |
| `{%download-cards%}`, `{%hero-download%}` | Download sections |
| `{%printers-table%}`, `{%printers-other%}`, `{%printer-count%}`, `{%printer-links%}` | Printer data |
| `{%rolls B21%}` | Table of the rolls for a printer series |
| `{%figure name \| alt text \| caption \| options%}` | A screenshot from `assets/img/name.webp`. Options: `eager`, `narrow`, `medium` |
| `{%icon name%}` | An icon from `src/icons.mjs` |

## Screenshots

Screenshots are WebP files in `assets/img/`: `name.webp` at 1920 px wide and `name-960.webp` at 960 px wide. They show the app in the dark theme at 1440 × 854 CSS pixels and a scale of 4/3.

## Security

- The Content Security Policy in `_headers` allows scripts, styles, images and fonts from this site only, and Trusted Types blocks HTML string sinks. Pages have no inline scripts, inline styles or event handler attributes. `check.mjs` checks this.
- The site sets no cookies and loads nothing from other sites.
- The build accepts only release files with the expected names and URLs of the app repository.
- `/.well-known/security.txt` points to private security advisories on GitHub.

## Search engines and AI assistants

The build writes `sitemap.xml`, `robots.txt` (all crawlers allowed), `llms.txt` and `llms-full.txt` (all pages as plain text), JSON-LD structured data (SoftwareApplication, FAQPage, TechArticle, BreadcrumbList) and Open Graph tags. The workers.dev address is turned off, and every page has a canonical link to `https://ownyourniimbot.com`.

## Deploy

The `Deploy` workflow builds the site, checks it and deploys it to the Cloudflare Worker `ownyourniimbot` with `wrangler deploy`. The Worker serves `dist/` on `ownyourniimbot.com` and `www.ownyourniimbot.com`. Requests for static assets are free on the Cloudflare Workers Free plan. It runs on a push to `main`, by hand, and every 6 hours. The scheduled run deploys only when the app has a new release. It needs two repository secrets:

| Secret | Value |
|---|---|
| `CLOUDFLARE_API_TOKEN` | An API token with the permissions Account: Workers Scripts: Edit, and Zone: Workers Routes: Edit and DNS: Edit for ownyourniimbot.com |
| `CLOUDFLARE_ACCOUNT_ID` | The Cloudflare account ID |

Without the secrets, the workflow builds and checks the site but does not deploy it. GitHub turns off scheduled workflows in a repository that has had no activity for 60 days. Run the workflow by hand to turn it on again.

To deploy from a computer:

```bash
node build.mjs
npx wrangler deploy
```

## Licence

MIT. Refer to [LICENSE](LICENSE). The screenshots show the OwnYourNiimbot app. NIIMBOT is a trademark of its owner, and the site uses the name only to identify compatible printers.
