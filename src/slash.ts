import {
  App,
  Editor,
  EditorPosition,
  EditorSuggest,
  EditorSuggestContext,
  EditorSuggestTriggerInfo,
  setIcon,
} from "obsidian";
import { Range, inLiteral, insertInline, placeBlock, setLinePrefix } from "./blocks";
import { clampTable, insertTable, openTablePicker } from "./table";
import { formatDMY } from "./dates";

/** What a block needs to insert itself. */
interface ApplyCtx {
  app: App;
  editor: Editor;
  /** The "/…" the user typed — replaced by the block. */
  range: Range;
}

export interface Block {
  title: string;
  desc: string;
  icon: string;
  /** Lowercase aliases, letters/digits only, matched as prefixes of what you type. */
  keys: string[];
  apply(ctx: ApplyCtx): void;
}

/** A line-prefix block: converts the current line (heading, list, to-do, quote, text). */
const line = (title: string, desc: string, icon: string, keys: string[], prefix: string): Block => ({
  title,
  desc,
  icon,
  keys,
  apply: ({ editor, range }) => setLinePrefix(editor, prefix, range),
});

/** Same order as Notion's menu. */
export const BLOCKS: Block[] = [
  line("Text", "Plain paragraph", "type", ["text", "paragraph", "plain", "p"], ""),
  line("Heading 1", "Big section heading", "heading-1", ["heading1", "h1", "title"], "# "),
  line("Heading 2", "Medium section heading", "heading-2", ["heading2", "h2", "subtitle"], "## "),
  line("Heading 3", "Small section heading", "heading-3", ["heading3", "h3"], "### "),
  line("To-do list", "Track tasks with checkboxes", "list-checks", ["todo", "todolist", "checklist", "checkbox", "task"], "- [ ] "),
  line("Bulleted list", "Simple bulleted list", "list", ["bulletedlist", "bullet", "bullets", "list", "ul"], "- "),
  line("Numbered list", "List with numbering", "list-ordered", ["numberedlist", "number", "numbered", "ordered", "ol"], "1. "),
  {
    title: "Toggle",
    desc: "Collapsible block (a foldable callout)",
    icon: "chevron-right",
    keys: ["toggle", "collapse", "collapsible", "fold", "foldable"],
    // "> [!note]- " is 11 characters; "Toggle" (6) is the selected placeholder title.
    apply: ({ editor, range }) => placeBlock(editor, "> [!note]- Toggle\n> ", { line: 0, ch: 11, select: 6 }, range),
  },
  line("Quote", "Capture a quote", "quote", ["quote", "blockquote", "citation"], "> "),
  {
    title: "Divider",
    desc: "Visually divide blocks",
    icon: "minus",
    keys: ["divider", "hr", "line", "rule", "separator"],
    apply: ({ editor, range }) => placeBlock(editor, "---\n", { line: 1, ch: 0 }, range),
  },
  {
    title: "Callout",
    desc: "Highlight something in a box",
    icon: "info",
    keys: ["callout", "note", "info", "admonition", "alert"],
    apply: ({ editor, range }) => placeBlock(editor, "> [!note]\n> ", { line: 1, ch: 2 }, range),
  },
  {
    title: "Code",
    desc: "Code block with syntax highlighting",
    icon: "code",
    keys: ["code", "codeblock", "snippet"],
    apply: ({ editor, range }) => placeBlock(editor, "```\n\n```", { line: 1, ch: 0 }, range),
  },
  {
    title: "Table",
    desc: "3 × 3 grid — or type /table 4x6",
    icon: "table",
    keys: ["table", "grid", "spreadsheet"],
    apply: ({ editor, range }) => insertTable(editor, 3, 3, range),
  },
  {
    title: "Table… (choose size)",
    desc: "Pick columns and rows on a grid",
    icon: "table-properties",
    keys: ["tablesize", "tablecustom", "tablechoose", "customtable"],
    apply: ({ app, editor, range }) => {
      // Clear "/table" first so it isn't left behind if the picker is cancelled.
      editor.replaceRange("", range.from, range.to);
      openTablePicker(app, editor, { from: range.from, to: range.from });
    },
  },
  {
    title: "Today's date",
    desc: "Insert today as dd/mm/yyyy",
    icon: "calendar",
    keys: ["date", "today", "datetoday", "now"],
    apply: ({ editor, range }) => insertInline(editor, formatDMY(new Date()), range),
  },
];

/** `/table 4x6`, `/tab 4 × 6` → one exact-size table. */
function tableWithSize(cols: number, rows: number): Block {
  const t = clampTable(cols, rows);
  return {
    title: `Table ${t.cols} × ${t.rows}`,
    desc: `${t.cols} column${t.cols === 1 ? "" : "s"}, header + ${t.rows - 1} row${t.rows === 2 ? "" : "s"}`,
    icon: "table",
    keys: [],
    apply: ({ editor, range }) => insertTable(editor, t.cols, t.rows, range),
  };
}

/** Blocks matching what's typed after the "/" — best matches first. */
export function filterBlocks(query: string): Block[] {
  const raw = query.toLowerCase().trim();
  const dims = /^tab\w*\s+(\d{1,3})\s*[x×*]\s*(\d{1,3})$/.exec(raw);
  if (dims) return [tableWithSize(Number(dims[1]), Number(dims[2]))];
  const q = raw.replace(/[^a-z0-9]/g, "");
  if (!q) return BLOCKS;
  const rank = (b: Block): number => {
    if (b.keys.includes(q)) return 0;
    // Short shortcuts (h1, hr, ol, p…) must be typed in full, so "/h" lists the
    // headings only and doesn't also drag in "hr".
    if (b.keys.some((k) => k.length > 2 && k.startsWith(q))) return 1;
    if (b.title.toLowerCase().split(/[\s-]+/).some((w) => w.startsWith(raw))) return 2;
    return 3;
  };
  return BLOCKS.map((b) => ({ b, r: rank(b) }))
    .filter((x) => x.r < 3)
    .sort((a, c) => a.r - c.r) // stable: ties stay in menu order
    .map((x) => x.b);
}

/**
 * Notion-style "/" menu. Type "/" at the start of a line or after a space,
 * then keep typing to filter ("/h2", "/todo", "/table 4x6").
 */
export class SlashSuggest extends EditorSuggest<Block> {
  constructor(app: App, private enabled: () => boolean) {
    super(app);
  }

  onTrigger(cursor: EditorPosition, editor: Editor): EditorSuggestTriggerInfo | null {
    if (!this.enabled()) return null;
    const before = editor.getLine(cursor.line).slice(0, cursor.ch);
    // "/" + a word or two (+ a size) — only at line start or after a space, so
    // "and/or", "https://…" and "1/2" never open the menu.
    const m = /(?:^|\s)(\/[\w×*-]*(?: [\w×*-]+){0,4})$/.exec(before);
    if (!m || m[1].length > 30) return null;
    if (inLiteral(editor, cursor)) return null; // code, frontmatter: "/" is just text
    return {
      start: { line: cursor.line, ch: before.length - m[1].length },
      end: cursor,
      query: m[1].slice(1),
    };
  }

  getSuggestions(ctx: EditorSuggestContext): Block[] {
    return filterBlocks(ctx.query);
  }

  renderSuggestion(block: Block, el: HTMLElement): void {
    const row = el.createDiv({ cls: "sc-sug" });
    setIcon(row.createSpan({ cls: "sc-sug-icon" }), block.icon);
    const text = row.createDiv({ cls: "sc-sug-text" });
    text.createDiv({ cls: "sc-sug-title", text: block.title });
    text.createDiv({ cls: "sc-sug-sub", text: block.desc });
  }

  selectSuggestion(block: Block): void {
    const ctx = this.context;
    if (!ctx) return;
    block.apply({ app: this.app, editor: ctx.editor, range: { from: ctx.start, to: ctx.end } });
  }
}
