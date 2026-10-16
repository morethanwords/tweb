# Build environment for Anthropic's OSS Scanner:
# https://github.com/anthropics/oss-scanner/tree/main/projects/tweb
#
# The scan runs without a network, so everything is fetched here: the
# dependencies, the production bundle in dist/, and the headless Chromium the
# Playwright suites drive. With them the app's unit tests, its dev server and
# its browser tests all run offline.
FROM node:24-bookworm

ENV DEBIAN_FRONTEND=noninteractive \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
    TWEB_TEST_QUEUE=0

# Scanner contract: the checkout lives inside the image at /src.
COPY . /src
WORKDIR /src

# pnpm at the version package.json pins.
RUN npm install -g "$(node -p 'require("./package.json").packageManager.split("+")[0]')"

RUN pnpm install --frozen-lockfile

# The production bundle, with source maps. `pnpm build` runs the unit tests and
# the typecheck first and stops at a failure; here they run below instead,
# where a failure must not fail the image.
RUN pnpm exec vite build && test -f dist/index.html

# Chromium for the Playwright suites, such as `pnpm test:popups`.
RUN pnpm exec playwright install --with-deps chromium

# Cheap checks, which must not fail the image.
RUN (pnpm exec vitest run || echo "WARNING: vitest reported failures") \
 && (pnpm run typecheck || echo "WARNING: tsc reported errors")
