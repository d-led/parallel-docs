# `buffering-flow-synchronizer-approval-printer.ts` — parallel-docs

<!-- #region parallelDocs:bfap-role -->

## Role

This module turns **already synchronized** `HeightAdjustable[]` pairs into a **human-readable two-column ASCII matrix** used by approval tests. It is **not** the place to learn the synchronizer’s math — that lives in [buffering-flow-synchronizer.ts parallel-docs](../buffering-flow-synchronizer.ts/main.md).

Responsibilities here:

- Map each segment to **cells** (region header id vs generic body fill constant).
- Expand `bufferAbove` / `bufferBelow` into **vertical runs** of buffer-fill cells.
- **Zip** left and right token streams row-by-row (equal scroll depth is a precondition; the printer throws if not).
- **Post-process** the naive zip: merge diagonal “stagger” rows, patch special shapes, insert human **seams** (blank lines that do not add scroll height), split symmetric double-buffer rows, optional terminal one-sided ink duplication for readability.

<!-- #endregion parallelDocs:bfap-role -->

---

<!-- #region parallelDocs:bfap-tokens -->

## Token vocabulary (approval-only)

| Token / pattern | Meaning in fixtures                                                               |
| --------------- | --------------------------------------------------------------------------------- |
| `XXXX`          | Generic “body” ink in a cell (anonymous or continuation body).                    |
| `BBBB`          | One row of buffer slack from `bufferAbove` / `bufferBelow` stacking.              |
| `R{N}XX`        | Sync-region header id (must match `APPROVAL_REGION_TOKEN_RE` for header styling). |

**Invariant:** never place buffer fill in **both** cells on the **same** ASCII line — that would duplicate slack on one zip row. The printer splits such pairs into stagger. Tall columns may still show **many** consecutive buffer rows in **one** cell.

<!-- #endregion parallelDocs:bfap-tokens -->

---

<!-- #region parallelDocs:bfap-pipeline -->

## Pipeline (print one section)

One linear pass (details in source):

- Expand each column into scroll-depth **token rows**, remembering which **`HeightAdjustable`** owns each row (so later merges never cross block seams).
- **Zip** left and right to the same number of lines (must already match after sync; otherwise throw).
- **Collapse** naive zip: merge staggered ink/buffer pairs, apply a few special-case patches, optionally re-insert preview rows where anonymous blocks disappeared from the zip.
- **Human seams** — Insert blank lines between owner changes (visual only; not model slack), then minor coercions for spacing and terminal readability.
- **Last guard** — Split any remaining symmetric double-buffer line into stagger so goldens never show buffer in both cells on one row.

<!-- #endregion parallelDocs:bfap-pipeline -->

---

<!-- #region parallelDocs:bfap-related -->

## Related files

- [buffering-flow-synchronizer.approval.test.ts parallel-docs](../buffering-flow-synchronizer.approval.test.ts/main.md) — harness invariants and fixture layout rules.
- [block-stretch-buffer-sync.ts parallel-docs](../../../render/src/block-stretch-buffer-sync.ts/main.md) — real DOM: padding from `bufferAbove` / `bufferBelow` after sync.

<!-- #endregion parallelDocs:bfap-related -->
