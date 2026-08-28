/**
 * **Approval harness** for `BufferingFlowSynchronizer`: reads `*.input.txt` fixtures, parses grids to
 * `HeightAdjustable[]`, runs {@link BufferingFlowSynchronizer.synchronize}, prints ASCII via
 * `printApprovalSynchronizedFlow`, then snapshots with Approvals plus explicit invariants below.
 *
 * Maintainer orientation: diagrams, fixture naming, and how grid notation maps to the model live in
 * `.parallel-docs/source/packages/core/src/buffering-flow-synchronizer.approval.test.ts/main.md`.
 * Core math (abstract flows) is documented separately from approval vocabulary.
 *
 * After every case we assert:
 *
 * 1. **Equal column height after sync** — same total scroll lines left/right (`bufferAbove` + height +
 *    `bufferBelow` on every `HeightAdjustable`), so the zip grid has no dangling tail on one side.
 * 2. **Minimal buffering on one ASCII line** — never buffer fill in **both** cells on the same row (split
 *    into stagger). Multiple consecutive buffer-fill **rows** in one column are allowed when slack depth
 *    requires it (`assertNoSymmetricBufferSlackRowOnAnyLine`).
 * 3. **No cross-column “sync” for local blocks** — only sync-region ids (see `buffering-flow-synchronizer.ts`
 *    and `approval-flow-grid.ts`) participate in region height and start alignment; generic body fill and
 *    `__ANON__*` blocks stay local (not re-derived in this file).
 * 4. **One blank row for humans between blocks** — after each `HeightAdjustable` boundary (within a
 *    section), one full-width empty row in the grid so a reader can see block seams (not scroll slack).
 *    Never zero such seams between items, and never two consecutive all-blank rows **between** content
 *    (`assertSingleSpacerRowBetweenBlocks` — trailing file padding after the last ink row is allowed).
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { describe, it } from "vitest";
import type { HeightAdjustable } from "./height-adjustable.js";
import { BufferingFlowSynchronizer } from "./buffering-flow-synchronizer.js";
import {
  APPROVAL_BUFFER_FILL,
  APPROVAL_CELL_WIDTH as CELL_WIDTH,
  APPROVAL_FILLED_ROW as FILLED_ROW,
  inferApprovalGridFormatFromAscii,
  printApprovalSynchronizedFlow,
  type ApprovalGridFormat,
} from "./buffering-flow-synchronizer-approval-printer.js";
import { parseApprovalFlowSectionsWithFormat } from "./approval-flow-grid.js";

const require = createRequire(import.meta.url);

type ApprovalsApi = {
  configure(overrideOptions: { reporters?: string[] }): void;
  verify(
    dirName: string,
    testName: string,
    data: string,
    optionsOverride?: { approvedFileExtensionWithDot?: string; reporters?: string[] },
  ): void;
};

const approvals = require("approvals") as ApprovalsApi;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APPROVALS_DIR = path.join(__dirname, "buffering-flow-synchronizer.approvals");

/** Same formula as `BufferingFlowSynchronizer`: one scroll line per bufferAbove / body / bufferBelow unit. */
function columnScrollTotal(items: HeightAdjustable[]): number {
  return items.reduce((s, it) => s + it.bufferAbove + it.height + it.bufferBelow, 0);
}

type SyncedSection = { left: HeightAdjustable[]; right: HeightAdjustable[] };

/** Constraint (1): after sync, left and right must span the same number of abstract scroll rows. */
function assertSynchronizedSectionsHaveEqualColumnTotals(sections: SyncedSection[]): void {
  for (let i = 0; i < sections.length; i++) {
    const sec = sections[i];
    if (sec === undefined) continue;
    const tL = columnScrollTotal(sec.left);
    const tR = columnScrollTotal(sec.right);
    if (tL !== tR) {
      throw new Error(
        `Section ${String(i)}: synchronized flows must have equal column totals (left ${String(tL)} vs right ${String(tR)} scroll lines).`,
      );
    }
  }
}

/** Constraint (4): never two consecutive all-blank rows sandwiched between content (guards double human seams). */
function assertSingleSpacerRowBetweenBlocks(renderedGrid: string): void {
  const lines = renderedGrid.split("\n");
  for (let i = 1; i < lines.length; i++) {
    const current = lines[i];
    const previous = lines[i - 1];
    if (current === undefined || previous === undefined) continue;
    if (current.trim() !== "" || previous.trim() !== "") continue;
    const anyContentAbove = lines.slice(0, i - 1).some((l) => l.trim() !== "");
    const anyContentBelow = lines.slice(i + 1).some((l) => l.trim() !== "");
    if (anyContentAbove && anyContentBelow) {
      throw new Error(
        "Rendered grid must not use more than one spacer line between blocks (only XXXX, RnXX, BBBB rows are content).",
      );
    }
  }
}

/** Constraint (2): never `BBBB` in both cells on the same ASCII line (one zip row). */
function assertNoSymmetricBufferSlackRowOnAnyLine(
  renderedGrid: string,
  format: ApprovalGridFormat,
): void {
  const symmetricSlackRow = `${APPROVAL_BUFFER_FILL.padEnd(CELL_WIDTH)}${format.columnGap}${APPROVAL_BUFFER_FILL.padEnd(CELL_WIDTH)}`;
  for (const line of renderedGrid.split("\n")) {
    if (line === symmetricSlackRow) {
      throw new Error(
        `Rendered grid must not place ${APPROVAL_BUFFER_FILL} in both columns on one line (split to stagger).`,
      );
    }
  }
}

function isLeftOnlyStaggerRow(line: string, format: ApprovalGridFormat): boolean {
  if (line.trim().length === 0 || line.length !== format.rowDataLen) return false;
  const left = line.slice(0, CELL_WIDTH);
  const right = line.slice(CELL_WIDTH + format.columnGap.length, format.rowDataLen);
  return left.trim() === FILLED_ROW && right.trim() === "";
}

function isRightOnlyStaggerRow(line: string, format: ApprovalGridFormat): boolean {
  if (line.trim().length === 0 || line.length !== format.rowDataLen) return false;
  const left = line.slice(0, CELL_WIDTH);
  const right = line.slice(CELL_WIDTH + format.columnGap.length, format.rowDataLen);
  return left.trim() === "" && right.trim() === FILLED_ROW;
}

function isStaggerRow(line: string, format: ApprovalGridFormat): boolean {
  return isLeftOnlyStaggerRow(line, format) || isRightOnlyStaggerRow(line, format);
}

/**
 * Fixture layout (see `two-columns.anonymous-blocks-then-region.input.txt`):
 * one gap line per column between blocks (stagger pair and/or a single full-width blank between sections);
 * never a full-width blank immediately after a stagger row (avoids stacked double-gap in one column).
 */
function assertInputFixtureLayout(input: string): void {
  const format = inferApprovalGridFormatFromAscii(input);
  const lines = input
    .trimEnd()
    .split("\n")
    .map((line) => line.replace(/\r$/, ""));
  for (let i = 1; i < lines.length; i++) {
    const prev = lines[i - 1];
    const cur = lines[i];
    if (prev === undefined || cur === undefined) continue;
    if (prev.trim() === "" && cur.trim() === "") {
      throw new Error(
        "Fixture input: no consecutive blank lines; use one full-width blank between sections.",
      );
    }
    if (format.columnGap.length === 2 && isStaggerRow(prev, format) && cur.trim() === "") {
      throw new Error(
        "Fixture input: no full-width blank immediately after a stagger row; use the partner stagger row first (see two-columns.anonymous-blocks-then-region.input.txt).",
      );
    }
  }
}

function inputCaseFiles(): string[] {
  return fs
    .readdirSync(APPROVALS_DIR)
    .filter(
      (fileName) =>
        (fileName.startsWith("two-columns.") || fileName.startsWith("most-compact-")) &&
        fileName.includes(".input."),
    )
    .sort();
}

describe("BufferingFlowSynchronizer approvals", () => {
  approvals.configure({ reporters: ["donothing"] });

  for (const inputFileName of inputCaseFiles()) {
    it(`approves ${inputFileName}`, () => {
      const inputPath = path.join(APPROVALS_DIR, inputFileName);
      const input = fs.readFileSync(inputPath, "utf8");
      assertInputFixtureLayout(input);
      const { sections, format } = parseApprovalFlowSectionsWithFormat(input);
      const synchronizedSections = sections.map((sec) =>
        new BufferingFlowSynchronizer().synchronize(sec.left, sec.right),
      );
      const renderedGrid = printApprovalSynchronizedFlow(synchronizedSections, format);

      assertSynchronizedSectionsHaveEqualColumnTotals(synchronizedSections);
      assertSingleSpacerRowBetweenBlocks(renderedGrid);
      assertNoSymmetricBufferSlackRowOnAnyLine(renderedGrid, format);
    });
  }
});
