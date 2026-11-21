import { App, Editor, EditorPosition, Modal, Platform, Setting } from "obsidian";
import { placeBlock } from "./blocks";

/** Largest table the picker / `/table 4x6` will make. */
const MAX_COLS = 20;
const MAX_ROWS = 100;
/** Size of the hover grid in the picker. */
const GRID_COLS = 10;
const GRID_ROWS = 8;

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.round(n) || lo));

/**
 * A markdown table: `cols` columns, `rows` rows in total. The first row is
 * the header (markdown needs one), so `rows` ≥ 2. Cells start empty.
 */
export function tableMarkdown(cols: number, rows: number): string {
  const c = clamp(cols, 1, MAX_COLS);
  const r = clamp(rows, 2, MAX_ROWS);
  const row = `|${Array(c).fill("  ").join("|")}|`;
  const sep = `|${Array(c).fill(" --- ").join("|")}|`;
  return [row, sep, ...Array(r - 1).fill(row)].join("\n");
}

/**
 * Insert a table at the cursor (or over `range`, e.g. the "/table" the user
 * typed). It lands on its own lines with a blank line around it, so it
 * renders, and the cursor ends up in the first header cell.
 */
export function insertTable(
  editor: Editor,
  cols: number,
  rows: number,
  range?: { from: EditorPosition; to: EditorPosition }
): void {
  placeBlock(editor, tableMarkdown(cols, rows), { line: 0, ch: 2 }, range);
}

/** Keep a requested size within what the picker allows. */
export function clampTable(cols: number, rows: number): { cols: number; rows: number } {
  return { cols: clamp(cols, 1, MAX_COLS), rows: clamp(rows, 2, MAX_ROWS) };
}

// ---- Size picker ---------------------------------------------------------------

/** Pick a size on a hover grid (or type it), then call `onPick(cols, rows)`. */
class TableSizeModal extends Modal {
  constructor(app: App, private onPick: (cols: number, rows: number) => void) {
    super(app);
    // iPad: keep the dialog above the on-screen keyboard (see styles.css).
    this.containerEl.addClass("sc-kb-safe");
  }

  open(): void {
    super.open();
    // Measure the keyboard ourselves too, in case Obsidian's
    // --keyboard-height isn't reported on this device.
    const vv = window.visualViewport;
    if (!Platform.isMobile || !vv) return;
    const el = this.containerEl;
    const update = () => {
      if (!el.isConnected) {
        vv.removeEventListener("resize", update);
        vv.removeEventListener("scroll", update);
        return;
      }
      const kb = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      el.style.setProperty("--sc-kb", `${Math.round(kb)}px`);
    };
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    update();
  }

  onOpen(): void {
    this.titleEl.setText("Insert table");
    const { contentEl } = this;
    let cols = 3;
    let rows = 3;
    let done = false;

    const label = contentEl.createDiv({ cls: "sc-tblgrid-label" });
    const grid = contentEl.createDiv({ cls: "sc-tblgrid" });
    grid.style.gridTemplateColumns = `repeat(${GRID_COLS}, 1fr)`;
    const cells: HTMLElement[] = [];
    for (let r = 1; r <= GRID_ROWS; r++) {
      for (let c = 1; c <= GRID_COLS; c++) {
        const cell = grid.createDiv({ cls: "sc-tblgrid-cell" });
        cell.dataset.c = String(c);
        cell.dataset.r = String(r);
        cells.push(cell);
      }
    }
    const paint = () => {
      for (const cell of cells) {
        cell.toggleClass("is-on", Number(cell.dataset.c) <= cols && Number(cell.dataset.r) <= rows);
      }
      label.setText(`${cols} columns × ${rows} rows (first row is the header)`);
    };
    const cellAt = (e: PointerEvent) => {
      const el = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
      return el?.dataset.c ? { c: Number(el.dataset.c), r: Number(el.dataset.r) } : null;
    };
    const pick = (c: number, r: number) => {
      if (done) return;
      done = true;
      this.close();
      this.onPick(c, r);
    };
    // Mouse: hover to size, click to insert. Finger: press, slide to size, lift to insert.
    grid.addEventListener("pointermove", (e) => {
      const p = cellAt(e);
      if (p) {
        cols = p.c;
        rows = p.r;
        paint();
      }
    });
    grid.addEventListener("pointerdown", (e) => {
      const p = cellAt(e);
      if (p) {
        cols = p.c;
        rows = p.r;
        paint();
      }
    });
    grid.addEventListener("pointerup", (e) => {
      const p = cellAt(e);
      if (p) pick(p.c, p.r);
    });

    // Exact size, for anything bigger than the grid.
    const num = (name: string, init: number, max: number, set: (n: number) => void) =>
      new Setting(contentEl).setName(name).addText((t) => {
        t.inputEl.type = "number";
        t.inputEl.min = "1";
        t.inputEl.max = String(max);
        t.setValue(String(init)).onChange((v) => {
          set(clamp(Number(v), 1, max));
          paint();
        });
        t.inputEl.addEventListener("keydown", (e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            pick(cols, rows);
          }
        });
      });
    num("Columns", cols, MAX_COLS, (n) => (cols = n));
    num("Rows", rows, MAX_ROWS, (n) => (rows = n));
    new Setting(contentEl).addButton((b) =>
      b.setButtonText("Insert").setCta().onClick(() => pick(cols, rows))
    );
    paint();
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

/** Open the size picker, then put the table in `editor`. */
export function openTablePicker(
  app: App,
  editor: Editor,
  range?: { from: EditorPosition; to: EditorPosition }
): void {
  new TableSizeModal(app, (cols, rows) => insertTable(editor, cols, rows, range)).open();
}
