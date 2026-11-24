const assert = require("assert");
const { pastedUrl, extractTitle, markdownLink, hostLabel, decodeEntities, inCodeBlock } = require("./.build/entry.cjs");
let n = 0; const ok = (m) => console.log(`  ✓ ${m}`, ++n && "");
console.log("pastelink");

assert.strictEqual(pastedUrl("  https://github.com/a/b?x=1#y \n"), "https://github.com/a/b?x=1#y");
assert.strictEqual(pastedUrl("http://localhost:3000/"), "http://localhost:3000/");
for (const t of ["see https://x.com", "ftp://x.com/f", "https://", "github.com", "https://a.com\nhttps://b.com", "javascript:alert(1)"])
  assert.strictEqual(pastedUrl(t), null, t);
ok("only a lone http(s) URL counts as a pasted link");

assert.strictEqual(extractTitle('<html><head><title>\n  Plain  &amp; simple \n</title></head>'), "Plain & simple");
assert.strictEqual(extractTitle('<meta property="og:title" content="OG &quot;title&quot;"><title>Doc</title>'), 'OG "title"');
assert.strictEqual(extractTitle("<meta content='Swapped order' name='twitter:title'><title>x</title>"), "Swapped order");
assert.strictEqual(extractTitle("<body>no title</body>"), "");
assert.strictEqual(decodeEntities("&#39;a&#x2019;b&rsquo; &bogus;"), "'a’b’ &bogus;");
ok("title from og:title, twitter:title, then <title>; entities decoded, spaces collapsed");

assert.strictEqual(markdownLink("Array [JS] \\ docs", "https://x.com/a"), "[Array \\[JS\\] \\\\ docs](https://x.com/a)");
assert.strictEqual(markdownLink("Wiki", "https://en.wikipedia.org/wiki/A_(b)"), "[Wiki](https://en.wikipedia.org/wiki/A_%28b%29)");
assert.strictEqual(hostLabel("https://www.example.com/x"), "example.com");
ok("markdown link escapes brackets and percent-encodes parentheses in URLs");

const L = "a\n```\ncode\n```\nb\n> ```\n> q".split("\n");
assert.deepStrictEqual(L.map((_, i) => inCodeBlock(L, i)), [false, true, true, true, false, true, true]);
ok("inCodeBlock knows which lines are inside fences");
console.log(`  ${n} pastelink checks passed`);
