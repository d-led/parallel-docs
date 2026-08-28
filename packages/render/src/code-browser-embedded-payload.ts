/**
 * Read base64-embedded raw source + side-track markdown from the static HTML shell.
 *
 * Older pages put `data-raw-*-b64` on `#code-pane`; current markup puts them on `#shell`.
 */
export function readEmbeddedRawB64Strings(
  shell: Pick<HTMLElement, "getAttribute">,
  codePane: Pick<HTMLElement, "getAttribute">,
): { rawCodeB64: string; rawMdB64: string } {
  function pick(name: string): string {
    const fromShell = shell.getAttribute(name);
    if (fromShell !== null && fromShell.trim() !== "") return fromShell;
    return codePane.getAttribute(name)?.trim() ?? "";
  }
  return {
    rawCodeB64: pick("data-raw-code-b64"),
    rawMdB64: pick("data-raw-md-b64"),
  };
}
