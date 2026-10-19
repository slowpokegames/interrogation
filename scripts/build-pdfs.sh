#!/bin/sh
# Renders every printable page to print/pdf/ with headless Chrome.
# Usage: npm run pdf   (or: sh scripts/build-pdfs.sh)
set -e
cd "$(dirname "$0")/.."
CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
[ -x "$CHROME" ] || CHROME="$(command -v google-chrome || command -v chromium || true)"
[ -n "$CHROME" ] || { echo "Chrome not found; set CHROME=/path/to/chrome" >&2; exit 1; }
mkdir -p print/pdf
for page in data-sheet suspects locations quick-reference; do
  "$CHROME" --headless --disable-gpu --no-pdf-header-footer --run-all-compositor-stages-before-draw \
    --virtual-time-budget=5000 --print-to-pdf="print/pdf/$page.pdf" "file://$PWD/print/$page.html" 2>/dev/null
  echo "print/pdf/$page.pdf"
done
