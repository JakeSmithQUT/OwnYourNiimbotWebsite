// HTML helpers for the build.

const ENTITIES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ENTITIES[c]);
}

export const escapeAttr = escapeHtml;

/** An id for a heading: lower case ASCII words joined by hyphens. */
export function slugify(text) {
  return (
    String(text)
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/×/g, 'x')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'section'
  );
}

const NAMED = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", nbsp: ' ', times: '×', rarr: '→', larr: '←' };

function decodeEntities(text) {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z0-9]+);/gi, (whole, name) => {
    if (NAMED[name] !== undefined) return NAMED[name];
    if (name[0] === '#') {
      const code = name[1] === 'x' || name[1] === 'X' ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : whole;
    }
    return whole;
  });
}

/**
 * Plain text of an HTML fragment for the search index, llms-full.txt and JSON-LD.
 * Headings become Markdown headings, list items start with "- " and table cells are separated by " | ".
 */
export function htmlToText(html) {
  return decodeEntities(
    String(html)
      .replace(/<(script|style|svg|button)[\s\S]*?<\/\1>/gi, '')
      .replace(/<h([1-6])[^>]*>/gi, (_m, n) => `\n\n${'#'.repeat(Number(n))} `)
      .replace(/<\/h[1-6]>/gi, '\n\n')
      .replace(/<li[^>]*>/gi, '\n- ')
      .replace(/<\/(td|th)>/gi, ' | ')
      .replace(/<tr[^>]*>/gi, '\n| ')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|section|ul|ol|table|figure|figcaption|pre|dl|dd|details|summary|blockquote)>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/[ \t]+/g, ' ')
      .replace(/ *\n */g, '\n')
      .replace(/\n{3,}/g, '\n\n'),
  );
}
