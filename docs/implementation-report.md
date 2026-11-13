# Отчёт по ТЗ

Работа выполнена в ветке `feat/mtproto-relay`. GHCR publish и VPS deployment
не выполнялись. Файл `telegram-web-k-codex-task.md` сохранён без изменений.

## Архитектура

Browser/Worker → HTTPS/WSS → существующий HAProxy → HTTP :8080 → Caddy → фиксированные
Telegram HTTPS/WSS endpoints. Caddy также обслуживает свежую сборку Web K и `/healthz`.
Все пути, кроме `/healthz`, защищены runtime Basic Auth (логин и bcrypt-хеш).
Runtime: non-root, read-only root filesystem, tmpfs, без Node.js и дополнительных ports.
URL builder подключён в общей точке выбора транспорта; direct fallback в relay-режиме
отсутствует. Матрица main/file/test DC содержит 32 разрешённых маршрута.

Checkout отличается от предположений ТЗ: здесь Webpack 4/Web K 1.2.0 (127), без Vite,
Solid.js и Premium. Текущая технология сохранена. `VITE_MTPROTO_RELAY_PATH` внедрён
через Webpack. pnpm lockfile импортирован из upstream npm baseline.

## Изменённые файлы

- `src/lib/mtproto/dcConfigurator.ts`: применение relay URL для обоих транспортов.
- `webpack.common.js`: build-time define и абсолютные пути assets для SPA.
- `webpack.prod.js`: manifest только реально emitted assets.
- `package.json`: Node/pnpm, build/typecheck/lint/container scripts, dev dependencies.
- `jest.config.js`: ifdef preprocessing и совместимость pvutils ESM со старым Jest.
- `src/mock/srp.ts`: исправление двух неверных expected hashes; независимая проверка
  Python hashlib/bigint. Криптография клиента не изменена.
- `src/lib/cacheStorage.ts`, `src/lib/mtproto/apiFileManager.ts`: регистр импортов
  `filemanager` исправлен для Linux.
- `.gitignore`, `README.md`: generated/local files и ссылки на документацию fork.

## Созданные файлы

- Клиент/тесты: `src/lib/mtproto/relayUrl.ts`, `src/tests/relayUrl.test.ts`,
  `src/tests/relayTransport.test.ts`, `tests/container.cjs`, `tests/build-env.cjs`.
- Инструменты: `pnpm-lock.yaml`, `.node-version`, `.eslintrc.cjs`.
- Runtime/deploy: `deploy/Dockerfile`, `deploy/Dockerfile.dockerignore`,
  `deploy/Caddyfile`, `deploy/relay-routes.caddy`, `deploy/compose.yaml`,
  `deploy/.env.example`, `deploy/haproxy.example.cfg`, `deploy/NOTICE`.
- Build/test helpers: `deploy/build-env.cjs`, `deploy/generate-routes.cjs`,
  `deploy/prepare-static.cjs`, `deploy/jest-transform.cjs`, `deploy/source-archive.cjs`.
- Workflows: `.github/workflows/ci.yml`, `.github/workflows/docker-publish.yml`.
- Документация: `docs/mtproto-relay.md`, `docs/deployment.md`, этот отчёт.

## Сборка, запуск и image

```sh
docker build -f deploy/Dockerfile -t telegram-web-k:local .
docker run --rm -it telegram-web-k:local hash-password
# Подставьте полученный хеш вместо PASTE_BCRYPT_HASH:
docker run --rm -p 127.0.0.1:8080:8080 -e BASIC_AUTH_USER=admin \
  -e 'BASIC_AUTH_PASSWORD_HASH=PASTE_BCRYPT_HASH' telegram-web-k:local
curl -f http://127.0.0.1:8080/healthz
```

После публикации `ghcr.io/zkhvroman/telegram-web-k`:

```sh
cp deploy/.env.example deploy/.env
# В deploy/.env заменить OWNER на zkhvroman, при необходимости указать IMAGE_REF digest.
# Задать BASIC_AUTH_USER и BASIC_AUTH_PASSWORD_HASH (bcrypt, в одинарных кавычках).
docker compose --env-file deploy/.env -f deploy/compose.yaml pull
docker compose --env-file deploy/.env -f deploy/compose.yaml up -d
```

Tags: `main` для master, `sha-<12 hex>` без перезаписи, `v*` для релиза, `latest`
только для релиза. Публикация amd64/arm64, SBOM, provenance, OCI labels и digest в summary.
Для rollback задаётся `IMAGE_REF=@sha256:...`. Конкретного опубликованного digest пока нет.
Repository variables `API_ID` и `API_HASH` переопределяют credentials одновременно
в frontend CI, Docker CI и GHCR build. Без обеих переменных используется пара upstream;
неполная или некорректная пара останавливает сборку. Defaults общие, в `deploy/build-env.cjs`.

## HAProxy

В существующий HTTPS frontend:

```haproxy
    acl telegram_web_host hdr(host) -i telegram.example.com telegram.example.com:443
    http-request set-header X-Forwarded-Proto https if telegram_web_host
    use_backend telegram_web if telegram_web_host

backend telegram_web
    mode http
    option httpchk GET /healthz
    http-check expect status 200
    timeout connect 10s
    timeout server 75s
    timeout tunnel 1h
    server web1 127.0.0.1:8080 check
```

Сертификат и 443 остаются у HAProxy. Инструкции DNS, TLS, Docker network, проверки
authorization/файлов, update, rollback и диагностика: [deployment.md](deployment.md).

## Проверки в локальном окружении

- **PASS:** 6 Jest suites, 44 tests, включая worker origin, original mode, reconnect,
  HTTP fallback, validation и fail-closed маршрутизацию.
- **PASS:** 8 проверок генерации build environment: отсутствующие/пустые variables,
  собственная пара, неполные/невалидные значения; ошибочный ввод не перезаписывает `.env`.
- **PASS:** TypeScript `tsc --noEmit`, ESLint для нового кода, проверка generated routes.
- **PASS:** production build в Docker на Node 22; отдельные linux/arm64 и linux/amd64 images.
- **PASS на обеих архитектурах:** container tests всех 32 маршрутов, бинарные POST/WS,
  subprotocol, TLS/SNI/Host, удаление credentials/IP headers, concurrent connections,
  invalid route/SSRF/redirect rejection и недоверенный TLS сертификат.
- **PASS на обеих архитектурах:** настоящий HAProxy HTTPS POST/WSS → HTTP Caddy.
- **PASS:** static SHA256/MIME/Brotli/cache, SPA, Service Worker headers, healthcheck,
  отсутствие статики → 503, non-root/read-only runtime, restart.
- **PASS:** Compose config validation и actionlint/ShellCheck workflows.
- **PASS:** Trivy CRITICAL scan — 0 находок в Alpine 3.24.4 и `usr/bin/caddy`.
  Первое скачивание базы завершилось по 5-minute timeout; повтор с официальным GHCR
  registry и timeout 15m прошёл. Это проверка уровня CRITICAL, не всех severity.
- **PASS:** отдельный реальный WebSocket handshake `kws2.web.telegram.org/apiws`
  с subprotocol `binary`, без аккаунта. Этот connectivity check не является проверкой
  Telegram authorization или полной работы на VPS.

AMD64 runtime проверен под эмуляцией на ARM64 Docker Desktop. CI на GitHub пока
не запускался; локальная проверка workflows не подтверждает registry permissions.

Дополнительная проверка Basic Auth (2026-11-13): локальный образ
`telegram-web-k:basic-auth` собран и прошёл container tests. Проверены 401 для страниц,
статики и relay без credentials, неверный пароль, отклонение WebSocket Upgrade без
авторизации, доступ с верной парой, анонимные GET/HEAD `/healthz`, сохранение bcrypt-хеша
через Compose `.env`, отказ запуска без настроек и отсутствие Authorization на upstream.
Все 32 маршрута и HTTPS/WSS через настоящий HAProxy повторно проверены с Basic Auth.

## Ограничения и ручные действия

1. В GitHub включить Actions, проверить packages permissions, public/private GHCR
   access и branch protection. Затем самостоятельно push/merge/tag или разрешённый
   ручной workflow. Publish всегда зависит от полного CI; ручной publish по умолчанию выключен.
2. На VPS настроить DNS/сертификат/ACL в существующем HAProxy и реальный IMAGE в `.env`.
   Выполнить Compose pull/up. VPS не изменялся в ходе этой работы.
3. Пройти Telegram acceptance с аккаунтом: authorization/2FA, реальные DC, upload/download,
   reconnect, отсутствие прямых соединений. Mock tests не заменяют реальный аккаунт/VPS.
4. Premium отсутствует в текущем upstream checkout. Его поддержку нельзя объявить
   проверенной; потребуется обновление клиента и повторный аудит новых endpoints.
5. Старый Webpack/Jest использует deprecated dev dependencies. Runtime их не содержит.
   При обновлении base images или upstream повторить проверки; критические CVE блокируют CI.
6. Обеспечить постоянную выдачу GPL corresponding source для каждого опубликованного
   digest. Workflow готовит архив с submodules, но Actions artifact хранится только 90 дней.
7. Одноконтейнерное обновление закрывает активные WebSocket, затем клиент reconnect.
   Runtime не является VPN для WebRTC/внешних ресурсов — он обслуживает MTProto.
