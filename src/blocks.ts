import type { Editor, EditorPosition } from "obsidian";

/** The text the user typed to trigger a block (e.g. "/h2"), replaced when it's inserted. */
export type Range = { from: EditorPosition; to: EditorPosition };

/**
 * Insert a multi-line block (table, code block, divider…) on its own lines
 * with a blank line around it, so it renders. `cursor` is relative to the
 * block's first line; `select` highlights that many characters from there.
 */
export function placeBlock(
  editor: Editor,
  md: string,
  cursor: { line: number; ch: number; select?: number },
  range?: Range
): void {
  const from = range?.from ?? editor.getCursor("from");
  const to = range?.to ?? editor.getCursor("to");
  // Remove the trigger text / selection first.
  if (from.line !== to.line || from.ch !== to.ch) editor.replaceRange("", from, to);

  const L = from.line;
  const lineText = editor.getLine(L);
  const nextLine = L + 1 < editor.lineCount() ? editor.getLine(L + 1) : null;
  const blankAfter = nextLine !== null && nextLine.trim() !== "" ? "\n" : "";
  let startLine: number;

  if (lineText.trim() === "") {
    // On an empty line: the block replaces it.
    const blankBefore = L > 0 && editor.getLine(L - 1).trim() !== "";
    editor.replaceRange(
      `${blankBefore ? "\n" : ""}${md}${blankAfter}`,
      { line: L, ch: 0 },
      { line: L, ch: lineText.length }
    );
    startLine = L + (blankBefore ? 1 : 0);
  } else {
    // Mid-text: keep the text and start the block below it.
    editor.replaceRange(`\n\n${md}${blankAfter}`, { line: L, ch: lineText.length });
    startLine = L + 2;
  }
  editor.focus();
  const pos = { line: startLine + cursor.line, ch: cursor.ch };
  if (cursor.select) editor.setSelection(pos, { line: pos.line, ch: pos.ch + cursor.select });
  else editor.setCursor(pos);
}

/** An existing block marker at the start of a line: heading, quote, list item or to-do. */
const BLOCK_PREFIX = /^(\s*)((?:#{1,6}\s+)|(?:>\s?)+|(?:[-*+]\s+(?:\[[ xX]\]\s+)?)|(?:\d+[.)]\s+))?/;

/**
 * Turn the line into a different block, as Notion does: the typed trigger is
 * removed, any existing heading / list / quote marker is swapped for `prefix`
 * ("" = plain text), and the line's text stays.
 */
export function setLinePrefix(editor: Editor, prefix: string, range: Range): void {
  const { from, to } = range;
  const original = editor.getLine(from.line);
  const triggerAtEnd = to.ch >= original.length;
  editor.replaceRange("", from, to);

  const L = from.line;
  let text = editor.getLine(L);
  if (triggerAtEnd) text = text.replace(/[ \t]+$/, ""); // "buy milk /todo" → "buy milk"
  const m = BLOCK_PREFIX.exec(text) as RegExpExecArray;
  const indent = m[1];
  const rest = text.slice(m[0].length);
  const next = indent + prefix + rest;
  editor.replaceRange(next, { line: L, ch: 0 }, { line: L, ch: editor.getLine(L).length });
  // Keep the cursor where the trigger was, relative to the text.
  const ch = Math.min(next.length, indent.length + prefix.length + Math.max(0, from.ch - m[0].length));
  editor.focus();
  editor.setCursor({ line: L, ch });
}

/** Replace the trigger with inline text (e.g. today's date). */
export function insertInline(editor: Editor, text: string, range: Range): void {
  editor.replaceRange(text, range.from, range.to);
  editor.focus();
  editor.setCursor({ line: range.from.line, ch: range.from.ch + text.length });
}

/**
 * True where "/" is just text, not a menu trigger: frontmatter, fenced or
 * inline code. (A cheap line scan — no syntax tree needed.)
 */
export function inLiteral(editor: Editor, pos: EditorPosition): boolean {
  if (editor.getLine(0)?.trim() === "---") {
    for (let i = 1; i < editor.lineCount(); i++) {
      if (/^(---|\.\.\.)\s*$/.test(editor.getLine(i))) {
        if (pos.line <= i) return true;
        break;
      }
    }
  }
  let fences = 0;
  for (let i = 0; i < pos.line; i++) if (/^\s*(```|~~~)/.test(editor.getLine(i))) fences++;
  if (fences % 2 === 1) return true;
  const before = editor.getLine(pos.line).slice(0, pos.ch);
  if (/^\s*(```|~~~)/.test(before)) return true;
  return ((before.replace(/```/g, "").match(/`/g) ?? []).length % 2) === 1;
}
