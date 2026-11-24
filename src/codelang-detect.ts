// Code block language detection — guesses a block's language from its code,
// like VS Code does for new files. Uses highlight.js's auto-detection (the
// "common" build: ~35 popular languages, no extra files, works on mobile).

import hljs from "highlight.js/lib/common";

// highlight.js names that make poor guesses (they match too much ordinary code).
const SKIP = new Set(["plaintext", "vbnet", "wasm", "php-template"]);
const CANDIDATES = hljs.listLanguages().filter((l) => !SKIP.has(l));

/** highlight.js name → the id written after the backticks. */
function toFenceId(name: string, code: string): string {
  switch (name) {
    case "xml":
      return /<(!doctype\s+html|html|head|body|div|span|p|a|script|style|meta|link)\b/i.test(code) ? "html" : "xml";
    case "shell":
      return "bash";
    case "python-repl":
      return "python";
    default:
      return name;
  }
}

/** Not worth guessing below this much code. */
const MIN_CHARS = 12;
/** highlight.js relevance needed before we trust a guess, and its lead over the runner-up. */
const MIN_RELEVANCE = 5;
const MIN_LEAD = 2;

// Shell commands people paste on their own (first word of the first line).
const COMMANDS =
  "sudo|curl|wget|apt|apt-get|yum|dnf|brew|npm|npx|yarn|pnpm|pip|pip3|git|docker|kubectl|helm|gcloud|gsutil|bq|aws|az|terraform|ssh|scp|cd|ls|cat|echo|export|chmod|chown|systemctl|journalctl|grep|find|mkdir|rm|cp|mv|tar|jq|openssl|nmap|dig|nslookup";
const SHELL_START = new RegExp(`^\\s*(?:\\$\\s+)?(?:${COMMANDS})(?:\\s|$)`);

/**
 * Unmistakable signs, checked before highlight.js: they catch the short
 * snippets its statistics miss (a lone SELECT, one curl command, a for-loop).
 */
function byRules(text: string): string {
  const t = text.trim();
  const first = t.split("\n", 1)[0];
  const shebang = /^#!.*\b(bash|sh|zsh|python3?|node)\b/.exec(first);
  if (shebang) return { python: "python", python3: "python", node: "javascript" }[shebang[1]] ?? "bash";
  if (/^[[{]/.test(t)) {
    try { JSON.parse(t); return "json"; } catch { /* not JSON */ }
  }
  if (/^(select|insert\s+into|update|delete\s+from|create\s+(or\s+replace\s+)?(table|view|index|function)|with\s+\w+\s+as\s*\(|alter\s+table|drop\s+(table|view))\b/i.test(t) &&
      /\b(from|into|set|table|view|as|where)\b/i.test(t)) return "sql";
  if (/^package\s+\w+\s*$/m.test(t) && /\bfunc\b/.test(t)) return "go";
  if (/\bfunc\s+(\(\w+\s+\*?\w+\)\s*)?\w+\s*\(/.test(t) && /\bfmt\.\w|:=|\berr\s*!=\s*nil\b/.test(t)) return "go";
  if (/\bpublic\s+static\s+void\s+main\s*\(\s*String\b|\bSystem\.out\.print/.test(t)) return "java";
  if (/^import\s+(UIKit|Foundation|SwiftUI|Combine)\s*$/m.test(t) || /\boverride\s+func\b|\bguard\s+let\b/.test(t)) return "swift";
  if (/^\s*fun\s+\w+\s*\(/m.test(t) && /\b(val|var|println|listOf|mapOf)\b/.test(t) && !/\bfunc\b/.test(t)) return "kotlin";
  if (/^using\s+System[\w.]*;|\bConsole\.Write(Line)?\(/m.test(t)) return "csharp";
  if (/^\s*(def\s+\w+\s*\(.*\)\s*(->.*)?:|elif\b.*:|for\s+\w+(\s*,\s*\w+)*\s+in\s+.+:|from\s+[\w.]+\s+import\s+\w|if\s+__name__\s*==)\s*$/m.test(t) &&
      !/[;{}]\s*$/m.test(t)) return "python";
  if (SHELL_START.test(first) && !/[{};]\s*$/m.test(t.replace(/\{[^}\n]*\}/g, ""))) return "bash";
  return "";
}

/**
 * The fence id for `code` ("python", "sql", …), or "" when there isn't
 * enough code or no language is a clear winner.
 */
export function detectLanguage(code: string): string {
  const text = code.slice(0, 4000);
  const size = text.replace(/\s/g, "").length;
  if (size < 6) return "";
  const ruled = byRules(text);
  if (ruled) return ruled;
  if (size < MIN_CHARS) return "";
  const res = hljs.highlightAuto(text, CANDIDATES);
  if (!res.language || res.relevance < MIN_RELEVANCE) return "";
  const second = res.secondBest;
  if (second?.language && res.relevance - second.relevance < MIN_LEAD) {
    // Close call between near-twins is fine (TS vs JS, C vs C++): keep the winner.
    const twins = [["typescript", "javascript"], ["cpp", "c"], ["bash", "shell"], ["scss", "css"], ["less", "css"]];
    if (!twins.some((t) => t.includes(res.language!) && t.includes(second.language!))) return "";
  }
  return toFenceId(res.language, text);
}
