#!/usr/bin/env bash
# Rebuild the shell in the pinned verification container, cut releases/<id> and serve it on 127.0.0.1:3120.
#
#   scripts/release.sh                 build + typecheck + lint + unit + quick browser check, then release
#   scripts/release.sh --check full    the same with the full two-browser, four-viewport matrix
#   scripts/release.sh --check none    build and release only
#
# The release id is the first 16 hex digits of sha256(artifacts/build-manifest.json); an identical build is reused.
# The previous container is kept stopped as robochat-bot-builder-shell-previous-<id> for rollback.
set -euo pipefail
cd "$(dirname "$0")/.."
IMAGE=robochat-shell-verify:node22-pw1611
DEPS=tweb-shell-verification-deps
SERVE_IMAGE=node@sha256:c610fcdfb1d5b4740dd70c284ed3cb16bb857e0f7166196e36a5501df7a3aa32
NAME=robochat-bot-builder-shell
CHECK=quick
if [[ ${1:-} == --check ]]; then CHECK=${2:?--check needs quick|full|none}; fi

run() { docker run --rm --ipc=host -v "$PWD:/workspace" -v "$DEPS:/workspace/node_modules" -w /workspace "$IMAGE" sh -c "$1"; }

echo "== build"
run 'node_modules/.bin/tsc --noEmit && node_modules/.bin/oxlint src/shell scripts tests/browser vite.config.ts vitest.config.ts playwright.config.ts && node scripts/quickjs-assets.mjs && node_modules/.bin/vite build >/dev/null && node scripts/check-artifact.mjs'
case $CHECK in
  quick) echo "== check: unit + chromium desktop/phone"; run 'node_modules/.bin/vitest run >/dev/null && node_modules/.bin/playwright test --project=chromium-1280x900 --project=chromium-375x812' ;;
  full) echo "== check: unit + full browser matrix"; run 'node_modules/.bin/vitest run >/dev/null && node_modules/.bin/playwright test' ;;
  none) ;;
  *) echo "unknown --check value: $CHECK" >&2; exit 2 ;;
esac

ID=$(sha256sum artifacts/build-manifest.json | cut -c1-16)
if [[ ! -e releases/$ID ]]; then
  mkdir -p "releases/$ID"
  cp -r dist notices "releases/$ID/"
  cp LICENSE artifacts/build-manifest.json scripts/serve-artifact.mjs "releases/$ID/"
  printf '{\n  "result": "pass",\n  "scope": "%s",\n  "artifactManifestSha256": "%s",\n  "check": "%s",\n  "url": "http://127.0.0.1:3120/"\n}\n' \
    "${SCOPE:-scripts/release.sh}" "$(sha256sum artifacts/build-manifest.json | cut -d' ' -f1)" "$CHECK" > "releases/$ID/acceptance.json"
  echo "== release: releases/$ID"
else
  echo "== release: releases/$ID already exists, reusing"
fi

if docker inspect "$NAME" >/dev/null 2>&1; then
  PREV=$(basename "$(docker inspect "$NAME" --format '{{range .Mounts}}{{.Source}}{{end}}')")
  if [[ $PREV == "$ID" ]]; then echo "already serving $ID at http://127.0.0.1:3120/"; exit 0; fi
  docker rm -f "$NAME-previous-$PREV" >/dev/null 2>&1 || true
  docker rename "$NAME" "$NAME-previous-$PREV"
  docker stop -t 2 "$NAME-previous-$PREV" >/dev/null
fi
docker run -d --name "$NAME" -p 127.0.0.1:3120:3120 -v "$PWD/releases/$ID:/release:ro" "$SERVE_IMAGE" \
  node /release/serve-artifact.mjs --host 0.0.0.0 --port 3120 --dir /release/dist --manifest /release/build-manifest.json >/dev/null
sleep 1
curl -sf --noproxy '*' -o /dev/null http://127.0.0.1:3120/
echo "serving $ID at http://127.0.0.1:3120/"
