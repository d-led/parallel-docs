/**
 * Inline layout stylesheet for {@link renderSideBySideHtml}.
 * Kept in TypeScript (not a separate `.css` + emit step) so `tsc` and the CLI’s
 * bundled CJS build never depend on `import.meta.url` or filesystem layout.
 */
export const SIDE_BY_SIDE_LAYOUT_CSS = `:root {
  color-scheme: light dark;
}

html {
  background: Canvas;
  color: CanvasText;
}

body {
  margin: 0;
  font-family:
    system-ui,
    -apple-system,
    "Segoe UI",
    Roboto,
    sans-serif;
  background: Canvas;
  color: CanvasText;
}

.layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  min-height: 100vh;
}

.pane {
  overflow: auto;
  padding: 16px;
  border-right: 1px solid color-mix(in oklab, CanvasText 20%, Canvas);
}

.pane:last-child {
  border-right: none;
}

.pane h2 {
  margin-top: 0;
  font-size: 14px;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  opacity: 0.8;
}

pre {
  margin: 0;
}

.parallel-docs {
  font-size: 15px;
  line-height: 1.45;
}

.parallel-docs img {
  max-width: 100%;
  height: auto;
}

.parallelDocs :where(table) {
  width: max-content;
  max-width: none;
  border-collapse: collapse;
  margin: 0.85em 0;
}

.parallelDocs :where(th, td) {
  border: 1px solid color-mix(in oklab, CanvasText 22%, Canvas);
  padding: 8px 12px;
  vertical-align: top;
}

.parallelDocs :where(thead th) {
  font-weight: 600;
  background: color-mix(in oklab, CanvasText 7%, Canvas);
}

.parallel-docs tbody tr:nth-child(even) :where(td) {
  background: color-mix(in oklab, CanvasText 3.5%, Canvas);
}

.parallelDocs :where(ul.contains-task-list) {
  list-style: none;
  padding-inline-start: 1.2em;
}

.parallelDocs :where(li.task-list-item) {
  position: relative;
}

.parallelDocs :where(li.task-list-item input[type="checkbox"]) {
  position: absolute;
  margin-inline-start: -1.35em;
  margin-top: 0.2em;
}

.parallelDocs :where(del) {
  opacity: 0.82;
}

.parallelDocs :where(section.footnotes) {
  margin-top: 1.5em;
  padding-top: 0.75em;
  border-top: 1px solid color-mix(in oklab, CanvasText 18%, Canvas);
  font-size: 0.92em;
}
`;
