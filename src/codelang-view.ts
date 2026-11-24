// Code block language picker — the editor side: a "Python ▾" chip on each
// code block's opening line; picking a language rewrites the fence
// (``` → ```python), which is what drives Obsidian's syntax highlighting.

import { RangeSetBuilder } from "@codemirror/state";
import { Decoration, DecorationSet, EditorView, ViewPlugin, ViewUpdate, WidgetType } from "@codemirror/view";
import { setIcon } from "obsidian";
import { Fence, fenceLine, filterLanguages, findFences, languageLabel } from "./codelang";

/** The block's opening fence, re-read at click time (the doc may have changed since render). */
function fenceAt(view: EditorView, line: number): Fence | null {
  const doc = view.state.doc;
  if (line + 1 > doc.lines) return null;
  const lines: string[] = [];
  for (let i = 1; i <= line + 1; i++) lines.push(doc.line(i).text);
  return findFences(lines).find((f) => f.line === line) ?? null;
}

function setLanguage(view: EditorView, line: number, lang: string): void {
  const f = fenceAt(view, line);
  if (!f) return;
  const l = view.state.doc.line(line + 1);
  const text = fenceLine(f, lang);
  if (text !== l.text) view.dispatch({ changes: { from: l.from, to: l.to, insert: text }, userEvent: "input.sc-lang" });
}

// ---------- the dropdown ----------

let openPicker: (() => void) | null = null;

function showPicker(view: EditorView, anchor: HTMLElement, line: number, current: string): void {
  openPicker?.();
  const doc = anchor.ownerDocument;
  const win = doc.defaultView ?? window;
  const pop = doc.body.createDiv({ cls: "sc-lang-pop" });
  const input = pop.createEl("input", { cls: "sc-lang-search", attr: { type: "text", placeholder: "Search for a language…" } });
  const list = pop.createDiv({ cls: "sc-lang-list" });
  let items: { id: string; label: string }[] = [];
  let active = 0;

  const close = () => {
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
    // Let people use any language Obsidian knows, not just the list.
    if (q && /^[\w#+.-]+$/.test(q) && !items.some((i) => i.id === q.toLowerCase())) {
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

  // Start on the block's current language.
  render();
  const cur = items.findIndex((i) => i.id === current.toLowerCase() || i.label === languageLabel(current));
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

/** Editor extension; `enabled` is read on every update so the setting toggles live. */
export function codeLanguagePicker(enabled: () => boolean) {
  return ViewPlugin.fromClass(
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
  );
}
