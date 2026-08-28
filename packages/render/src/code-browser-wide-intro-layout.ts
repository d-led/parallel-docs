function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

export function repositionWideIntroBubble(bubble: HTMLElement, target: HTMLElement): void {
  const rect = target.getBoundingClientRect();
  const vw = globalThis.innerWidth;
  const vh = globalThis.innerHeight;
  const bubbleRect = bubble.getBoundingClientRect();
  const bubbleWidth = bubbleRect.width > 0 ? bubbleRect.width : 340;
  const bubbleHeight = bubbleRect.height > 0 ? bubbleRect.height : 160;
  const margin = 8;
  const canPlaceBelow = rect.bottom + 12 + bubbleHeight <= vh - margin;
  const top = canPlaceBelow
    ? Math.max(margin, rect.bottom + 12)
    : Math.max(margin, rect.top - bubbleHeight - 12);
  const left = clamp(rect.left, margin, vw - bubbleWidth - margin);
  bubble.style.top = `${String(Math.round(top))}px`;
  bubble.style.left = `${String(Math.round(left))}px`;
  bubble.dataset.side = canPlaceBelow ? "below" : "above";
  const pointerLeft = clamp(rect.left + rect.width / 2 - left - 8, 10, bubbleWidth - 22);
  bubble.style.setProperty("--pointer-left", `${String(Math.round(pointerLeft))}px`);
}

export function renderWideIntroArrows(
  bubble: HTMLElement,
  arrowLayer: HTMLElement,
  targets: HTMLElement[],
): void {
  arrowLayer.replaceChildren();
  if (targets.length === 0) return;

  const bubbleRect = bubble.getBoundingClientRect();
  const bubbleCenterX = bubbleRect.left + bubbleRect.width / 2;
  const bubbleCenterY = bubbleRect.top + bubbleRect.height / 2;
  const edgePadding = 12;
  const sideInset = 8;
  const spread = 12;
  const side = bubble.dataset.side;
  const pointerLeftRaw = Number.parseFloat(bubble.style.getPropertyValue("--pointer-left"));
  const pointerCenterX = Number.isFinite(pointerLeftRaw)
    ? bubbleRect.left + pointerLeftRaw + 8
    : bubbleCenterX;
  const pointerTipY =
    side === "below"
      ? bubbleRect.top - sideInset
      : side === "above"
        ? bubbleRect.bottom + sideInset
        : bubbleCenterY;

  for (const [index, target] of targets.entries()) {
    const rect = target.getBoundingClientRect();
    // Point to the middle of each target element.
    const endX = rect.left + rect.width / 2;
    const endY = rect.top + rect.height / 2;
    const toTargetX = endX - bubbleCenterX;
    const toTargetY = endY - bubbleCenterY;
    const horizontalDominant = Math.abs(toTargetX) >= Math.abs(toTargetY);
    const spreadOffset = index - (targets.length - 1) / 2;

    let startX: number;
    let startY: number;
    if (targets.length === 1 && (side === "below" || side === "above")) {
      // Single-target tours look cleaner when the arrow starts from the bubble pointer notch.
      startX = pointerCenterX;
      startY = pointerTipY;
    } else if (horizontalDominant) {
      startX = toTargetX >= 0 ? bubbleRect.right + sideInset : bubbleRect.left - sideInset;
      startY = clamp(
        endY + spreadOffset * spread,
        bubbleRect.top + edgePadding,
        bubbleRect.bottom - edgePadding,
      );
    } else {
      startY = toTargetY >= 0 ? bubbleRect.bottom + sideInset : bubbleRect.top - sideInset;
      startX = clamp(
        endX + spreadOffset * spread,
        bubbleRect.left + edgePadding,
        bubbleRect.right - edgePadding,
      );
    }

    const dx = endX - startX;
    const dy = endY - startY;
    const length = Math.hypot(dx, dy);
    if (!Number.isFinite(length) || length < 12) continue;

    const arrow = document.createElement("span");
    arrow.className = "parallel-docs-wide-intro-arrow";
    arrow.style.left = `${String(Math.round(startX))}px`;
    arrow.style.top = `${String(Math.round(startY))}px`;
    arrow.style.width = `${String(Math.round(length))}px`;
    arrow.style.setProperty("--wide-intro-arrow-angle", `${String(Math.atan2(dy, dx))}rad`);
    const head = document.createElement("span");
    head.className = "parallel-docs-wide-intro-arrow-head";
    arrow.appendChild(head);
    arrowLayer.appendChild(arrow);
  }
}
