// Paste a link as its page title — the pure parts (no Obsidian/DOM), testable in node.

/** The pasted text if it's exactly one http(s) URL, else null. */
export function pastedUrl(text: string): string | null {
  const t = text.trim();
  if (!/^https?:\/\/[^\s<>"]+$/i.test(t)) return null;
  try {
    const u = new URL(t);
    return u.hostname ? t : null;
  } catch {
    return null;
  }
}

const NAMED: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "–", mdash: "—",
  hellip: "…", laquo: "«", raquo: "»", lsquo: "‘", rsquo: "’", ldquo: "“", rdquo: "”",
  middot: "·", bull: "•", copy: "©", reg: "®", trade: "™",
};

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const n = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : m;
    }
    return NAMED[e.toLowerCase()] ?? m;
  });
}

/**
 * The page's title from its HTML: og:title / twitter:title first (usually the
 * cleanest), then <title>. Whitespace collapsed, entities decoded. "" if none.
 */
export function extractTitle(html: string): string {
  const head = html.slice(0, 300_000);
  const meta = (prop: string) => {
    for (const tag of head.match(/<meta\b[^>]*>/gi) ?? []) {
      const key = /\b(?:property|name)\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1]?.toLowerCase();
      if (key !== prop) continue;
      const c = /\bcontent\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(tag);
      if (c) return c[1] ?? c[2] ?? "";
    }
    return "";
  };
  const raw = meta("og:title") || meta("twitter:title") || (/<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(head)?.[1] ?? "");
  return decodeEntities(raw).replace(/\s+/g, " ").trim();
}

/** `[title](url)` with the characters that would break the link escaped. */
export function markdownLink(title: string, url: string): string {
  const t = title.replace(/\\/g, "\\\\").replace(/([[\]])/g, "\\$1");
  // Percent-encode what would end the link early; the URL still opens the same page.
  const u = url.replace(/[ ()<>]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase());
  return `[${t}](${u})`;
}

/** Fallback label when the page gives no title: the host without "www.". */
export function hostLabel(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
