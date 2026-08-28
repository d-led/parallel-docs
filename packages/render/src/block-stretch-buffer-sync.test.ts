import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";

import { applyBlockStretchRowBuffers } from "./block-stretch-buffer-sync.js";

function fakeDomRect(height: number): DOMRect {
  return {
    x: 0,
    y: 0,
    width: 100,
    height,
    top: 0,
    left: 0,
    bottom: height,
    right: 100,
    toJSON(): Record<string, never> {
      return {};
    },
  } as DOMRect;
}

describe("applyBlockStretchRowBuffers", () => {
  it("pads the shorter side so both cells reach the shared region height", () => {
    const dom = new JSDOM(
      `<!doctype html><html><body>
        <table class="block-stretch"><tbody>
        <tr class="stretch-row stretch-row--block" data-sidetrack-stretch-sync-id="r1">
          <td class="stretch-code"><div class="stretch-cell-measure"><div class="stretch-code-stack"></div></div></td>
          <td class="stretch-doc"><div class="stretch-cell-measure"><div class="stretch-doc-inner"></div></div></td>
        </tr>
      </tbody></table></body></html>`,
      { pretendToBeVisual: true },
    );
    const { document } = dom.window;
    const table = document.querySelector("table");
    if (!(table instanceof dom.window.HTMLTableElement)) throw new Error("table");

    const stack = table.querySelector(".stretch-code-stack");
    const docInner = table.querySelector(".stretch-doc-inner");
    if (!(stack instanceof dom.window.HTMLElement)) throw new Error("stack");
    if (!(docInner instanceof dom.window.HTMLElement)) throw new Error("doc inner");
    stack.getBoundingClientRect = () => fakeDomRect(20);
    docInner.getBoundingClientRect = () => fakeDomRect(44);

    applyBlockStretchRowBuffers(table);

    const codeTd = table.querySelector("td.stretch-code");
    const docTd = table.querySelector("td.stretch-doc");
    if (!(codeTd instanceof dom.window.HTMLTableCellElement)) throw new Error("code td");
    if (!(docTd instanceof dom.window.HTMLTableCellElement)) throw new Error("doc td");

    expect(codeTd.style.paddingBottom).toBe("24px");
    expect(docTd.style.paddingBottom).toBe("");
  });

  it("does not leave terminal bottom slack on the last stretch row", () => {
    const dom = new JSDOM(
      `<!doctype html><html><body>
        <table class="block-stretch"><tbody>
        <tr class="stretch-row stretch-row--block" data-sidetrack-stretch-sync-id="r1">
          <td class="stretch-code"><div class="stretch-cell-measure"><div class="stretch-code-stack"></div></div></td>
          <td class="stretch-doc"><div class="stretch-cell-measure"><div class="stretch-doc-inner"></div></div></td>
        </tr>
        <tr class="stretch-row stretch-row--gap" data-sidetrack-stretch-sync-id="__gap__0">
          <td class="stretch-code"><div class="stretch-cell-measure"><div class="stretch-code-stack"></div></div></td>
          <td class="stretch-doc"><div class="stretch-cell-measure"><div class="stretch-doc-inner"></div></div></td>
        </tr>
      </tbody></table></body></html>`,
      { pretendToBeVisual: true },
    );
    const { document } = dom.window;
    const table = document.querySelector("table");
    if (!(table instanceof dom.window.HTMLTableElement)) throw new Error("table");

    const codeStacks = table.querySelectorAll(".stretch-code-stack");
    const docInners = table.querySelectorAll(".stretch-doc-inner");
    const topCode = codeStacks[0];
    const tailCode = codeStacks[1];
    const topDoc = docInners[0];
    const tailDoc = docInners[1];
    if (!(topCode instanceof dom.window.HTMLElement)) throw new Error("top code stack");
    if (!(tailCode instanceof dom.window.HTMLElement)) throw new Error("tail code stack");
    if (!(topDoc instanceof dom.window.HTMLElement)) throw new Error("top doc inner");
    if (!(tailDoc instanceof dom.window.HTMLElement)) throw new Error("tail doc inner");

    topCode.getBoundingClientRect = () => fakeDomRect(120);
    topDoc.getBoundingClientRect = () => fakeDomRect(40);
    tailCode.getBoundingClientRect = () => fakeDomRect(20);
    tailDoc.getBoundingClientRect = () => fakeDomRect(20);

    applyBlockStretchRowBuffers(table);

    const rows = table.querySelectorAll("tr.stretch-row");
    const lastRow = rows[rows.length - 1];
    if (!(lastRow instanceof dom.window.HTMLTableRowElement)) throw new Error("last row");
    const lastCode = lastRow.querySelector("td.stretch-code");
    const lastDoc = lastRow.querySelector("td.stretch-doc");
    if (!(lastCode instanceof dom.window.HTMLTableCellElement)) throw new Error("last code td");
    if (!(lastDoc instanceof dom.window.HTMLTableCellElement)) throw new Error("last doc td");

    expect(lastCode.style.paddingBottom).toBe("");
    expect(lastDoc.style.paddingBottom).toBe("");
  });
});
