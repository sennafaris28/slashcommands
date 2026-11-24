// Paste a link as its page title, like Notion: paste a URL, then pick
// "Keep URL" or "Page title" (or set one of them as the default).

import { App, Editor, Menu, Notice, requestUrl } from "obsidian";
import type { EditorView } from "@codemirror/view";
import { inCodeBlock } from "./codelang";
import { extractTitle, markdownLink, pastedUrl } from "./pastelink";

export type PasteLinkMode = "ask" | "title" | "url";

const titleCache = new Map<string, string>();

/** Fetch the page and read its title. "" when the page has none or can't be loaded. */
async function fetchTitle(url: string): Promise<string> {
  const cached = titleCache.get(url);
  if (cached !== undefined) return cached;
  const req = requestUrl({ url, method: "GET", headers: { Accept: "text/html,application/xhtml+xml" }, throw: false });
  const timeout = new Promise<null>((r) => window.setTimeout(() => r(null), 10_000));
  let title = "";
  try {
    const res = await Promise.race([req, timeout]);
    const type = res?.headers?.["content-type"] ?? res?.headers?.["Content-Type"] ?? "";
    if (res && res.status < 400 && (!type || /html|xml/i.test(type))) title = extractTitle(res.text);
  } catch {
    title = "";
  }
  if (title) titleCache.set(url, title);
  return title;
}

/** Swap the pasted URL (at `from`, if it's still there) for `[title](url)`. */
async function toTitleLink(editor: Editor, from: number, url: string): Promise<void> {
  const notice = new Notice("Getting the page title…", 0);
  const title = await fetchTitle(url);
  notice.hide();
  if (!title) {
    new Notice("Couldn't get a title for that page, so the URL stays as it is.");
    return;
  }
  // The text may have moved while we waited; find the URL near where it was pasted.
  const doc = editor.getValue();
  let at = doc.substr(from, url.length) === url ? from : doc.indexOf(url, Math.max(0, from - 500));
  if (at < 0) return;
  // Don't touch it if it has since become part of a markdown link.
  if (doc.slice(Math.max(0, at - 2), at) === "](") return;
  editor.replaceRange(markdownLink(title, url), editor.offsetToPos(at), editor.offsetToPos(at + url.length));
}

/** Where the cursor is on screen, for the menu. */
function caretCoords(editor: Editor, offset: number): { x: number; y: number } | null {
  const cm = (editor as unknown as { cm?: EditorView }).cm;
  const r = cm?.coordsAtPos(offset);
  return r ? { x: r.left, y: r.bottom + 4 } : null;
}

/** Places where a pasted URL must stay exactly as typed. */
function shouldLeaveAlone(editor: Editor): boolean {
  if (editor.somethingSelected()) return true; // Obsidian turns a selection + URL into a link itself
  const cur = editor.getCursor();
  const lines: string[] = [];
  for (let i = 0; i <= cur.line; i++) lines.push(editor.getLine(i));
  if (inCodeBlock(lines, cur.line)) return true;
  // Frontmatter.
  if (lines[0] === "---") {
    const close = lines.findIndex((l, i) => i > 0 && (l === "---" || l === "..."));
    if (close === -1 || cur.line <= close) return true;
  }
  const before = lines[cur.line].slice(0, cur.ch);
  if ((before.match(/`/g) ?? []).length % 2 === 1) return true; // inline code
  if (/(\]\(|<|\[\[|\]:\s*)$/.test(before)) return true; // already writing a link by hand
  return false;
}

export function handlePaste(app: App, evt: ClipboardEvent, editor: Editor, mode: PasteLinkMode): void {
  if (mode === "url" || evt.defaultPrevented) return;
  const url = pastedUrl(evt.clipboardData?.getData("text/plain") ?? "");
  if (!url || shouldLeaveAlone(editor)) return;

  evt.preventDefault();
  const from = editor.posToOffset(editor.getCursor());
  editor.replaceSelection(url);

  if (mode === "title") {
    void toTitleLink(editor, from, url);
    return;
  }
  const at = caretCoords(editor, from + url.length);
  if (!at) return;
  const menu = new Menu();
  menu.addItem((i) => i.setTitle("Keep URL").setIcon("link").onClick(() => {}));
  menu.addItem((i) =>
    i.setTitle("Page title").setIcon("heading").onClick(() => void toTitleLink(editor, from, url))
  );
  menu.showAtPosition(at);
  // Like Notion: carry on typing and the menu gets out of the way (arrows/Enter/Esc still drive it).
  const onKey = (e: KeyboardEvent) => {
    if (["ArrowUp", "ArrowDown", "Enter", "Escape", "Tab"].includes(e.key)) return;
    menu.hide();
  };
  window.addEventListener("keydown", onKey, true);
  menu.onHide(() => window.removeEventListener("keydown", onKey, true));
}
