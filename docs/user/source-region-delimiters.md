# Source region delimiters (by editor language)

When a block uses a **`marker:<id>`** anchor, the **primary file** must contain a **paired start and end** so tools can find the span without fragile line numbers. The **VS Code / Cursor extension** command **“Add side-track block from selection”** wraps the selected **full lines** using the active document’s **`languageId`** (same rule as `sidetrack convert-source-markers --language …`).

**Normative implementation:** [`sidetrackRegionInsertions`](../../packages/core/src/source-markers.ts) in `@sidetrack/core` — this page is a human-readable map; if they disagree, the code wins.

## What you see in the Markdown heading

The companion file may show a heading like **`lines 10–20`**. That is **authoring shorthand** for “what was selected when the block was created.” The **real** link to the source is the **`marker:`** anchor plus the **delimiters below**, not that heading.

## Table: delimiter family by convention

Each row is one **region convention**. The **“Typical `languageId` values”** column lists common VS Code language identifiers that pick that row (case-insensitive). Anything **not** listed falls through to **generic `//` markers** (`generic-line`).

| Convention                    | Typical VS Code `languageId` values                                                                                                                    | Start delimiter                   | End delimiter                        |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------- | ------------------------------------ |
| **HTML comments**             | `html`, `xml`, `markdown`, `md`, `handlebars`, `vue-html`                                                                                              | `<!-- #region sidetrack:<id> -->` | `<!-- #endregion sidetrack:<id> -->` |
| **`//` #region**              | `javascript`, `javascriptreact`, `typescript`, `typescriptreact`, `js`, `jsx`, `tsx`, `mjs`, `cjs`, `vue`, `svelte`, `astro`, `scss`, `less`, `stylus` | `//#region sidetrack:<id>`        | `//#endregion sidetrack:<id>`        |
| **`#region` (hash)**          | `ruby`, `csharp`, `coffeescript`, `powershell`, `perl`, `raku`, `crystal`                                                                              | `#region sidetrack:<id>`          | `#endregion sidetrack:<id>`          |
| **`#pragma region`**          | `c`, `cpp`, `cuda-cpp`, `objective-c`, `objective-cpp`                                                                                                 | `#pragma region sidetrack:<id>`   | `#pragma endregion sidetrack:<id>`   |
| **VB**                        | `vb`                                                                                                                                                   | `#Region sidetrack:<id>`          | `#End Region sidetrack:<id>`         |
| **Python**                    | `python`, `jupyter`                                                                                                                                    | `# region sidetrack:<id>`         | `# endregion sidetrack:<id>`         |
| **Lua**                       | `lua`                                                                                                                                                  | `--#region sidetrack:<id>`        | `--#endregion sidetrack:<id>`        |
| **Generic `#` line comment**  | `toml`, `yaml`, `yml`, `dockerfile`, `makefile`, `cmake`, `ini`, `properties`, `git-commit`, `sql`, `r`, `shellscript`, `bash`, `sh`, `zsh`, `fish`    | `# sidetrack:start id=<id>`       | `# sidetrack:end id=<id>`            |
| **CSS block comment**         | `css`                                                                                                                                                  | `/* sidetrack:start id=<id> */`   | `/* sidetrack:end id=<id> */`        |
| **Generic `//` line comment** | _default_ (e.g. `rust`, `go`, `java`, `kotlin`, …)                                                                                                     | `// sidetrack:start id=<id>`      | `// sidetrack:end id=<id>`           |

Replace **`<id>`** with the same token as **`marker:<id>`** in `index.json` and `<!-- sidetrack:block id=<id> -->` in the companion Markdown.

**Indentation:** the extension copies **leading spaces/tabs from the first selected line** and applies it to both delimiter lines so nested code stays aligned.

## Related

- [Anchor grammar](../spec/anchors.md) — `lines:`, `symbol:`, `marker:` string forms in the index.
- [Blocks — source markers](../spec/blocks.md#source-markers-language-dependent) — narrative + Region Marker link.
- [Keeping blocks in sync](keeping-blocks-in-sync.md) — checklist when renaming or moving blocks.
