# harness-ledger logo guidelines

## The mark
- **Idea:** three fused rings, one chain of records. Each session is a link in the ledger.
- **Versions:** horizontal (primary), stacked, symbol only, and a small symbol for 16 to 32 px.
- **Files:** `svg/` for screens (light and dark), `mono/` for one colour, `web/` for the favicon, app icon and manifest.

## Clear space
Keep a clear zone of one ring (the outer diameter of a ring of the symbol) on every side. The zone scales with the logo; never use a fixed distance.

## Minimum size
| Version | Screen |
| --- | --- |
| Horizontal | 120 px wide |
| Stacked | 80 px wide |
| Symbol | 24 px wide |
| Small symbol (`symbol-small-*.svg`, favicon) | 16 px |

Below 24 px always use the small symbol: its rings are heavier so the holes stay open.

## Colour
The palette comes from the site (`site/index.html`).

| Name | HEX | RGB | CMYK (approx.) | Use |
| --- | --- | --- | --- | --- |
| Ink | `#0c0a08` | 12, 10, 8 | 0, 17, 33, 95 | Dark backgrounds; the app icon tile |
| Amber | `#d8a976` | 216, 169, 118 | 0, 22, 45, 15 | The mark on dark |
| Deep amber | `#8e5d1e` | 142, 93, 30 | 0, 35, 79, 44 | The mark on light |
| Bone | `#f3f0ea` | 243, 240, 234 | 0, 1, 4, 5 | Light backgrounds and text on dark |

CMYK values are rough conversions; check them with the printer. No Pantone is defined.

**Approved pairs** (WCAG contrast):
- `light` files (deep amber) on white 5.6:1 or on bone 4.9:1.
- `dark` files (amber) on ink 9.3:1.
- One colour: `mono/*-black.svg` or `*-white.svg` when colour is not available.
- Amber on white is only 2.1:1: do not use it.

## Type
The wordmark is outlined from Geist Mono Medium (SIL OFL 1.1), so the SVG files need no font. Do not retype it in another typeface. Geist and Geist Mono are the companion typefaces for surrounding text.

## Don'ts
- Do not stretch, squash or rotate the logo.
- Do not recolour outside the palette.
- Do not add shadows, outlines, gradients or effects.
- Do not change the size of the symbol relative to the wordmark.
- Do not use the full symbol below 24 px.
- Do not add or remove rings, or pull them apart.
- Do not place it on a busy background without a colour block behind it.

## Known limits
- The kit was checked as rendered PNGs, not in real browser tabs or in the agents' own icon slots.
- The horizontal and stacked files are heavy for hand editing (about 380 anchors) because the wordmark is outlined.
- No trademark search was done. Search the registries and run a reverse image search before registering the mark.
