# MTProto relay: устройство и сопровождение

Этот checkout — Web K 1.2.0 (127), TypeScript/Webpack 4, а не современный
Vite/Solid.js upstream. Переход на другой frontend/build system намеренно не сделан.
`pnpm-lock.yaml` импортирован из npm lockfile, pnpm закреплён в `packageManager`.
Node 22 выбран для CI/Docker; Webpack 4 запускается с `--openssl-legacy-provider`
только в процессе сборки. Runtime содержит Caddy, без Node.js и зависимостей сборки.

```text
Browser / Worker → HTTPS/WSS → HAProxy → HTTP :8080 → Caddy
                                                     ├─ /: static Web K
                                                     ├─ /healthz: local health
                                                     └─ /mtproto/*: HTTPS/WSS → Telegram
```

`VITE_MTPROTO_RELAY_PATH` — build-time параметр, несмотря на имя он передаётся через
Webpack DefinePlugin. Пример: `VITE_MTPROTO_RELAY_PATH=/mtproto pnpm build`.
Без него `relayUrl()` возвращает исходный URL без изменения. Указывать его нужно
в окружении команды сборки, не только в `.env`: dotenv upstream обслуживает API/version.
Origin читается из `self.location.origin`; HTTPS даёт WSS, локальный HTTP даёт WS.
Приложение обслуживается в корне домена; `publicPath: '/'` обеспечивает assets на SPA routes.

Docker image поддерживает только `/mtproto`, что проверяется при сборке. Другой
префикс поддерживает URL builder, но для него требуется отдельная серверная
конфигурация. Изменение Compose environment не меняет уже собранный клиент.

## Выбор дата-центров

`dcConfigurator.ts` сохраняет выбор DC, reuse, Safari socket proxy и transport
fallback. Меняется только URL, передаваемый transport-конструктору. В relay-режиме
legacy HTTP transport использует выбор SSL-хоста, затем локальный URL. При обрыве
TcpObfuscated повторяет тот же relay URL; HTTPS probe/fallback тоже идёт через VPS.
Ни исключения URL builder, ни 502 от relay не открывают прямой маршрут.

| Транспорт | DC 1–5 | Файлы | Production / test path |
|---|---|---|---|
| WebSocket | `kws1` … `kws5` | суффикс `-1` | `apiws` / `apiws_test` |
| HTTPS POST | `pluto`, `venus`, `aurora`, `vesta`, `flora` | суффикс `-1` | `apiw1` / `apiw_test1` |

Пример: `/mtproto/kws2-1/apiws` → `https://kws2-1.web.telegram.org/apiws`.
Test DC разрешены только 1–3. Всего 32 пары маршрутов. Список зафиксирован
в `deploy/relay-routes.caddy`; генератор `deploy/generate-routes.cjs` выполняется
при разработке, не при обработке запросов.

В этом checkout отсутствуют Premium, premium DC suffix и соответствующий UI/API.
Relay обслуживает все имеющиеся здесь file routes, но не добавляет отсутствующую
поддержку Premium. Проверку современного Premium нужно выполнить после обновления
upstream и явного расширения allowlist. Неизвестный новый endpoint завершится ошибкой,
а не прямым соединением. Это ограничение старого клиента, а не проверенный Premium-сценарий.

## Граница безопасности

Маршруты сопоставляются с полным URI и HTTP method. Произвольных hostname, URL,
query parameters или dynamic upstream в production нет. Неизвестный `/mtproto/*`
после Basic Auth возвращает 404 до SPA fallback. Caddy проверяет Basic Auth для
всех путей, кроме `/healthz`; без авторизации — 401 до обращения к upstream.
Логин и bcrypt-хеш задаются в runtime через `BASIC_AUTH_USER`/`BASIC_AUTH_PASSWORD_HASH`.
Отдельного пользовательского backend нет; credentials сайта не являются Telegram session.

Caddy проверяет TLS upstream, выставляет фиксированные Host/SNI, сохраняет бинарный
body, Upgrade и WebSocket subprotocol `binary`. Все входящие upstream-заголовки
удаляются, затем восстанавливается минимальный набор для MTProto/WebSocket. Cookies,
Authorization, Forwarded, X-Forwarded-*, Origin, Referer и произвольные auth-заголовки
не передаются Telegram, в том числе Authorization после успешного Basic Auth.
Set-Cookie и auth challenges удаляются из ответа; redirects
upstream преобразуются в 502, чтобы fetch не перешёл на прямой Telegram URL.

Протокол и криптография не менялись. VPS видит сетевые метаданные и зашифрованные
MTProto-пакеты; Telegram sessions/auth keys остаются в браузере. Обычные облачные
Telegram-чаты не становятся E2E между пользователями: сохраняется существующее
шифрование MTProto клиент–Telegram. Relay не проксирует WebRTC media, внешние ссылки
и любые сторонние HTTP-ресурсы вне MTProto.

Access logs не включены; из error logs удаляется объект request. Тела сообщений и
auth keys не логируются relay. HAProxy настраивается владельцем VPS: не включайте
capture cookies/Authorization или тела запросов. Caddy использует tmpfs `/tmp` для
служебного storage, а не для Telegram-данных.

Основание для настройки Upgrade, TLS и header filtering:
[официальная документация Caddy reverse_proxy](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy).

## Проверки

```sh
corepack enable
corepack install
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test --runInBand
docker build -f deploy/Dockerfile -t telegram-web-k:local .
pnpm test:container
```

`pnpm lint` проверяет новый relay и tooling; upstream не имел ESLint/format check.
Полный исходный TypeScript проверяется `tsc --noEmit` и production Webpack build.
Jest теперь применяет ifdef preprocessing к TS так же, как Webpack; pvutils ESM
преобразуется Babel для совместимости с Jest 26. Исправлены два неверных expected
SRP fixture для пароля `101010`: проверены независимо Python hashlib и bigint.
Криптография приложения не изменялась.

Контейнерные тесты используют production image, временные TLS сертификаты, настоящий
Caddy и mock Telegram upstream. Проверяются все маршруты, TLS/SNI/Host, бинарные POST
и WebSocket, credentials/IP filtering, SSRF/redirect rejection, недоверенный сертификат,
статические SHA256, MIME/cache, Service Worker, SPA, healthcheck и restart. Временная
подмена upstream/CA применяется только к тестовому mount Caddyfile. В образ она не попадает.
Настоящий HAProxy в тесте дополнительно проверяет внешние HTTPS/WSS и domain ACL.

Итоги выполненных проверок: [implementation-report.md](implementation-report.md).

Реальные authorization, 2FA, upload/download, reconnect при потере сети, Premium,
проверка блокировок Telegram и VPS требуют отдельного ручного acceptance test.
Успех mock-тестов не подтверждает доступность реальных Telegram endpoints.

## Обновление upstream

Перед merge сохраните текущий deployed digest и чистый рабочий checkout:

```sh
git remote add upstream https://github.com/morethanwords/tweb.git # однократно
git fetch upstream
git switch feat/mtproto-relay
git merge upstream/master
git submodule update --init --recursive
pnpm install --frozen-lockfile
pnpm lint && pnpm typecheck && pnpm test --runInBand
docker build -f deploy/Dockerfile -t telegram-web-k:local .
pnpm test:container
```

Изменения клиента: `src/lib/mtproto/relayUrl.ts`, три места в `dcConfigurator.ts`.
Изменения сборки: `webpack.common.js` (define и root asset path), `webpack.prod.js`
(manifest реально emitted assets), package.json/pnpm lockfile. Linux исправления:
регистр `filemanager` в `cacheStorage.ts` и `apiFileManager.ts`. Тестовые изменения:
Jest transformer/config и два expected SRP значения.

Наиболее чувствительны DC host/suffix/path, новые обходящие configurator transports,
ifdef flags, worker origin и структура output. После merge проверьте все `new WebSocket`,
`apiws`, `apiw1`, `chooseServer`, Premium/file suffix, service worker fetch handlers.
Согласуйте flags `deploy/jest-transform.cjs` с Webpack. При переходе upstream на Vite
адаптируйте DefinePlugin и manifest/prepare-static к его фактическим артефактам.
Текущий `public/` содержит старые сборки: runtime берёт только compiler manifest
и явно перечисленные wasm/codec/assets, затем создаёт `dist/`. Нельзя просто
скопировать старый `public/index.html` в image.

После обновления package.json обновляйте `pnpm-lock.yaml` осознанно. Старый
`package-lock.json` оставлен как исходный upstream baseline; CI и Docker его не используют.
