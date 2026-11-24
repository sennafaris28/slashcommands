import { Editor, Plugin, PluginSettingTab, Setting } from "obsidian";
import { SlashSuggest } from "./slash";
import { insertTable, openTablePicker } from "./table";
import { codeLanguagePicker } from "./codelang-view";
import { handlePaste, PasteLinkMode } from "./pastelink-view";

interface SlashSettings {
  /** The "/" menu itself. */
  slashMenu: boolean;
  /** "Insert table…" in the editor's right-click menu. */
  tableInContextMenu: boolean;
  /** Language chip + dropdown on each code block. */
  codeLanguagePicker: boolean;
  /** Pasting a lone URL: ask (URL or page title), always the title, or plain URL. */
  pasteLinks: PasteLinkMode;
}

const DEFAULT_SETTINGS: SlashSettings = {
  slashMenu: true,
  tableInContextMenu: true,
  codeLanguagePicker: true,
  pasteLinks: "ask",
};

/** What other plugins can call: `app.plugins.plugins.slashcommands.api`. */
export interface SlashCommandsApi {
  /** Open the table size picker, then insert the table into `editor`. */
  openTablePicker(editor: Editor): void;
  /** Insert a `cols` × `rows` table (first row is the header) at the cursor. */
  insertTable(editor: Editor, cols: number, rows: number): void;
}

export default class SlashCommandsPlugin extends Plugin {
  settings: SlashSettings = { ...DEFAULT_SETTINGS };

  api: SlashCommandsApi = {
    openTablePicker: (editor) => openTablePicker(this.app, editor),
    insertTable: (editor, cols, rows) => insertTable(editor, cols, rows),
  };

  async onload(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());

    // The "/" menu: headings, to-do, lists, toggle, quote, divider, callout, code, table, date.
    this.registerEditorSuggest(new SlashSuggest(this.app, () => this.settings.slashMenu));

    // Table size picker: command palette + editor right-click menu.
    this.addCommand({
      id: "insert-table",
      name: "Insert table…",
      editorCallback: (editor) => openTablePicker(this.app, editor),
    });
    this.registerEvent(
      this.app.workspace.on("editor-menu", (menu, editor) => {
        if (!this.settings.tableInContextMenu) return;
        menu.addItem((i) =>
          i.setTitle("Insert table…").setIcon("table").onClick(() => openTablePicker(this.app, editor))
        );
      })
    );

    // Language chip on each code block: pick a language instead of typing it after the backticks.
    this.registerEditorExtension(codeLanguagePicker(() => this.settings.codeLanguagePicker));

    // Paste a URL → keep it, or turn it into [Page title](url).
    this.registerEvent(
      this.app.workspace.on("editor-paste", (evt, editor) => handlePaste(this.app, evt, editor, this.settings.pasteLinks))
    );

    this.addSettingTab(new SlashSettingTab(this));
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }
}

class SlashSettingTab extends PluginSettingTab {
  constructor(private plugin: SlashCommandsPlugin) {
    super(plugin.app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl)
      .setName("Slash menu")
      .setDesc(
        "Type / at the start of a line (or after a space) for a menu of blocks, then keep typing to filter: " +
          "/h1 /h2 /h3, /todo, /bullet, /num, /toggle, /quote, /divider, /callout, /code, /table (or /table 4x6), /date. " +
          "Turn this off if you use Obsidian's core Slash commands plugin — the two would both open."
      )
      .addToggle((t) =>
        t.setValue(this.plugin.settings.slashMenu).onChange(async (v) => {
          this.plugin.settings.slashMenu = v;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName("“Insert table…” in the right-click menu")
      .setDesc("Adds the table size picker to the editor's context menu. The command palette entry stays either way.")
      .addToggle((t) =>
        t.setValue(this.plugin.settings.tableInContextMenu).onChange(async (v) => {
          this.plugin.settings.tableInContextMenu = v;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName("Code block language picker")
      .setDesc(
        "Shows the language on each code block's first line; click it to pick one from a searchable list " +
          "instead of typing it after the backticks. Choosing a language just writes it after the ``` for you."
      )
      .addToggle((t) =>
        t.setValue(this.plugin.settings.codeLanguagePicker).onChange(async (v) => {
          this.plugin.settings.codeLanguagePicker = v;
          await this.plugin.saveSettings();
          this.plugin.app.workspace.updateOptions(); // redraw open editors now
        })
      );

    new Setting(containerEl)
      .setName("Pasted links")
      .setDesc(
        "When you paste a lone URL. Ask: a small menu offers Keep URL or Page title. " +
          "Page title fetches the page and writes [Its title](url). Only the page you pasted is contacted, " +
          "and only when a title is wanted. Code, inline code, frontmatter and hand-written links are left alone."
      )
      .addDropdown((d) =>
        d
          .addOptions({ ask: "Ask each time", title: "Always page title", url: "Always keep URL" })
          .setValue(this.plugin.settings.pasteLinks)
          .onChange(async (v) => {
            this.plugin.settings.pasteLinks = v as PasteLinkMode;
            await this.plugin.saveSettings();
          })
      );

    containerEl.createEl("p", {
      cls: "setting-item-description",
      text: "The slash menu stays quiet inside code blocks, inline code and frontmatter, and never opens in URLs, “and/or” or fractions. The date block inserts today as dd/mm/yyyy.",
    });
  }
}
