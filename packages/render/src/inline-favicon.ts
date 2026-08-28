/**
 * Tab icon as a single `<link rel="icon" …>` using an inline SVG data URL.
 * Avoids relying on `/favicon.ico` (often missing under `_site/`) and works when the site is
 * served from a subpath on GitHub Pages.
 *
 * Geometry / flat colors align with `docs/logos/2.svg` (and traced `docs/logos/2.png`).
 */
const PARALLEL_DOCS_LOGO_SVG_FAVICON =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img">' +
  '<rect x="2" y="2" width="60" height="60" rx="12" fill="#13203b"/>' +
  '<rect x="11" y="17" width="19" height="30" rx="3" fill="#ffffff"/>' +
  '<rect x="34" y="17" width="19" height="30" rx="3" fill="#ffffff"/>' +
  '<rect x="14.5" y="23" width="11" height="2.5" rx="1.25" fill="#a6a7a6"/>' +
  '<rect x="14.5" y="28" width="12.5" height="2.5" rx="1.25" fill="#a6a7a6"/>' +
  '<rect x="14.5" y="33" width="9" height="2.5" rx="1.25" fill="#a6a7a6"/>' +
  '<rect x="14.5" y="38" width="11.5" height="2.5" rx="1.25" fill="#a6a7a6"/>' +
  '<rect x="37.5" y="23" width="11" height="2.5" rx="1.25" fill="#a6a7a6"/>' +
  '<rect x="37.5" y="28" width="12.5" height="2.5" rx="1.25" fill="#a6a7a6"/>' +
  '<rect x="37.5" y="33" width="9" height="2.5" rx="1.25" fill="#a6a7a6"/>' +
  '<rect x="37.5" y="38" width="11.5" height="2.5" rx="1.25" fill="#a6a7a6"/>' +
  '<path d="M30 28 C32 28 32 36 34 36" fill="none" stroke="#e8ba26" stroke-width="2.5" stroke-linecap="round"/>' +
  '<circle cx="30" cy="28" r="2" fill="#e8ba26"/>' +
  '<circle cx="34" cy="36" r="2" fill="#e8ba26"/>' +
  "</svg>";

export const PARALLEL_DOCS_FAVICON_LINK_HTML = `<link rel="icon" href="data:image/svg+xml,${encodeURIComponent(
  PARALLEL_DOCS_LOGO_SVG_FAVICON,
)}" />`;
