export type WideIntroStep = {
  targetSelector?: string;
  targetSelectors?: string[];
  title: string;
  body: string;
  fallbackActionLabel?: string;
  fallbackAction?: () => void;
};

export function wideIntroStepsForShell(
  shell: HTMLElement,
  isNarrowViewport: boolean,
): WideIntroStep[] {
  const introTargetSelector = isNarrowViewport ? "#mobile-pane-flip" : "#shell";
  const shellSelector =
    shell.id.trim().length > 0 && typeof globalThis.CSS?.escape === "function"
      ? `#${globalThis.CSS.escape(shell.id)}`
      : "#shell";
  const shellOrIntroTargetSelector =
    introTargetSelector === "#shell" ? shellSelector : introTargetSelector;
  return [
    {
      targetSelectors: isNarrowViewport
        ? [shellOrIntroTargetSelector]
        : ["#code-pane", "#doc-pane"],
      title: "Welcome",
      body: "Welcome to parallel-docs, a system to create and view commentaries next to the source tree. Angles are different aspects of these commentaries, so switch between them and keep scrolling while both panes stay aligned.",
    },
    {
      targetSelectors: isNarrowViewport
        ? [shellOrIntroTargetSelector]
        : ["#code-pane", "#doc-pane"],
      title: "Two views",
      body: isNarrowViewport
        ? "You are in narrow view now. Use the pane flip to switch code and parallel-docs. Wide view shows both panes side by side."
        : "You are in wide view now. It shows code and parallel-docs side by side. Narrow view uses one pane and a flip control.",
    },
    {
      targetSelectors: isNarrowViewport
        ? ["#mobile-pane-flip", "#doc-pane"]
        : ["#code-pane", "#doc-pane"],
      title: isNarrowViewport ? "Scroll and toggle" : "Scroll both panes",
      body: isNarrowViewport
        ? "Try scrolling parallel-docs, then use the pane flip to switch to source and keep exploring."
        : "Try scrolling in either pane. Source and parallel-docs stay aligned while you read side by side.",
    },
    {
      targetSelector: "#search-q",
      title: "Search quickly",
      body: "Use this search input to jump to documented source lines and markdown snippets.",
    },
    {
      targetSelector: "#angle-select",
      title: "Angle switch",
      body: "Change the ParallelDocs angle to view a different narrative for this same source file.",
    },
    {
      targetSelector: "#source-markdown-pane-flip",
      title: "Source view mode",
      body: "Toggle between raw source and rendered markdown in the source pane.",
    },
    {
      targetSelector: "#wrap-lines",
      title: "Readability controls",
      body: "Wrap lines to reduce horizontal scrolling in both source and parallel-docs panes.",
      fallbackActionLabel: "Switch to markdown source",
      fallbackAction: () => {
        const sourceModeFlip = document.getElementById("source-markdown-pane-flip");
        if (sourceModeFlip instanceof HTMLButtonElement) sourceModeFlip.click();
      },
    },
    {
      targetSelector: "#parallel-docs-theme-trigger",
      title: "Appearance",
      body: "Change theme mode from this trigger (menu on left-click, quick cycle on right-click).",
    },
    {
      targetSelector: "#parallel-docs-share-link",
      title: "Share this view",
      body: "Use this link button to copy a shareable permalink to the exact page and state you are viewing.",
    },
    {
      targetSelector: "#parallel-docs-help-tour",
      title: "Need a refresher?",
      body: "You can always go back to this tutorial via the help button.",
    },
  ];
}

function wideIntroTargetsForCurrentStep(steps: WideIntroStep[], current: number): HTMLElement[] {
  const step = steps[current];
  if (!step) return [];
  const selectors =
    Array.isArray(step.targetSelectors) && step.targetSelectors.length > 0
      ? step.targetSelectors
      : step.targetSelector
        ? [step.targetSelector]
        : [];
  const targets: HTMLElement[] = [];
  const seen = new Set<HTMLElement>();
  for (const selector of selectors) {
    const found = document.querySelector(selector);
    if (!(found instanceof HTMLElement) || seen.has(found)) continue;
    seen.add(found);
    targets.push(found);
  }
  return targets;
}

function isWideIntroTargetVisible(target: HTMLElement): boolean {
  if (target.hidden) return false;
  const style = globalThis.getComputedStyle(target);
  if (style.display === "none" || style.visibility === "hidden") return false;
  const rect = target.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

export function wideIntroVisibleTargetsForCurrentStep(
  steps: WideIntroStep[],
  current: number,
): HTMLElement[] {
  return wideIntroTargetsForCurrentStep(steps, current).filter((target) =>
    isWideIntroTargetVisible(target),
  );
}
