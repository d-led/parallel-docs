export type WideIntroElements = {
  bubble: HTMLElement;
  arrowLayer: HTMLElement;
  titleEl: HTMLElement;
  bodyEl: HTMLElement;
  stepActionBtn: HTMLButtonElement;
  progressEl: HTMLElement;
  backBtn: HTMLButtonElement;
  nextBtn: HTMLButtonElement;
  skipBtn: HTMLButtonElement;
};

export function clearOpenWideModeIntroTourUi(): void {
  for (const el of Array.from(document.querySelectorAll(".sidetrack-wide-intro-target"))) {
    if (el instanceof HTMLElement) el.classList.remove("sidetrack-wide-intro-target");
  }
  const open = document.getElementById("sidetrack-wide-intro");
  if (open instanceof HTMLElement) open.remove();
  const arrows = document.getElementById("sidetrack-wide-intro-arrows");
  if (arrows instanceof HTMLElement) arrows.remove();
}

export function createWideIntroElements(): WideIntroElements | null {
  const arrowLayer = document.createElement("div");
  arrowLayer.id = "sidetrack-wide-intro-arrows";
  arrowLayer.setAttribute("aria-hidden", "true");
  document.body.appendChild(arrowLayer);

  const bubble = document.createElement("section");
  bubble.id = "sidetrack-wide-intro";
  bubble.setAttribute("role", "dialog");
  bubble.setAttribute("aria-live", "polite");
  bubble.innerHTML = `
    <span class="sidetrack-wide-intro-pointer" aria-hidden="true"></span>
    <p class="sidetrack-wide-intro-title"></p>
    <p class="sidetrack-wide-intro-body"></p>
    <button type="button" class="sidetrack-wide-intro-step-action" hidden></button>
    <div class="sidetrack-wide-intro-footer">
      <span class="sidetrack-wide-intro-progress"></span>
      <div class="sidetrack-wide-intro-actions">
        <button type="button" data-wide-intro="back">Back</button>
        <button type="button" data-wide-intro="next">Next</button>
        <button type="button" data-wide-intro="skip">Skip</button>
      </div>
    </div>
  `;
  document.body.appendChild(bubble);

  const titleEl = bubble.querySelector(".sidetrack-wide-intro-title");
  const bodyEl = bubble.querySelector(".sidetrack-wide-intro-body");
  const stepActionBtn = bubble.querySelector(".sidetrack-wide-intro-step-action");
  const progressEl = bubble.querySelector(".sidetrack-wide-intro-progress");
  const backBtn = bubble.querySelector('button[data-wide-intro="back"]');
  const nextBtn = bubble.querySelector('button[data-wide-intro="next"]');
  const skipBtn = bubble.querySelector('button[data-wide-intro="skip"]');
  if (
    !(titleEl instanceof HTMLElement) ||
    !(bodyEl instanceof HTMLElement) ||
    !(stepActionBtn instanceof HTMLButtonElement) ||
    !(progressEl instanceof HTMLElement) ||
    !(backBtn instanceof HTMLButtonElement) ||
    !(nextBtn instanceof HTMLButtonElement) ||
    !(skipBtn instanceof HTMLButtonElement)
  ) {
    arrowLayer.remove();
    bubble.remove();
    return null;
  }
  return {
    bubble,
    arrowLayer,
    titleEl,
    bodyEl,
    stepActionBtn,
    progressEl,
    backBtn,
    nextBtn,
    skipBtn,
  };
}
