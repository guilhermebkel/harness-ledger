import os
import sys

import pathops
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont

FONT = os.environ.get("GEIST_MONO_WOFF")
if not FONT:
    sys.exit("Set GEIST_MONO_WOFF to geist-mono-latin-500-normal.woff (npm: @fontsource/geist-mono)")

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
INK, BONE, AMBER, AMBER_DEEP = "#0c0a08", "#f3f0ea", "#d8a976", "#8e5d1e"
THEMES = {"light": AMBER_DEEP, "dark": AMBER}
MONO = {"black": "#000000", "white": "#ffffff"}
TITLE = "harness-ledger"
KAPPA = 0.5522847498
UPM, ADV, XH = 1000, 600, 532
GRID_CENTERS = (6.5, 13, 19.5)
GRID_STUBS = (3, 23)

font = TTFont(FONT)
glyphs = font.getGlyphSet()
cmap = font.getBestCmap()


def num(value):
    text = f"{value:.2f}".rstrip("0").rstrip(".")
    return "0" if text in ("-0", "") else text


def circle(pen, cx, cy, r):
    c = KAPPA * r
    pts = [(cx + r, cy), (cx, cy + r), (cx - r, cy), (cx, cy - r)]
    pen.moveTo(pts[0])
    ctrl = [((cx + r, cy + c), (cx + c, cy + r)), ((cx - c, cy + r), (cx - r, cy + c)),
            ((cx - r, cy - c), (cx - c, cy - r)), ((cx + c, cy - r), (cx + r, cy - c))]
    for index, (a, b) in enumerate(ctrl):
        pen.curveTo(a, b, pts[(index + 1) % 4])
    pen.closePath()


def mark(k, ox, oy, small=False):
    # Why: one unioned path with real holes; stacking rings with evenodd leaves slivers where they overlap.
    r, w = (3.2, 2.4) if small else (3, 2)
    outer, inner, stub = r + w / 2, r - w / 2, w / 2
    body = pathops.Path()
    pen = body.getPen()
    for c in GRID_CENTERS:
        circle(pen, ox + c * k, oy + 13 * k, outer * k)
    for c in GRID_STUBS:
        circle(pen, ox + c * k, oy + 13 * k, stub * k)
    body.simplify(fix_winding=True)
    holes = pathops.Path()
    hole_pen = holes.getPen()
    for c in GRID_CENTERS:
        circle(hole_pen, ox + c * k, oy + 13 * k, inner * k)
    holes.simplify(fix_winding=True)
    result = pathops.op(body, holes, pathops.PathOp.DIFFERENCE)
    out = SVGPathPen(None, ntos=num)
    result.draw(out)
    return out.getCommands()


def word(size, x, baseline):
    scale = size / UPM
    parts = []
    for index, char in enumerate("harness-ledger"):
        pen = SVGPathPen(glyphs, ntos=num)
        glyphs[cmap[ord(char)]].draw(TransformPen(pen, (scale, 0, 0, -scale, x + index * ADV * scale, baseline)))
        parts.append(pen.getCommands())
    return "".join(parts)


def svg(view_box, body):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{view_box}" role="img" aria-label="{TITLE}">'
            f"<title>{TITLE}</title>{body}</svg>\n")


def icon(k, ox, oy, color, small=False):
    return f'<g id="icon" fill="{color}"><path d="{mark(k, ox, oy, small)}"/></g>'


def wordmark(size, x, baseline, color):
    return f'<g id="wordmark" fill="{color}"><path d="{word(size, x, baseline)}"/></g>'


def symbol(color, small=False):
    return svg("0 50 260 160", icon(10, 0, 0, color, small))


def horizontal(color):
    size, k, base = 100, 8.5, 100
    cy = base - XH / UPM * size / 2
    ox, oy = -2 * k, cy - 13 * k
    tx = 22 * k + 0.72 * size - 0.093 * size
    ink_end = tx + 14 * ADV / UPM * size - 0.056 * size
    top = min(cy - 4.5 * k, base - 0.71 * size)
    view = f"-16 {num(top - 16)} {num(ink_end + 32)} {num(base + 0.162 * size - top + 32)}"
    return svg(view, icon(k, ox, oy, color) + wordmark(size, tx, base, color))


def stacked(color):
    k, size, base = 13.6, 100, 250
    text_width = 14 * ADV / UPM * size
    ox = (text_width - 22 * k) / 2 - 2 * k
    body = icon(k, ox, 20 - 9 * k, color) + wordmark(size, 0, base, color)
    return svg(f"-30 0 {num(text_width + 60)} {num(base + 0.162 * size + 30)}", body)


def tile(k, offset, small):
    rect = f'<rect id="background" width="260" height="260" rx="60" fill="{INK}"/>'
    return svg("0 0 260 260", rect + icon(k, offset, offset, AMBER, small))


def write(folder, name, text):
    os.makedirs(os.path.join(ROOT, folder), exist_ok=True)
    with open(os.path.join(ROOT, folder, name), "w") as handle:
        handle.write(text)


for theme, color in THEMES.items():
    write("svg", f"symbol-{theme}.svg", symbol(color))
    write("svg", f"symbol-small-{theme}.svg", symbol(color, small=True))
    write("svg", f"horizontal-{theme}.svg", horizontal(color))
    write("svg", f"stacked-{theme}.svg", stacked(color))
for name, color in MONO.items():
    write("mono", f"symbol-{name}.svg", symbol(color))
    write("mono", f"horizontal-{name}.svg", horizontal(color))
    write("mono", f"stacked-{name}.svg", stacked(color))
write("web", "harness-ledger-app-icon.svg", tile(10, 0, False))
write("web", "favicon.svg", tile(11, -13, True))
print("wrote", ROOT)
