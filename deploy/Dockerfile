# syntax=docker/dockerfile:1
FROM --platform=$BUILDPLATFORM node:22-bookworm-slim@sha256:5ec23b7c622b00547753bc6ffd78085dd868a68aeb41c8e0a1418f033e13d96d AS builder
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
ARG VITE_MTPROTO_RELAY_PATH=/mtproto
ARG SOURCE_REVISION=local
# Empty build args use upstream defaults in build-env.cjs (also used by CI).
ARG API_ID
ARG API_HASH
ENV VITE_MTPROTO_RELAY_PATH=$VITE_MTPROTO_RELAY_PATH SOURCE_REVISION=$SOURCE_REVISION
RUN test "$VITE_MTPROTO_RELAY_PATH" = /mtproto \
    && node deploy/build-env.cjs \
    && pnpm run build \
    && node deploy/prepare-static.cjs \
    && chmod -R a+rX /app/dist

FROM caddy:2-alpine@sha256:78bd35025c7ba85961dd149ae670315129954e77abe2383ac47c89106b35ade9 AS runtime
ARG SOURCE_REVISION=local
ARG SOURCE_URL=https://github.com/zkhvroman/tweb
ARG IMAGE_VERSION=local
ARG BUILD_DATE=unknown
LABEL org.opencontainers.image.source=$SOURCE_URL \
      org.opencontainers.image.revision=$SOURCE_REVISION \
      org.opencontainers.image.version=$IMAGE_VERSION \
      org.opencontainers.image.created=$BUILD_DATE \
      org.opencontainers.image.licenses=GPL-3.0-only
COPY --from=builder /app/dist/ /srv/
COPY --chmod=644 deploy/Caddyfile deploy/relay-routes.caddy /etc/caddy/
USER 10001:10001
ENV XDG_DATA_HOME=/tmp/data XDG_CONFIG_HOME=/tmp/config
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget -q -O /dev/null http://127.0.0.1:8080/healthz || exit 1
ENTRYPOINT ["caddy"]
CMD ["run", "--config", "/etc/caddy/Caddyfile", "--adapter", "caddyfile"]
