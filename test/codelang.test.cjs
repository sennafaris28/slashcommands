const assert = require("assert");
const { findFences, fenceLine, filterLanguages, languageLabel } = require("./.build/entry.cjs");
let n = 0; const ok = (m) => console.log(`  ✓ ${m}`, ++n && "");
const F = (s) => findFences(s.split("\n"));
console.log("codelang");

let f = F("text\n```\ncode\n```\n\n```python title=\"a\"\nx\n```");
assert.deepStrictEqual(f.map((x) => [x.line, x.lang, x.rest]), [[1, "", ""], [5, "python", ' title="a"']]);
ok("finds opening fences only, with language and the rest of the info string");

f = F("````md\n```js\nnot a fence\n```\n````\n~~~\n```\n~~~");
assert.deepStrictEqual(f.map((x) => [x.line, x.marker, x.lang]), [[0, "````", "md"], [5, "~~~", ""]]);
ok("nested fences: a longer or different fence isn't closed by a shorter/other one");

f = F("```js\nlet a\n```js\nstill code\n```");
assert.deepStrictEqual(f.map((x) => x.line), [0]);
ok("a fence with an info string never closes a block");

assert.deepStrictEqual(F("use ```inline``` code").length, 0);
ok("backticks with a backtick in the info string are inline code, not a fence");

f = F("> [!note]\n> ```\n> x\n> ```\n```sh\n```");
assert.deepStrictEqual(f.map((x) => [x.line, x.prefix, x.lang]), [[1, "> ", ""], [4, "", "sh"]]);
ok("fences inside callouts / blockquotes keep their > prefix");

f = F("> ```\n> x\nplain\n```go\n```");
assert.deepStrictEqual(f.map((x) => x.line), [0, 3]);
ok("a block inside a quote ends when the quote ends");

assert.deepStrictEqual(F("```\nnever closed").map((x) => x.line), [0]);
assert.deepStrictEqual(F("    ```\n").length, 0);
ok("unclosed block counts; 4-space indent is not a fence");

const one = (s) => F(s)[0];
assert.strictEqual(fenceLine(one("```"), "python"), "```python");
assert.strictEqual(fenceLine(one("  ~~~~js {1,3}"), "ts"), "  ~~~~ts {1,3}");
assert.strictEqual(fenceLine(one("> ```py"), ""), "> ```");
ok("fenceLine swaps only the language, keeps indent, marker and extras");

assert.strictEqual(filterLanguages("py")[0].id, "python");
assert.strictEqual(filterLanguages("ts")[0].id, "typescript");
assert.strictEqual(filterLanguages("").length > 30, true);
assert.ok(filterLanguages("script").some((l) => l.id === "javascript"));
assert.strictEqual(languageLabel("yml"), "YAML");
assert.strictEqual(languageLabel("zig"), "zig");
ok("search matches labels, ids and aliases; labels for known and unknown ids");
console.log(`  ${n} codelang checks passed`);
