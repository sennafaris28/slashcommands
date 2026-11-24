const assert = require("assert");
const { detectLanguage, findFences, isClosed, blockBody } = require("./.build/entry.cjs");
let n = 0; const ok = (m) => console.log(`  ✓ ${m}`, ++n && "");
console.log("detect");

const cases = [
  ["sql", "SELECT rule_id, COUNT(*) AS hits\nFROM `project.dataset.logs`\nWHERE action = 'deny'\nGROUP BY rule_id"],
  ["sql", "select * from users where id = 1"],
  ["bash", "curl -s -H \"Authorization: Bearer $TOKEN\" https://api.example.com/v1/items | jq '.items[]'"],
  ["bash", "$ git status"],
  ["bash", "#!/bin/bash\nfor f in *.log; do\n  grep -c ERROR \"$f\"\ndone"],
  ["python", "import requests\n\ndef fetch(url):\n    return requests.get(url).json()"],
  ["python", "for i in range(10):\n    print(i)"],
  ["json", "{\n  \"name\": \"x\",\n  \"tags\": [\"a\"]\n}"],
  ["yaml", "apiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: web\nspec:\n  replicas: 3"],
  ["typescript", "interface User { id: number; name: string }\nexport function greet(u: User): string {\n  return `hi ${u.name}`;\n}"],
  ["go", "func main() {\n\tfmt.Println(\"hi\")\n}"],
  ["go", "package main\n\nimport \"fmt\"\n\nfunc main() {\n\tfmt.Println(\"hello\")\n}"],
  ["kotlin", "fun main() {\n    val list = listOf(1, 2, 3)\n    list.forEach { println(it) }\n}"],
  ["swift", "import UIKit\n\nclass ViewController: UIViewController {\n    override func viewDidLoad() {\n        super.viewDidLoad()\n    }\n}"],
  ["java", "public class Main {\n    public static void main(String[] args) {\n        System.out.println(\"hi\");\n    }\n}"],
  ["html", "<!DOCTYPE html>\n<html>\n<body>\n  <div class=\"x\">hi</div>\n</body>\n</html>"],
];
for (const [want, code] of cases) assert.strictEqual(detectLanguage(code), want, code.split("\n")[0]);
ok(`guesses ${cases.length} snippets across ${new Set(cases.map((c) => c[0])).size} languages`);

for (const prose of ["remember to buy milk and eggs tomorrow", "x", "- item one\n- item two\n- item three",
  "Meeting notes: discussed the rules with the team, follow up next week.", "1. open the app\n2. click login\n3. it crashes"]) {
  assert.strictEqual(detectLanguage(prose), "", prose);
}
ok("leaves prose, lists and tiny snippets alone");

const L = (s) => s.split("\n");
let lines = L("```\nselect 1\nfrom t\n```\nafter");
let f = findFences(lines)[0];
assert.ok(isClosed(lines, f));
assert.strictEqual(blockBody(lines, f), "select 1\nfrom t");
lines = L("```\nstill typing");
assert.ok(!isClosed(lines, findFences(lines)[0]));
lines = L("> ```\n> a = 1\n> b\n> ```");
f = findFences(lines)[0];
assert.ok(isClosed(lines, f));
assert.strictEqual(blockBody(lines, f), "a = 1\nb");
ok("block body and closed/unclosed blocks, including inside callouts");

console.log(`  ${n} detect checks passed`);
