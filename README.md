# SlashCommands

A Notion-style **`/` menu** for Obsidian notes. Type `/` at the start of a line (or after a space), keep typing to filter, press Enter.

| Block | Type | Result |
|---|---|---|
| Text | `/text` | Plain paragraph (strips any heading / list marker) |
| Heading 1 · 2 · 3 | `/h1` `/h2` `/h3` | `#` · `##` · `###` |
| To-do list | `/todo` `/check` | `- [ ]` |
| Bulleted list | `/bullet` `/ul` | `-` |
| Numbered list | `/num` `/ol` | `1.` |
| Toggle | `/toggle` | Collapsible callout (`> [!note]-`), title preselected |
| Quote | `/quote` | `>` |
| Divider | `/divider` `/hr` | `---` with blank lines around it |
| Callout | `/callout` | `> [!note]`, cursor in the body |
| Code | `/code` | Fenced block, cursor inside |
| Table | `/table` · `/table 4x6` | 3×3, or exactly 4 columns × 6 rows |
| Table… (choose size) | `/table` → pick it | Hover grid + exact Columns/Rows |
| Today's date | `/date` | Today as `dd/mm/yyyy` |

## Behaviour

- **Converts, doesn't stack** — like Notion. `- buy milk` + `/h2` → `## buy milk`; a checked to-do + `/todo` → a fresh unchecked one. Indentation is kept.
- **Blocks get their own lines** with a blank line around them so they render (a divider never turns the line above into a heading).
- **Stays quiet where `/` is just a character:** fenced code, inline code, frontmatter, URLs, `and/or`, `1/2`, `path/to/file`.
- Short shortcuts must be typed in full, so `/h` lists the three headings only while `/hr` still gives a divider.
- Tables: the first row is the header (markdown needs one), so a "3 × 3" table is a header + 2 rows. Up to 20 columns × 100 rows. A finger can press and slide on the picker grid on iPad.

Also: **Insert table…** in the command palette and the editor's right-click menu.

## Settings

- **Slash menu** — on/off. Turn it off if you use Obsidian's core *Slash commands* plugin; both open on `/`.
- **"Insert table…" in the right-click menu** — on/off.

## For other plugins

```ts
const api = app.plugins.plugins["slashcommands"]?.api;
api?.openTablePicker(editor);          // size picker, then insert
api?.insertTable(editor, 4, 6);        // 4 columns × 6 rows at the cursor
```

## Install

Copy `main.js`, `manifest.json` and `styles.css` into `<vault>/.obsidian/plugins/slashcommands/`, then enable **SlashCommands** under Settings → Community plugins. (Or install from a GitHub repo with [BRAT](https://github.com/TfTHacker/obsidian42-brat).)

**On iPad:** install [BRAT](https://github.com/TfTHacker/obsidian42-brat) from Community plugins, run
**"BRAT: Add a beta plugin for testing"** and paste `sennafaris28/slashcommands`. Step-by-step instructions
are in the [NoteBoard README](https://github.com/sennafaris28/noteboard#install-on-ipad-with-brat).

## Develop

```bash
npm install
npm run dev     # watch + rebuild
npm run build   # type-check + production bundle
npm test        # logic tests against a fake editor
```

The tests bundle the block logic against a stub of the `obsidian` module and run it in Node: conversions, placement, the trigger rules, filtering and tables.
