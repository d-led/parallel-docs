#!/usr/bin/env python3
"""
Trace a flat transparent PNG (e.g. docs/logos/2.png) into an SVG with
`<path>` geometry per solid color.

Uses Matplotlib contour on each color mask + path simplification. Intended
for logos with a small palette (navy / grey / yellow from the SideTrack
raster pipeline).

Dependencies: Pillow, NumPy, Matplotlib.

Full pipeline (JPEG → PNG → SVG → VS Code icon): `bash scripts/refresh-logo-assets.sh`

Example (SVG trace only):
  python3 docs/logos/scripts/png-to-svg-trace.py \\
    --input docs/logos/2.png --output docs/logos/2.svg
"""

from __future__ import annotations

import argparse
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import numpy as np
from matplotlib import pyplot as plt
from matplotlib.path import Path as MPath
from PIL import Image

# Must match jpg-to-clean-transparent-png.py
NAVY = (19, 32, 59)
GREY = (166, 167, 166)
YELLOW = (232, 186, 38)


def _mask_color(
    rgb: np.ndarray, alpha: np.ndarray, color: tuple[int, int, int]
) -> np.ndarray:
    c = np.array(color, dtype=np.uint8)
    return (alpha >= 128) & np.all(rgb == c, axis=2)


def _contour_path(mask: np.ndarray) -> MPath | None:
    if not mask.any():
        return None
    m = mask.astype(float)
    h, w = m.shape
    y_idx, x_idx = np.mgrid[0:h, 0:w]
    fig, ax = plt.subplots()
    try:
        cs = ax.contour(x_idx, y_idx, m, levels=[0.5])
        paths = cs.get_paths()
    finally:
        plt.close(fig)
    if not paths:
        return None
    # Single level → expect one compound path for a single-color layer
    return paths[0]


def _path_to_svg_d(path: MPath, *, simplify_stroke: float) -> str:
    p = path.cleaned(simplify=True, stroke_width=simplify_stroke)
    verts = p.vertices
    codes = p.codes
    parts: list[str] = []
    for i in range(len(verts)):
        x, y = float(verts[i, 0]), float(verts[i, 1])
        c = int(codes[i])
        if c == MPath.MOVETO:
            parts.append(f"M{x:.2f},{y:.2f}")
        elif c == MPath.LINETO:
            parts.append(f"L{x:.2f},{y:.2f}")
        elif c == MPath.CLOSEPOLY:
            parts.append("Z")
        elif c == MPath.CURVE3:
            # Not expected from contour; fall back to line segments
            parts.append(f"L{x:.2f},{y:.2f}")
        elif c == MPath.CURVE4:
            parts.append(f"L{x:.2f},{y:.2f}")
        else:
            parts.append(f"L{x:.2f},{y:.2f}")
    return " ".join(parts)


def _hex(rgb: tuple[int, int, int]) -> str:
    return f"#{rgb[0]:02x}{rgb[1]:02x}{rgb[2]:02x}"


def build_svg(
    rgba: np.ndarray,
    *,
    simplify_stroke: float,
    title: str,
) -> str:
    rgb = rgba[:, :, :3]
    alpha = rgba[:, :, 3]
    h, w = alpha.shape

    navy_m = _mask_color(rgb, alpha, NAVY)
    grey_m = _mask_color(rgb, alpha, GREY)
    yel_m = _mask_color(rgb, alpha, YELLOW)

    navy_p = _contour_path(navy_m)
    grey_p = _contour_path(grey_m)
    yel_p = _contour_path(yel_m)

    lines: list[str] = [
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" '
        f'viewBox="0 0 {w} {h}" role="img" aria-labelledby="title">',
        f'  <title id="title">{title}</title>',
        '  <desc>Vector trace of flat PNG palette (navy, grey, yellow).</desc>',
    ]

    if navy_p is not None:
        d = _path_to_svg_d(navy_p, simplify_stroke=simplify_stroke)
        lines.append(
            f'  <path fill="{_hex(NAVY)}" fill-rule="evenodd" stroke="none" d="{d}" />'
        )

    if grey_p is not None:
        d = _path_to_svg_d(grey_p, simplify_stroke=simplify_stroke)
        lines.append(f'  <path fill="{_hex(GREY)}" fill-rule="evenodd" stroke="none" d="{d}" />')

    if yel_p is not None:
        d = _path_to_svg_d(yel_p, simplify_stroke=simplify_stroke)
        lines.append(
            f'  <path fill="{_hex(YELLOW)}" fill-rule="evenodd" stroke="none" d="{d}" />'
        )

    lines.append("</svg>")
    return "\n".join(lines) + "\n"


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--input", type=Path, required=True)
    ap.add_argument("--output", type=Path, required=True)
    ap.add_argument(
        "--simplify",
        type=float,
        default=2.0,
        help="Matplotlib path simplification stroke width (pixels).",
    )
    ap.add_argument("--title", default="SideTrack logo (raster trace)")
    args = ap.parse_args()

    im = Image.open(args.input).convert("RGBA")
    rgba = np.array(im)
    svg = build_svg(rgba, simplify_stroke=args.simplify, title=args.title)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(svg, encoding="utf8")
    print(f"Wrote {args.output.resolve()}")


if __name__ == "__main__":
    main()
