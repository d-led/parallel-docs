# Dual-pane scroll sync (normative)

This document states **required** behaviour for the **code + parallel-docs** dual-pane layout in static HTML (GitHub Pages, `parallel-docs serve`, any host). It is implemented in the `@parallel-docs/render` client bundle (`code-browser-client`).

## Monotonicity (no opposite motion)

Let the **driver** pane be the scroll surface whose `scroll` event initiated the current sync step. Let **partner** be the other pane. Let `driverDelta` be the signed change in the driver’s vertical scroll position for that event (positive = user scrolled **down** in content terms). Let `partnerBefore` / `partnerAfter` be the partner’s vertical scroll position immediately before and after applying the sync mapping.

**MUST:** If `driverDelta` is clearly non-zero (above implementation noise ε), the partner **MUST NOT** move in the opposite vertical direction:

- If the user scrolled **down** (`driverDelta > ε`), then `partnerAfter ≥ partnerBefore − ε` (partner does not jump **up**).
- If the user scrolled **up** (`driverDelta < −ε`), then `partnerAfter ≤ partnerBefore + ε` (partner does not jump **down**).

If a mapping would violate this rule, the implementation **MUST** restore the partner to `partnerBefore` for that step (reject the partner update).

**Rationale:** A backward jump in one column while intentionally scrolling the other reads as a bug (“fighting” the reader) and is especially confusing on tall pages and static hosts where there is no server to “fix up” state.

## Noise threshold ε

The concrete ε is `SCROLL_SYNC_MONOTONIC_EPS` in `packages/render/src/code-browser-scroll-sync-monotonic.ts`, shared with Vitest so the contract does not drift. Sub-pixel and wheel quantization may produce tiny `driverDelta` values; those **MUST NOT** trigger monotonic enforcement (avoids spurious reverts).

## Driver coalescing (cascade control)

Native `scroll` events can arrive in **rapid bursts** (trackpad, layout). Block-aware sync can change the partner in a way that would, without batching, schedule **multiple** opposite-direction updates in the same gesture (one-armed-bandit feel).

**SHOULD:** The wiring that listens on the driver pane **SHOULD** coalesce those events so the partner receives **at most one** sync application per animation frame per driver pane (e.g. cancel/reschedule a single `requestAnimationFrame` flush). Partner programmatic scrolls **SHOULD** be ignored as **drivers** for a short **wall-clock window** (not a fixed small event count): a single gesture can emit many `scroll` events, and a tiny budget lets the opposite pane treat the tail as user input (doc↔code ping-pong).

## Relationship to block sync and proportional fallback

Block-aware sync, proportional sync, and mobile single-pane flip are **orthogonal** to this rule: whichever algorithm computes the partner target, the monotonicity check applies **after** that target is applied to the partner scroll position.

## Source gaps and markdown inter-marker gaps

Indexed blocks expose half-open source spans `[lo, hiExclusive)` per block. When the **source** viewport top falls **outside** every such span (a true gap between regions, including after the last span), the companion **MUST NOT** snap to the “nearest preceding” block head — that produces large backward jumps (e.g. parallel-docs jumping to the top while the reader scrolls **down** through blank source). In those gaps the client **MUST** use the same proportional mirror mapping as the no-index fallback (`mirrorI` / `mirrorW`).

To avoid **block ↔ gap** flicker when the probe jitters at `hiExclusive`, the client **SHOULD** keep the last snapped block active for a small **trailing slack** (a few source lines after `hiExclusive`) before switching to gap mirror, and clear that lock only once the viewport is clearly past that slack.

ParallelDocs-driven sync **SHOULD** continue to use the block whose marker is at or above the doc probe for normal companion prose between markers; that prose is not a “gap” in the source sense above.

When the source pane shows **rendered Markdown** (`code-md-line-*` anchors), code→doc **SHOULD** still use the same block-aware mapping as raw `code-line-*` mode: viewport line probes are sparser (blank lines, fences, tables omit per-line anchors), but the **block trailing slack** above prevents block↔gap flicker when the probe lands in fenced/table neighborhoods inside a block. True inter-block gaps fall back to proportional mirror per the source-gap rule above.

## Non-goals

- This spec does **not** require perfect line-by-line lockstep; it only forbids opposite-direction partner motion on a decisive driver step.
- It does **not** apply to unrelated scroll surfaces (e.g. search results) unless they participate in the same bidirectional sync wiring.

## Scroll-behavior on dual-pane scrollports

**MUST NOT** set `scroll-behavior: smooth` on `#code-pane` / `#doc-pane-body`: smooth interpolation multiplies programmatic `scroll` events and defeats the partner echo window above. Keep the default **`auto`**.
