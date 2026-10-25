#!/usr/bin/env bash
# Rebuilds design/presentation from spec.json. Needs the logo-design skill scripts (SKILL_DIR) and Playwright.
set -euo pipefail
cd "$(dirname "$0")/../presentation"
python3 "$SKILL_DIR/scripts/presentation_board.py" spec.json -o index.html
# Why: the template's terminal mockup shows made-up commands; the real ones go there instead.
python3 - <<'PY'
import re
html = open("index.html").read()
html = re.sub(r'\$ harnessledger --version<br><span[^>]*>harness-ledger 1\.0\.0</span><br>\$ harnessledger search "error"',
              '$ harness-ledger analyze --since 14d<br>$ harness-ledger suggestions list', html)
open("index.html", "w").write(html)
PY
python3 - <<'PY'
import os
from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page(viewport={"width": 1600, "height": 900})
    page.goto("file://" + os.path.abspath("index.html"))
    page.wait_for_timeout(800)
    for index, slide in enumerate(page.query_selector_all("section, .slide")):
        slide.screenshot(path=f"slide-{index + 1}.png")
    browser.close()
PY
