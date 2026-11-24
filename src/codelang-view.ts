// Code block language picker — the editor side: a "Python ▾" chip on each
// code block's opening line; picking a language rewrites the fence
// (``` → ```python), which is what drives Obsidian's syntax highlighting.

import { RangeSetBuilder } from "@codemirror/state";
import { Decoration, DecorationSet, EditorView, ViewPlugin, ViewUpdate, WidgetType } from "@codemirror/view";
import { App, Scope, setIcon } from "obsidian";
import { blockBody, Fence, fenceLine, filterLanguages, findFences, isClosed, languageLabel } from "./codelang";
import { detectLanguage } from "./codelang-detect";

/** The block's opening fence, re-read at click time (the doc may have changed since render). */
function fenceAt(view: EditorView, line: number): Fence | null {
  const doc = view.state.doc;
  if (line + 1 > doc.lines) return null;
  const lines: string[] = [];
  for (let i = 1; i <= line + 1; i++) lines.push(doc.line(i).text);
  return findFences(lines).find((f) => f.line === line) ?? null;
}

let autoDetectOn: () => boolean = () => false;

function setLanguage(view: EditorView, line: number, lang: string): void {
  const f = fenceAt(view, line);
  if (!f) return;
  // With auto-detect on, "Plain text" is written as `text` so it sticks:
  // a bare ``` block would get a language guessed again.
  if (!lang && autoDetectOn()) lang = "text";
  const l = view.state.doc.line(line + 1);
  const text = fenceLine(f, lang);
  if (text !== l.text) view.dispatch({ changes: { from: l.from, to: l.to, insert: text }, userEvent: "input.sc-lang" });
}

// ---------- the dropdown ----------

let openPicker: (() => void) | null = null;
let pluginApp: App | null = null;

function showPicker(view: EditorView, anchor: HTMLElement, line: number, current: string): void {
  openPicker?.();
  const doc = anchor.ownerDocument;
  const win = doc.defaultView ?? window;
  // Inside a modal (e.g. a NoteBoard card), live in the modal: Obsidian pulls
  // focus back into an open modal, so a popover on <body> couldn't be typed in.
  const host = anchor.closest<HTMLElement>(".modal") ?? doc.body;
  const pop = host.createDiv({ cls: "sc-lang-pop" });
  const input = pop.createEl("input", { cls: "sc-lang-search", attr: { type: "text", placeholder: "Search for a language…" } });
  const list = pop.createDiv({ cls: "sc-lang-list" });
  let items: { id: string; label: string }[] = [];
  let active = 0;
  let closed = false;
  const detected = current ? "" : detectedFor(view, line);

  // Own the keyboard while open: Esc must close just this list, not the
  // modal (e.g. a NoteBoard card) the code block sits in.
  const scope = pluginApp ? new Scope(pluginApp.scope) : null;
  scope?.register([], "Escape", () => { close(); view.focus(); return false; });

  const close = () => {
    if (closed) return;
    closed = true;
    if (scope) pluginApp?.keymap.popScope(scope);
    pop.remove();
    doc.removeEventListener("mousedown", onOutside, true);
    win.removeEventListener("resize", close);
    view.scrollDOM.removeEventListener("scroll", close);
    if (openPicker === close) openPicker = null;
  };
  const choose = (id: string) => {
    close();
    setLanguage(view, line, id);
    view.focus();
  };
  const render = () => {
    const q = input.value.trim();
    items = filterLanguages(q).map((l) => ({ id: l.id, label: l.label }));
    if (!q && detected) items.unshift({ id: detected, label: `${languageLabel(detected)} (detected)` });
    // Let people use any language Obsidian knows, not just the list.
    const known = items.some((i) => i.id === q.toLowerCase()) || languageLabel(q) !== q;
    if (q && /^[\w#+.-]+$/.test(q) && !known) {
      items.push({ id: q.toLowerCase(), label: `Use “${q}”` });
    }
    active = Math.max(0, Math.min(active, items.length - 1));
    list.empty();
    if (!items.length) list.createDiv({ cls: "sc-lang-empty", text: "No language matches" });
    items.forEach((it, i) => {
      const row = list.createDiv({ cls: "sc-lang-item", text: it.label });
      if (i === active) row.addClass("is-active");
      if (it.id === current.toLowerCase() || languageLabel(current) === it.label) {
        setIcon(row.createSpan({ cls: "sc-lang-check" }), "check");
      }
      row.addEventListener("mousedown", (e) => e.preventDefault()); // keep focus in the search box
      row.addEventListener("click", () => choose(it.id));
      row.addEventListener("mousemove", () => {
        if (active === i) return;
        list.children[active]?.removeClass("is-active");
        active = i;
        row.addClass("is-active");
      });
    });
  };
  const move = (d: number) => {
    if (!items.length) return;
    active = (active + d + items.length) % items.length;
    render();
    (list.children[active] as HTMLElement | undefined)?.scrollIntoView({ block: "nearest" });
  };
  input.addEventListener("input", () => { active = 0; render(); });
  input.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); move(1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); move(-1); }
    else if (e.key === "Enter") { e.preventDefault(); if (items[active]) choose(items[active].id); }
    else if (e.key === "Escape") { e.preventDefault(); close(); view.focus(); }
    e.stopPropagation();
  });
  const onOutside = (e: MouseEvent) => {
    if (!pop.contains(e.target as Node) && !anchor.contains(e.target as Node)) close();
  };

  // Start on the detected language if there is one, else the block's current one.
  render();
  const cur = detected ? 0 : items.findIndex((i) => i.id === current.toLowerCase() || i.label === languageLabel(current));
  if (cur >= 0) { active = cur; render(); }

  // Place under the chip, flipped above it if there's no room below.
  const r = anchor.getBoundingClientRect();
  const h = Math.min(320, pop.offsetHeight || 320);
  const below = r.bottom + 4 + h <= win.innerHeight || r.top < h + 8;
  pop.style.left = `${Math.max(8, Math.min(r.left, win.innerWidth - pop.offsetWidth - 8))}px`;
  pop.style.top = below ? `${r.bottom + 4}px` : `${r.top - 4 - h}px`;
  (list.children[active] as HTMLElement | undefined)?.scrollIntoView({ block: "nearest" });

  doc.addEventListener("mousedown", onOutside, true);
  win.addEventListener("resize", close);
  view.scrollDOM.addEventListener("scroll", close);
  openPicker = close;
  if (scope) pluginApp?.keymap.pushScope(scope);
  input.focus();
}

// ---------- the chip ----------

class LangChip extends WidgetType {
  constructor(readonly lang: string) {
    super();
  }
  eq(other: LangChip): boolean {
    return other.lang === this.lang;
  }
  toDOM(view: EditorView): HTMLElement {
    const el = createSpan({ cls: "sc-lang-chip", attr: { "aria-label": "Code block language" } });
    el.setAttr("contenteditable", "false");
    el.createSpan({ cls: "sc-lang-name", text: this.lang ? languageLabel(this.lang) : "Plain text" });
    setIcon(el.createSpan({ cls: "sc-lang-caret" }), "chevron-down");
    // mousedown, not click: stop the editor from moving the cursor onto the
    // fence line (which would flip the block to raw markdown under the menu).
    el.addEventListener("mousedown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const line = view.state.doc.lineAt(view.posAtDOM(el)).number - 1;
      showPicker(view, el, line, this.lang);
    });
    return el;
  }
  ignoreEvent(): boolean {
    return true;
  }
}

function build(view: EditorView): DecorationSet {
  const doc = view.state.doc;
  const end = doc.lineAt(view.viewport.to).number;
  const lines: string[] = [];
  for (let i = 1; i <= end; i++) lines.push(doc.line(i).text);
  const from = doc.lineAt(view.viewport.from).number - 1;
  const b = new RangeSetBuilder<Decoration>();
  for (const f of findFences(lines)) {
    if (f.line < from) continue;
    const l = doc.line(f.line + 1);
    b.add(l.to, l.to, Decoration.widget({ widget: new LangChip(f.lang), side: 1 }));
  }
  return b.finish();
}

// ---------- auto-detect ----------

/** All lines of the doc, for fence parsing. */
function docLines(view: EditorView): string[] {
  const out: string[] = [];
  for (let i = 1; i <= view.state.doc.lines; i++) out.push(view.state.doc.line(i).text);
  return out;
}

/** The language the block opening on 0-based `line` looks like, or "". */
function detectedFor(view: EditorView, line: number): string {
  const lines = docLines(view);
  const f = findFences(lines).find((x) => x.line === line);
  return f && isClosed(lines, f) ? detectLanguage(blockBody(lines, f)) : "";
}

const AUTO_EVENT = "input.sc-lang-auto";
const AUTO_DELAY = 800;

/**
 * Like VS Code: once you've typed or pasted code into a block that has no
 * language, guess it and write it after the backticks. Only blocks you are
 * editing — opening a note never rewrites it. Undo (Ctrl/Cmd+Z) takes the
 * guess back, and that block is then left alone for the rest of the session.
 */
const autoDetect = ViewPlugin.fromClass(
  class {
    /** Ranges just edited by you (from, to pairs), waiting for the pause before guessing. */
    pending: number[] = [];
    /** Opening-fence positions we filled in, and ones you undid. */
    applied: number[] = [];
    dismissed: number[] = [];
    timer = 0;
    constructor(readonly view: EditorView) {}

    update(u: ViewUpdate) {
      if (!u.docChanged) return;
      const map = (ps: number[]) => ps.map((p) => u.changes.mapPos(p));
      this.pending = map(this.pending);
      this.applied = map(this.applied);
      this.dismissed = map(this.dismissed);

      if (u.transactions.some((t) => t.isUserEvent("undo"))) this.noteUndone(u.view);
      if (!autoDetectOn()) return;
      const typed = u.transactions.some((t) =>
        (t.isUserEvent("input") || t.isUserEvent("delete")) && !t.isUserEvent("input.sc-lang") && !t.isUserEvent(AUTO_EVENT));
      if (!typed) return;
      u.changes.iterChangedRanges((_fa, _ta, fromB, toB) => this.pending.push(fromB, toB));
      window.clearTimeout(this.timer);
      this.timer = window.setTimeout(() => this.run(), AUTO_DELAY);
    }

    /** An undo that removed one of our guesses: don't guess that block again. */
    noteUndone(view: EditorView) {
      const doc = view.state.doc;
      this.applied = this.applied.filter((p) => {
        if (p > doc.length) return false;
        const l = doc.lineAt(p);
        const f = findFences([l.text])[0];
        if (f && !f.lang) { this.dismissed.push(l.from); return false; }
        return true;
      });
    }

    run() {
      const view = this.view;
      const doc = view.state.doc;
      // Edited line spans; a paste can start before a block and end after it.
      const spans: [number, number][] = [];
      for (let i = 0; i + 1 < this.pending.length; i += 2) {
        const a = Math.min(this.pending[i], doc.length), b = Math.min(this.pending[i + 1], doc.length);
        spans.push([doc.lineAt(a).number - 1, doc.lineAt(b).number - 1]);
      }
      this.pending = [];
      if (!spans.length || !autoDetectOn()) return;
      const all = docLines(view);
      const changes: { from: number; to: number; insert: string }[] = [];
      for (const f of findFences(all)) {
        if (f.lang || !isClosed(all, f)) continue;
        if (!spans.some(([a, b]) => a <= f.end && b >= f.line)) continue;
        const at = doc.line(f.line + 1);
        if (this.dismissed.includes(at.from)) continue;
        const lang = detectLanguage(blockBody(all, f));
        if (!lang) continue;
        changes.push({ from: at.from, to: at.to, insert: fenceLine(f, lang) });
        this.applied.push(at.from);
      }
      if (changes.length) {
        // Runs after a pause longer than CodeMirror's undo-grouping window, so
        // the guess is its own undo step: Ctrl/Cmd+Z removes just the language.
        view.dispatch({ changes, userEvent: AUTO_EVENT });
      }
    }

    destroy() {
      window.clearTimeout(this.timer);
    }
  }
);

/**
 * Editor extensions; `enabled` / `autoDetect` are read on every update so
 * the settings toggle live.
 */
export function codeLanguagePicker(app: App, enabled: () => boolean, autoDetectEnabled: () => boolean = () => false) {
  pluginApp = app;
  autoDetectOn = () => enabled() && autoDetectEnabled();
  return [autoDetect, ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      constructor(view: EditorView) {
        this.decorations = enabled() ? build(view) : Decoration.none;
      }
      update(u: ViewUpdate) {
        if (!enabled()) { this.decorations = Decoration.none; return; }
        if (u.docChanged || u.viewportChanged || this.decorations === Decoration.none) this.decorations = build(u.view);
      }
      destroy() {
        openPicker?.();
      }
    },
    { decorations: (v) => v.decorations }
  )];
}
