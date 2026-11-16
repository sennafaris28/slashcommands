const assert = require("assert");
const { SlashSuggest, BLOCKS, filterBlocks, tableMarkdown, insertTable } = require("./.build/entry.cjs");

function fakeEditor(text, cursor) {
  const ed = {
    lines: text.split("\n"), cur: cursor, sel: null,
    getLine: (n) => ed.lines[n], lineCount: () => ed.lines.length,
    getCursor: () => ed.cur, setCursor: (p) => { ed.cur = p; ed.sel = null; },
    setSelection: (a, h) => { ed.cur = a; ed.sel = { from: a, to: h }; }, focus: () => {},
    replaceRange(str, from, to) {
      to = to || from;
      const full = ed.lines.join("\n");
      const off = (p) => ed.lines.slice(0, p.line).reduce((n, l) => n + l.length + 1, 0) + p.ch;
      ed.lines = (full.slice(0, off(from)) + str + full.slice(off(to))).split("\n");
    },
    text: () => ed.lines.join("\n"),
  };
  return ed;
}
const block = (title) => BLOCKS.find((b) => b.title === title);
// Run a block as if the user typed `typed` at the end of `before` on line L.
function run(title, doc, L, from, to) {
  const ed = fakeEditor(doc, { line: L, ch: to });
  block(title).apply({ app: {}, editor: ed, range: { from: { line: L, ch: from }, to: { line: L, ch: to } } });
  return ed;
}
let n = 0; const ok = (m) => console.log(`  ✓ ${m}`, ++n && "");

// ---- converting a line (Notion swaps the block type, it doesn't stack)
let e = run("Heading 1", "/h1", 0, 0, 3);
assert.strictEqual(e.text(), "# "); assert.deepStrictEqual(e.cur, { line: 0, ch: 2 });
ok("/h1 on an empty line → '# ', cursor after it");
e = run("Heading 2", "- buy milk /h2", 0, 11, 14);
assert.strictEqual(e.text(), "## buy milk"); assert.deepStrictEqual(e.cur, { line: 0, ch: 11 });
ok("bullet + /h2 → '## buy milk' (marker swapped, trailing space trimmed)");
e = run("To-do list", "buy milk /todo", 0, 9, 14);
assert.strictEqual(e.text(), "- [ ] buy milk");
ok("plain text + /todo → '- [ ] buy milk'");
e = run("Bulleted list", "1. first /bullet", 0, 9, 16);
assert.strictEqual(e.text(), "- first");
ok("numbered item + /bullet → '- first'");
e = run("Text", "### Big heading /text", 0, 16, 21);
assert.strictEqual(e.text(), "Big heading");
ok("heading + /text → plain paragraph");
e = run("To-do list", "- [x] done thing /todo", 0, 17, 22);
assert.strictEqual(e.text(), "- [ ] done thing");
ok("checked to-do + /todo → fresh unchecked to-do");
e = run("Quote", "  nested /quote", 0, 9, 15);
assert.strictEqual(e.text(), "  > nested");
ok("indentation is preserved");
e = run("Numbered list", "/num\nnext line", 0, 0, 4);
assert.strictEqual(e.text(), "1. \nnext line");
ok("other lines are untouched");

// ---- placing blocks
e = run("Code", "/code", 0, 0, 5);
assert.strictEqual(e.text(), "```\n\n```"); assert.deepStrictEqual(e.cur, { line: 1, ch: 0 });
ok("/code → fenced block, cursor on the empty middle line");
e = run("Callout", "Intro\n/callout\nAfter", 1, 0, 8);
assert.strictEqual(e.text(), "Intro\n\n> [!note]\n> \n\nAfter"); assert.deepStrictEqual(e.cur, { line: 3, ch: 2 });
ok("/callout between paragraphs → blank lines around, cursor in the body");
e = run("Toggle", "/toggle", 0, 0, 7);
assert.strictEqual(e.text(), "> [!note]- Toggle\n> ");
assert.deepStrictEqual(e.sel, { from: { line: 0, ch: 11 }, to: { line: 0, ch: 17 } });
ok("/toggle → foldable callout with 'Toggle' selected to retitle");
e = run("Divider", "Above\n/divider\nBelow", 1, 0, 8);
assert.strictEqual(e.text(), "Above\n\n---\n\n\nBelow"); assert.deepStrictEqual(e.cur, { line: 3, ch: 0 });
ok("/divider → '---' with blank lines (never turns text above into a heading), cursor below");
e = run("Divider", "/divider", 0, 0, 8);
assert.strictEqual(e.text(), "---\n"); assert.deepStrictEqual(e.cur, { line: 1, ch: 0 });
ok("/divider at end of note → cursor on a fresh line below");
e = run("Table", "/table", 0, 0, 6);
assert.strictEqual(e.text(), "|  |  |  |\n| --- | --- | --- |\n|  |  |  |\n|  |  |  |");
ok("/table → 3×3 (same as before)");
const d = new Date(); const dmy = `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
e = run("Today's date", "Due /date", 0, 4, 9);
assert.strictEqual(e.text(), `Due ${dmy}`); assert.deepStrictEqual(e.cur, { line: 0, ch: 4 + dmy.length });
ok(`/date → today as dd/mm/yyyy (${dmy}), cursor after it`);

// ---- filtering
const names = (q) => filterBlocks(q).map((b) => b.title);
assert.strictEqual(names("").length, BLOCKS.length);
assert.deepStrictEqual(names("h"), ["Heading 1", "Heading 2", "Heading 3"]);
assert.deepStrictEqual(names("h2"), ["Heading 2"]);
assert.deepStrictEqual(names("hr"), ["Divider"], "/hr is a divider");
assert.deepStrictEqual(names("ul"), ["Bulleted list"]);
assert.deepStrictEqual(names("ol"), ["Numbered list"]);
assert.deepStrictEqual(names("heading 3"), ["Heading 3"]);
assert.deepStrictEqual(names("todo"), ["To-do list"]);
assert.deepStrictEqual(names("to do"), ["To-do list"]);
assert.deepStrictEqual(names("check"), ["To-do list"]);
assert.deepStrictEqual(names("bul"), ["Bulleted list"]);
assert.deepStrictEqual(names("num"), ["Numbered list"]);
assert.deepStrictEqual(names("code"), ["Code"]);
assert.deepStrictEqual(names("table"), ["Table", "Table… (choose size)"]);
assert.deepStrictEqual(names("tab 4x6"), ["Table 4 × 6"]);
assert.deepStrictEqual(names("table 4 × 1"), ["Table 4 × 2"]);
assert.deepStrictEqual(names("zzz"), []);
assert.deepStrictEqual(names("home"), [], "paths like /home match nothing");
assert.deepStrictEqual(names("usr"), []);
ok("filtering: /h, /h2, /heading 3, /todo, /to do, /check, /bul, /num, /table 4x6 …");

// ---- when the menu may open
const sug = new SlashSuggest({}, () => true);
const trigIn = (lines, L, ch) => sug.onTrigger({ line: L, ch }, fakeEditor(lines.join("\n"), { line: L, ch }));
const trig = (s) => trigIn([s], 0, s.length);
assert.ok(trig("/"), "bare /");
assert.ok(trig("/h"), "/h");
assert.ok(trig("text /todo"), "after a space");
assert.ok(trig("/table 4x6"));
assert.ok(trig("/to do"));
assert.ok(trig("/table 4 x 6"));
assert.strictEqual(trig("and/or"), null);
assert.strictEqual(trig("https://x.com/h"), null);
assert.strictEqual(trig("1/2"), null);
assert.strictEqual(trig("path/to/file"), null);
assert.strictEqual(trig("see /a b c d e f g"), null, "too many words");
let t = trig("hey /h2");
assert.deepStrictEqual(t.start, { line: 0, ch: 4 }); assert.strictEqual(t.query, "h2");
const off = new SlashSuggest({}, () => false);
assert.strictEqual(off.onTrigger({ line: 0, ch: 2 }, fakeEditor("/h", { line: 0, ch: 2 })), null, "setting off");
ok("opens on / at line start or after a space; never in and/or, URLs, fractions, paths");

assert.strictEqual(trigIn(["```bash", "cd /home", "```"], 1, 8), null, "inside a fenced code block");
assert.ok(trigIn(["```bash", "ls", "```", "/h"], 3, 2), "after the fence closes");
assert.strictEqual(trigIn(["use `ls /h"], 0, 10), null, "inside inline code");
assert.ok(trigIn(["use `ls` then /h"], 0, 17), "after inline code closes");
assert.strictEqual(trigIn(["---", "title: x /h", "---", "body"], 1, 11), null, "inside frontmatter");
assert.ok(trigIn(["---", "title: x", "---", "/h"], 3, 2), "below frontmatter");
ok("stays quiet inside code blocks, inline code and frontmatter");

// ---- tables (direct)
const T33 = tableMarkdown(3, 3); // 3 rows total = header + 2 body rows, plus the --- separator
assert.strictEqual(T33, "|  |  |  |\n| --- | --- | --- |\n|  |  |  |\n|  |  |  |");
assert.strictEqual(tableMarkdown(1, 2), "|  |\n| --- |\n|  |");
assert.strictEqual(tableMarkdown(2, 1).split("\n").length, 3, "rows clamp to header + 1");
assert.strictEqual(tableMarkdown(99, 3).split("\n")[0].match(/\|/g).length, 21, "cols clamp to 20");
ok("table markdown: sizes and clamps");
e = fakeEditor("", { line: 0, ch: 0 });
insertTable(e, 3, 3);
assert.strictEqual(e.text(), T33); assert.deepStrictEqual(e.cur, { line: 0, ch: 2 });
ok("empty note → just the table, cursor in the first header cell");
e = fakeEditor("Intro text\n/table\nAfter", { line: 1, ch: 6 });
insertTable(e, 2, 2, { from: { line: 1, ch: 0 }, to: { line: 1, ch: 6 } });
assert.strictEqual(e.text(), "Intro text\n\n|  |  |\n| --- | --- |\n|  |  |\n\nAfter");
ok("table between paragraphs → blank line before and after");
e = fakeEditor("Intro\n\n/table\n\nAfter", { line: 2, ch: 6 });
insertTable(e, 2, 2, { from: { line: 2, ch: 0 }, to: { line: 2, ch: 6 } });
assert.strictEqual(e.text(), "Intro\n\n|  |  |\n| --- | --- |\n|  |  |\n\nAfter");
ok("already-spaced paragraphs → no doubled blank lines");
e = fakeEditor("see this /table", { line: 0, ch: 15 });
insertTable(e, 2, 2, { from: { line: 0, ch: 9 }, to: { line: 0, ch: 15 } });
assert.strictEqual(e.text(), "see this \n\n|  |  |\n| --- | --- |\n|  |  |");
ok("table mid-sentence → text kept, table on its own lines");

console.log(`\nall ${n} check groups passed`);
