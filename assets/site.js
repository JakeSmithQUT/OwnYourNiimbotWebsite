// OwnYourNiimbot website. Every page works without this script. It adds:
// - the download button for the visitor's system on the home page,
// - copy buttons for checksums and commands,
// - a full-size view of screenshots,
// - the wiki search.
// The Content Security Policy blocks HTML string sinks (Trusted Types), so this
// script builds elements with the DOM API and sets text with textContent.

(() => {
  'use strict';

  const el = (tag, props = {}, children = []) => {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(props)) {
      if (key === 'text') node.textContent = value;
      else if (key === 'class') node.className = value;
      else node.setAttribute(key, value);
    }
    for (const child of children) node.append(child);
    return node;
  };

  // ------------------------------------------------------------ download button

  async function detectSystem() {
    const uaData = navigator.userAgentData;
    let platform = (uaData && uaData.platform) || navigator.platform || '';
    const ua = navigator.userAgent || '';
    let arch = '';
    if (uaData && uaData.getHighEntropyValues) {
      try {
        const v = await uaData.getHighEntropyValues(['architecture', 'bitness']);
        arch = v.architecture || '';
      } catch {
        // Some browsers refuse high entropy values. The x64 file is the default.
      }
    }
    platform = platform.toLowerCase();
    const lowerUa = ua.toLowerCase();
    if (/android|iphone|ipad|ipod/.test(lowerUa)) return { os: 'mobile' };
    if (platform.includes('win') || lowerUa.includes('windows')) return { os: 'windows', arm: arch === 'arm' || /arm64|aarch64/.test(lowerUa) };
    if (platform.includes('mac') || lowerUa.includes('mac os')) return { os: 'macos' };
    if (platform.includes('linux') || lowerUa.includes('linux') || lowerUa.includes('x11')) return { os: 'linux', arm: arch === 'arm' || /aarch64|arm64/.test(lowerUa) };
    return { os: '' };
  }

  async function setupDownloadButtons() {
    const boxes = document.querySelectorAll('[data-detect]');
    if (!boxes.length) return;
    const sys = await detectSystem();
    for (const box of boxes) {
      const main = box.querySelector('[data-dl-main]');
      const label = box.querySelector('[data-dl-label]');
      const alt = box.querySelector('[data-dl-alt]');
      const url = (id) => box.getAttribute(`data-dl-${id}`);
      const altLink = (text, href) => {
        alt.append(el('a', { href, text }), document.createTextNode('. '));
      };
      let id = '';
      let text = '';
      if (sys.os === 'windows') {
        id = sys.arm && url('windows-arm64') ? 'windows-arm64' : 'windows-x64';
        text = sys.arm ? 'Download for Windows on Arm' : 'Download for Windows';
        if (alt && url('windows-portable')) altLink('Portable version', url('windows-portable'));
      } else if (sys.os === 'macos') {
        // Browsers on a Mac do not report the processor type. Most Macs sold since 2021 have Apple silicon.
        id = 'macos-arm64';
        text = 'Download for Mac (Apple silicon)';
        if (alt && url('macos-x64')) altLink('Mac with an Intel processor', url('macos-x64'));
      } else if (sys.os === 'linux') {
        id = sys.arm && url('linux-arm64-appimage') ? 'linux-arm64-appimage' : 'linux-x64-appimage';
        text = 'Download for Linux (AppImage)';
        const deb = sys.arm ? 'linux-arm64-deb' : 'linux-x64-deb';
        if (alt && url(deb)) altLink('Debian and Ubuntu package', url(deb));
      } else if (sys.os === 'mobile') {
        text = 'Downloads for your computer';
      }
      if (id && url(id)) {
        main.setAttribute('href', url(id));
        main.setAttribute('download', '');
      }
      if (text) label.textContent = text;
    }
  }

  // ------------------------------------------------------------ copy buttons

  function setupCopy() {
    document.addEventListener('click', async (event) => {
      const button = event.target.closest('button.copy');
      if (!button) return;
      let text = button.getAttribute('data-copy');
      if (!text) {
        const pre = button.closest('pre');
        const code = pre && pre.querySelector('code');
        text = code ? code.textContent : '';
      }
      if (!text) return;
      try {
        await navigator.clipboard.writeText(text.trim());
        button.classList.add('done');
        const old = button.getAttribute('aria-label') || '';
        button.setAttribute('aria-label', 'Copied');
        setTimeout(() => {
          button.classList.remove('done');
          button.setAttribute('aria-label', old);
        }, 1600);
      } catch {
        // The clipboard is not available, for example on a page that is not secure.
      }
    });

    // Copy buttons for code blocks that hold a command.
    for (const pre of document.querySelectorAll('.prose pre')) {
      if (pre.querySelector('.copy')) continue;
      const button = el('button', { class: 'copy', type: 'button', 'aria-label': 'Copy the command' });
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('class', 'icon');
      svg.setAttribute('viewBox', '0 0 24 24');
      svg.setAttribute('fill', 'none');
      svg.setAttribute('stroke', 'currentColor');
      svg.setAttribute('stroke-width', '2');
      svg.setAttribute('stroke-linecap', 'round');
      svg.setAttribute('stroke-linejoin', 'round');
      svg.setAttribute('aria-hidden', 'true');
      const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      for (const [k, v] of Object.entries({ width: '14', height: '14', x: '8', y: '8', rx: '2', ry: '2' })) rect.setAttribute(k, v);
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', 'M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2');
      svg.append(rect, path);
      button.append(svg);
      pre.append(button);
    }
  }

  // ------------------------------------------------------------ screenshots

  function setupLightbox() {
    const links = document.querySelectorAll('a.zoom');
    if (!links.length || typeof HTMLDialogElement !== 'function') return;
    const img = el('img', { alt: '' });
    const caption = el('span');
    const close = el('button', { class: 'btn btn-small', type: 'button', text: 'Close' });
    const dialog = el('dialog', { class: 'lightbox', 'aria-label': 'Screenshot' }, [el('div', { class: 'lightbox-bar' }, [caption, close]), img]);
    document.body.append(dialog);
    close.addEventListener('click', () => dialog.close());
    dialog.addEventListener('click', (event) => {
      if (event.target === dialog) dialog.close();
    });
    dialog.addEventListener('close', () => img.removeAttribute('src'));
    for (const link of links) {
      link.addEventListener('click', (event) => {
        if (event.ctrlKey || event.metaKey || event.shiftKey || event.button !== 0) return;
        event.preventDefault();
        const text = link.getAttribute('data-caption') || '';
        img.setAttribute('src', link.getAttribute('href'));
        img.setAttribute('alt', text);
        caption.textContent = text;
        dialog.showModal();
        close.focus();
      });
    }
  }

  // ------------------------------------------------------------ wiki search

  function setupSearch() {
    const input = document.getElementById('wiki-search');
    const list = document.getElementById('wiki-results');
    if (!input || !list) return;
    let index = null;
    let loading = null;

    const load = () => {
      if (!loading) {
        loading = fetch('/search-index.json', { credentials: 'omit' })
          .then((r) => (r.ok ? r.json() : []))
          .then((data) => {
            index = Array.isArray(data) ? data : [];
          })
          .catch(() => {
            index = [];
          });
      }
      return loading;
    };

    const snippet = (text, words) => {
      const lower = text.toLowerCase();
      let at = -1;
      for (const w of words) {
        at = lower.indexOf(w);
        if (at >= 0) break;
      }
      if (at < 0) return text.slice(0, 140);
      const start = Math.max(0, at - 50);
      return `${start > 0 ? '…' : ''}${text.slice(start, start + 160).trim()}…`;
    };

    const render = () => {
      const q = input.value.trim().toLowerCase();
      list.replaceChildren();
      if (!q || !index) {
        list.hidden = true;
        return;
      }
      const words = q.split(/\s+/).filter(Boolean);
      const results = [];
      for (const item of index) {
        const title = String(item.t).toLowerCase();
        const body = `${String(item.d)} ${String(item.x)}`.toLowerCase();
        let score = 0;
        let all = true;
        for (const w of words) {
          if (title.includes(w)) score += 10;
          else if (body.includes(w)) score += 1;
          else all = false;
        }
        if (all) results.push({ item, score });
      }
      results.sort((a, b) => b.score - a.score);
      if (!results.length) {
        list.append(el('li', { class: 'r-none', text: 'No page has these words.' }));
      } else {
        for (const { item } of results.slice(0, 8)) {
          const href = String(item.u);
          if (!href.startsWith('/')) continue;
          list.append(el('li', {}, [el('a', { href }, [el('span', { class: 'r-title', text: String(item.t) }), el('span', { class: 'r-text', text: snippet(String(item.x), words) })])]));
        }
      }
      list.hidden = false;
    };

    input.addEventListener('focus', load, { once: true });
    input.addEventListener('input', () => {
      if (index) render();
      else load().then(render);
    });
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        input.value = '';
        render();
      } else if (event.key === 'Enter') {
        const first = list.querySelector('a');
        if (first) window.location.assign(first.getAttribute('href'));
      } else if (event.key === 'ArrowDown') {
        const first = list.querySelector('a');
        if (first) {
          event.preventDefault();
          first.focus();
        }
      }
    });
    list.addEventListener('keydown', (event) => {
      const links = [...list.querySelectorAll('a')];
      const i = links.indexOf(document.activeElement);
      if (event.key === 'ArrowDown' && i < links.length - 1) {
        event.preventDefault();
        links[i + 1].focus();
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        if (i > 0) links[i - 1].focus();
        else input.focus();
      } else if (event.key === 'Escape') {
        input.focus();
        input.value = '';
        render();
      }
    });
    document.addEventListener('click', (event) => {
      if (!event.target.closest('.wiki-search')) list.hidden = true;
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === '/' && document.activeElement === document.body) {
        event.preventDefault();
        input.focus();
      }
    });
  }

  setupDownloadButtons();
  setupCopy();
  setupLightbox();
  setupSearch();
})();
