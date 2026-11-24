// Code block language picker — the pure parts (fence parsing, language list),
// kept free of CodeMirror so the tests can load them.

export interface Language {
  /** What goes after the backticks. "" = plain text (no language). */
  id: string;
  label: string;
  /** Other names people type, for the search box. */
  aliases?: string[];
}

/** Common languages Obsidian highlights. Anything else can still be typed in the search box. */
export const LANGUAGES: Language[] = [
  { id: "", label: "Plain text", aliases: ["text", "none", "txt"] },
  { id: "bash", label: "Bash", aliases: ["sh", "shell", "zsh"] },
  { id: "c", label: "C" },
  { id: "cpp", label: "C++", aliases: ["c++"] },
  { id: "csharp", label: "C#", aliases: ["cs", "c#"] },
  { id: "css", label: "CSS" },
  { id: "dart", label: "Dart" },
  { id: "diff", label: "Diff", aliases: ["patch"] },
  { id: "dockerfile", label: "Dockerfile", aliases: ["docker"] },
  { id: "go", label: "Go", aliases: ["golang"] },
  { id: "graphql", label: "GraphQL", aliases: ["gql"] },
  { id: "groovy", label: "Groovy", aliases: ["gradle"] },
  { id: "html", label: "HTML", aliases: ["xhtml"] },
  { id: "ini", label: "INI", aliases: ["conf", "cfg"] },
  { id: "java", label: "Java" },
  { id: "javascript", label: "JavaScript", aliases: ["js", "node"] },
  { id: "json", label: "JSON" },
  { id: "jsx", label: "JSX", aliases: ["react"] },
  { id: "kotlin", label: "Kotlin", aliases: ["kt"] },
  { id: "lua", label: "Lua" },
  { id: "makefile", label: "Makefile", aliases: ["make"] },
  { id: "markdown", label: "Markdown", aliases: ["md"] },
  { id: "nginx", label: "Nginx" },
  { id: "objectivec", label: "Objective-C", aliases: ["objc"] },
  { id: "perl", label: "Perl" },
  { id: "php", label: "PHP" },
  { id: "powershell", label: "PowerShell", aliases: ["ps1", "pwsh"] },
  { id: "python", label: "Python", aliases: ["py"] },
  { id: "r", label: "R" },
  { id: "regex", label: "Regex", aliases: ["regexp"] },
  { id: "ruby", label: "Ruby", aliases: ["rb"] },
  { id: "rust", label: "Rust", aliases: ["rs"] },
  { id: "scala", label: "Scala" },
  { id: "sql", label: "SQL", aliases: ["mysql", "postgres", "psql"] },
  { id: "swift", label: "Swift" },
  { id: "toml", label: "TOML" },
  { id: "tsx", label: "TSX" },
  { id: "typescript", label: "TypeScript", aliases: ["ts"] },
  { id: "xml", label: "XML", aliases: ["svg"] },
  { id: "yaml", label: "YAML", aliases: ["yml"] },
];

/** Display name for a fence's language id ("py" → "Python", unknown ids as typed). */
export function languageLabel(id: string): string {
  const k = id.toLowerCase();
  const hit = LANGUAGES.find((l) => l.id === k || l.aliases?.includes(k));
  return hit ? hit.label : id;
}

/**
 * Languages matching `query`, best first: exact label/id/alias matches, then
 * prefix matches, then substring matches. An empty query returns the whole list.
 */
export function filterLanguages(query: string): Language[] {
  const q = query.trim().toLowerCase();
  if (!q) return LANGUAGES.slice();
  const names = (l: Language) => [l.label.toLowerCase(), l.id, ...(l.aliases ?? [])];
  const exact = LANGUAGES.filter((l) => names(l).includes(q));
  const prefix = LANGUAGES.filter((l) => !exact.includes(l) && names(l).some((n) => n.startsWith(q)));
  const inner = LANGUAGES.filter((l) => !exact.includes(l) && !prefix.includes(l) && names(l).some((n) => n.includes(q)));
  return [...exact, ...prefix, ...inner];
}

/** An opening code fence and where its parts are on the line. */
export interface Fence {
  /** 0-based line number. */
  line: number;
  /** Leading indent / blockquote markers before the fence ("", "  ", "> "). */
  prefix: string;
  /** The fence itself: ``` or ~~~ (3 or more). */
  marker: string;
  /** First word of the info string, the language ("" if none). */
  lang: string;
  /** Anything after the language (e.g. ` title="x"`), kept when the language changes. */
  rest: string;
}

// Up to 3 spaces of indent, optionally inside blockquotes / callouts.
const OPEN_RE = /^((?:[ ]{0,3}>[ ]?)*[ ]{0,3})(`{3,}|~{3,})(.*)$/;

/**
 * Opening fences of the code blocks in `lines` (CommonMark rules: a block is
 * closed by a fence of the same character, at least as long, with nothing
 * after it). An unclosed block runs to the end, like Obsidian renders it.
 * `upTo` stops the scan early (line index, exclusive).
 */
export function findFences(lines: readonly string[], upTo = lines.length): Fence[] {
  const out: Fence[] = [];
  let open: { marker: string; quote: number } | null = null;
  const quoteDepth = (p: string) => (p.match(/>/g) ?? []).length;
  for (let i = 0; i < Math.min(upTo, lines.length); i++) {
    const m = OPEN_RE.exec(lines[i]);
    if (open) {
      if (m && m[2][0] === open.marker[0] && m[2].length >= open.marker.length && m[3].trim() === "" &&
          quoteDepth(m[1]) === open.quote) {
        open = null;
      } else if (open.quote > 0 && quoteDepth(lines[i].match(/^(?:[ ]{0,3}>[ ]?)*/)![0]) < open.quote) {
        open = null; // the blockquote / callout ended, so did the block inside it
      }
      continue;
    }
    if (!m) continue;
    const info = m[3];
    if (m[2][0] === "`" && info.includes("`")) continue; // inline code, not a fence
    const lead = /^\s*/.exec(info)![0];
    const word = /^\S*/.exec(info.slice(lead.length))![0];
    out.push({ line: i, prefix: m[1], marker: m[2], lang: word, rest: info.slice(lead.length + word.length) });
    open = { marker: m[2], quote: quoteDepth(m[1]) };
  }
  return out;
}

/** The fence line with its language set to `lang` ("" removes it). */
export function fenceLine(f: Fence, lang: string): string {
  return f.prefix + f.marker + lang + (lang ? f.rest : f.rest.replace(/^\s+/, ""));
}
