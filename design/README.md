# Design

Brand kit for harness-ledger: the logo, its variants, the web icons and the presentation.

| Folder or file | What is in it |
| --- | --- |
| `svg/` | Symbol, horizontal and stacked logos, each in `light` and `dark`; `symbol-small-*` for 16 to 32 px. No background. |
| `mono/` | One-colour versions: black and white. |
| `web/` | `favicon.ico`, `favicon.svg`, PNG icons, `apple-touch-icon.png`, the app icon, `site.webmanifest` and `head-snippet.html`. |
| `presentation/` | The identity deck (`index.html`, `slide-*.png`) and the `spec.json` it is built from. |
| `social-preview.png` | The 1280 x 640 image for the GitHub social preview. |
| `GUIDELINES.md` | Clear space, minimum sizes, colours and what not to do. |
| `source/` | The scripts that generate the SVG files, the deck and the social preview. |

## Rebuild

```
cd design/source
GEIST_MONO_WOFF=<path>/geist-mono-latin-500-normal.woff python3 kit.py   # rewrites ../svg, ../mono and the two SVGs in ../web
SKILL_DIR=<logo-skill-dir> ./build-presentation.sh
```

`kit.py` needs `fonttools` and `skia-pathops`. The font comes from the npm package `@fontsource/geist-mono`.

The PNG icons, `favicon.ico`, the manifest and the head snippet in `web/` come from the logo skill's `export_variants.py`, run on `svg/symbol-small-dark.svg` and `web/harness-ledger-app-icon.svg`. `social-preview.png` is a screenshot of `source/social-preview.html` at 1280 x 640. None of this is in the repository's skill or script.
