/**
 * Fired from the inline Mermaid bootstrap emitted by {@link ./mermaid-runtime-html.ts}
 * immediately after `globalThis.sidetrackMermaid` is assigned — before optional `mermaid.run`.
 * The browser client may enqueue {@link ./code-browser-client.ts} work earlier (e.g. Cypress flips
 * panes right after `load`); this event lets that work run once the vendored build has loaded.
 */
export const SIDETRACK_MERMAID_MODULE_READY_EVENT = "sidetrack-mermaid-module-ready";
