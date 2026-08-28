# SideTrack VS Code dogfood fixture

Minimal workspace opened by `npm run extension:dogfood` when no folder argument is passed (see `scripts/editor-extension.sh`).

1. `npm run extension:dogfood` — build and install the extension from this repo, then open this folder in the editor.
2. Open `src/sample.ts` (primary source lives next to `README.md`, not under `.sidetrack/`).
3. Command Palette → **SideTrack: Open paired markdown beside editor**.
4. Paired `.sidetrack/source/src/sample.ts.md` is created on demand, with scroll sync from the code editor to the Markdown.
