import {
  renderWideIntroArrows,
  repositionWideIntroBubble,
} from "./code-browser-wide-intro-layout.js";
import {
  type WideIntroStep,
  wideIntroStepsForShell,
  wideIntroVisibleTargetsForCurrentStep,
} from "./code-browser-wide-intro-steps.js";
import {
  clearOpenWideModeIntroTourUi,
  createWideIntroElements,
  type WideIntroElements,
} from "./code-browser-wide-intro-ui.js";
import { readWebStorageItem, writeWebStorageItem } from "./code-browser-web-storage.js";

const STORAGE_WIDE_MODE_INTRO_DONE = "sidetrack.codeSideTrackStatic.wideModeIntro.v1";

type WideIntroRuntime = {
  shell: HTMLElement;
  steps: WideIntroStep[];
  viewportMode: "narrow" | "wide";
  current: number;
  highlighted: HTMLElement[];
  elements: WideIntroElements;
  isNarrowViewport: () => boolean;
};

function refreshWideIntroSteps(runtime: WideIntroRuntime): void {
  const nextMode: "narrow" | "wide" = runtime.isNarrowViewport() ? "narrow" : "wide";
  if (nextMode === runtime.viewportMode) return;
  runtime.viewportMode = nextMode;
  runtime.steps = wideIntroStepsForShell(runtime.shell, nextMode === "narrow");
}

function repositionWideIntro(runtime: WideIntroRuntime): void {
  const { bubble, arrowLayer } = runtime.elements;
  refreshWideIntroSteps(runtime);
  const targets = wideIntroVisibleTargetsForCurrentStep(runtime.steps, runtime.current);
  const primary = targets[0];
  if (!primary) {
    bubble.dataset.side = "none";
    bubble.style.top = "12px";
    bubble.style.left = "12px";
    arrowLayer.replaceChildren();
    return;
  }
  repositionWideIntroBubble(bubble, primary);
  renderWideIntroArrows(bubble, arrowLayer, targets);
}

function advanceWideIntroToRenderableStep(runtime: WideIntroRuntime): void {
  refreshWideIntroSteps(runtime);
  while (runtime.current < runtime.steps.length) {
    const step = runtime.steps[runtime.current];
    if (!step) break;
    const visibleTargets = wideIntroVisibleTargetsForCurrentStep(runtime.steps, runtime.current);
    const hasFallbackAction = typeof step.fallbackAction === "function";
    if (visibleTargets.length > 0 || hasFallbackAction) break;
    runtime.current++;
  }
}

function syncWideIntroStepActionUi(
  runtime: WideIntroRuntime,
  step: WideIntroStep,
  targets: HTMLElement[],
): void {
  const { stepActionBtn } = runtime.elements;
  if (
    targets.length === 0 &&
    typeof step.fallbackAction === "function" &&
    step.fallbackActionLabel
  ) {
    stepActionBtn.hidden = false;
    stepActionBtn.textContent = step.fallbackActionLabel;
    stepActionBtn.disabled = false;
    return;
  }
  stepActionBtn.hidden = true;
  stepActionBtn.textContent = "";
  stepActionBtn.disabled = true;
}

function renderWideIntro(runtime: WideIntroRuntime, closeTour: () => void): void {
  const { titleEl, bodyEl, progressEl, backBtn, nextBtn } = runtime.elements;
  advanceWideIntroToRenderableStep(runtime);
  if (runtime.current >= runtime.steps.length) {
    closeTour();
    return;
  }
  const step = runtime.steps[runtime.current];
  if (!step) return;
  const targets = wideIntroVisibleTargetsForCurrentStep(runtime.steps, runtime.current);
  for (const el of runtime.highlighted) el.classList.remove("sidetrack-wide-intro-target");
  runtime.highlighted = targets;
  for (const el of runtime.highlighted) el.classList.add("sidetrack-wide-intro-target");
  titleEl.textContent = step.title;
  bodyEl.textContent = step.body;
  syncWideIntroStepActionUi(runtime, step, targets);
  progressEl.textContent = `${String(runtime.current + 1)} / ${String(runtime.steps.length)}`;
  backBtn.disabled = runtime.current === 0;
  nextBtn.textContent = runtime.current === runtime.steps.length - 1 ? "Done" : "Next";
  repositionWideIntro(runtime);
}

export function wireWideModeIntroTour(
  shell: HTMLElement,
  isNarrowViewport: () => boolean,
  opts?: { force?: boolean },
): void {
  if (!opts?.force && readWebStorageItem(localStorage, STORAGE_WIDE_MODE_INTRO_DONE) === "1")
    return;
  clearOpenWideModeIntroTourUi();

  const elements = createWideIntroElements();
  if (!elements) return;
  const runtime: WideIntroRuntime = {
    shell,
    steps: wideIntroStepsForShell(shell, isNarrowViewport()),
    viewportMode: isNarrowViewport() ? "narrow" : "wide",
    current: 0,
    highlighted: [],
    elements,
    isNarrowViewport,
  };
  const { bubble, arrowLayer, stepActionBtn, backBtn, nextBtn, skipBtn } = runtime.elements;

  const closeTour = (): void => {
    for (const el of runtime.highlighted) el.classList.remove("sidetrack-wide-intro-target");
    runtime.highlighted = [];
    arrowLayer.remove();
    bubble.remove();
    globalThis.removeEventListener("resize", onResize);
    globalThis.removeEventListener("scroll", reposition, true);
    document.removeEventListener("keydown", onKeyDown, true);
    writeWebStorageItem(localStorage, STORAGE_WIDE_MODE_INTRO_DONE, "1");
  };

  const reposition = (): void => {
    repositionWideIntro(runtime);
  };

  const render = (): void => {
    renderWideIntro(runtime, closeTour);
  };

  const onResize = (): void => {
    render();
  };

  const onKeyDown = (ev: KeyboardEvent): void => {
    if (ev.key !== "Escape") return;
    ev.preventDefault();
    closeTour();
  };

  backBtn.addEventListener("click", () => {
    if (runtime.current > 0) runtime.current--;
    render();
  });
  stepActionBtn.addEventListener("click", () => {
    const step = runtime.steps[runtime.current];
    if (!step || typeof step.fallbackAction !== "function") return;
    step.fallbackAction();
    render();
  });
  nextBtn.addEventListener("click", () => {
    if (runtime.current >= runtime.steps.length - 1) {
      closeTour();
      return;
    }
    runtime.current++;
    render();
  });
  skipBtn.addEventListener("click", closeTour);
  globalThis.addEventListener("resize", onResize);
  globalThis.addEventListener("scroll", reposition, true);
  document.addEventListener("keydown", onKeyDown, true);
  render();
}
