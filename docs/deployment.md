# Развёртывание за существующим HAProxy

Для сервера с 3x-ui, отдельным `xui-edge.service` и TCP/SNI на 443 используйте
[пошаговую инструкцию для max.leocat.fyi](deployment-3x-ui.md).
Пример HTTPS frontend ниже предназначен для HAProxy, который уже завершает TLS;
он не подходит для прямой вставки в TCP frontend 3x-ui.

## Локальная сборка и запуск

Нужны Docker с BuildKit, для разработки — Node из `.node-version`, Corepack и pnpm
из `packageManager`. Перед сборкой инициализируйте submodules:

```sh
git submodule update --init --recursive
docker build -f deploy/Dockerfile -t telegram-web-k:local .
# Введите пароль интерактивно; команда выведет bcrypt-хеш:
docker run --rm -it telegram-web-k:local hash-password
# Подставьте полученный хеш вместо PASTE_BCRYPT_HASH:
docker run --rm -p 127.0.0.1:8080:8080 \
  -e BASIC_AUTH_USER=admin \
  -e 'BASIC_AUTH_PASSWORD_HASH=PASTE_BCRYPT_HASH' telegram-web-k:local
# В другом терминале:
curl -f http://127.0.0.1:8080/healthz
```

Builder собирает Webpack в `public/`, формирует `dist/` только из свежего compiler
manifest и необходимых статических codecs/wasm/assets. Runtime — официальный Caddy,
UID/GID 10001, HTTP 8080, без Node.js, pnpm, node_modules и source maps. Base images
закреплены manifest digest, pnpm dependencies — lockfile. Для обновлений безопасности
обновляйте base digests с повторным прогоном тестов.

Образ по умолчанию использует публичные application credentials upstream для Webogram.
Для своего приложения передайте полученные на my.telegram.org значения при сборке:

```sh
docker build -f deploy/Dockerfile -t telegram-web-k:local \
  --build-arg API_ID=YOUR_NUMERIC_ID \
  --build-arg API_HASH=YOUR_32_HEX_HASH .
```

Эти параметры и `VITE_MTPROTO_RELAY_PATH=/mtproto` видны в frontend и не являются
секретным хранилищем. GitHub workflows читают repository variables `API_ID` и `API_HASH`
из **Settings → Secrets and variables → Actions → Variables**. Если оба значения
отсутствуют или пусты, используются credentials upstream. Если оба заданы — они
применяются к frontend build, Docker CI и публикации GHCR. Неполная пара или неверный
формат останавливают сборку, чтобы не смешивать credentials разных приложений.
Defaults централизованы в `deploy/build-env.cjs`; менять workflows для настройки не нужно.
Это именно Variables, не Secrets. Для переопределения уже опубликованного image нужен
новый commit: существующий `sha-*` tag намеренно не пересобирается.
`API_HASH` приложения не является
пользовательским MTProto auth key. Runtime environment не меняет frontend-конфигурацию.

## Basic Auth для доступа к приложению

Caddy требует HTTP Basic Auth для страниц, статики, Service Worker и `/mtproto/*`.
Единственное исключение — `/healthz`, чтобы Docker/HAProxy проверяли сервер без пароля.
Без credentials или с неверным паролем ответ — `401` с `WWW-Authenticate`; браузер
показывает стандартный запрос логина и пароля перед загрузкой приложения.

На VPS задайте `BASIC_AUTH_USER` и `BASIC_AUTH_PASSWORD_HASH` в `.env` рядом с Compose:

```dotenv
BASIC_AUTH_USER=admin
BASIC_AUTH_PASSWORD_HASH='$2a$14$ПОЛНЫЙ_ХЕШ_ИЗ_CADDY'
```

Создайте хеш локальным образом, как показано выше, либо опубликованным:

```sh
docker run --rm -it ghcr.io/zkhvroman/telegram-web-k:main hash-password
```

Это **bcrypt-хеш**, не открытый пароль. Одинарные кавычки в Compose `.env` сохраняют
символы `$` в хеше. Не передавайте этот файл напрямую в `docker run --env-file`:
формат этого флага отличается от Compose и сохраняет кавычки как часть значения.
Для `docker run` используйте `-e`, как в примере локального запуска.

Эти два параметра относятся к runtime, не к GitHub Variables `API_ID`/`API_HASH`.
Они не встраиваются в JavaScript или Docker image. Compose требует оба значения,
а Caddy с пустой парой не запускается: отсутствие конфигурации не открывает сайт.
После изменения логина/хеша выполните `docker compose up -d`; пересборка не нужна.

HTTPS завершает существующий HAProxy; он должен сохранять Authorization на участке
HAProxy → Caddy. Сам Caddy удаляет Authorization перед отправкой запроса Telegram.
Не включайте кэширование защищённых ответов на HAProxy/CDN. Статика имеет `private`
cache policy, а ответы 401 и relay — `no-store`.

Basic Auth закрывает сетевой доступ, но не удаляет уже скачанные данные из браузера
и Service Worker cache. Это отдельный пароль доступа к сайту, не Telegram login/2FA.
После включения защиты на ранее открытом сайте перезагрузите страницу; проверьте
авторизацию и работу файлов/worker в целевых браузерах.
Описание механизма: [Caddy basic_auth](https://caddyserver.com/docs/caddyfile/directives/basic_auth).

## Настройка GitHub

1. Сохраните изменения в ветке `feat/mtproto-relay`, затем отправьте её и создайте PR
   в `master` самостоятельно. Этот процесс не выполняет push автоматически.
2. В fork включите Actions и разрешите GitHub token публиковать packages. Workflow
   запрашивает `contents: read`, а publish job дополнительно `packages: write`.
3. GHCR package называется `ghcr.io/<owner-в-нижнем-регистре>/telegram-web-k`.
   Если он уже существует, предоставьте этому repository доступ в package settings.
4. Сделайте package public для anonymous pull либо настройте read-only GHCR token
   на VPS. Для публикации workflow использует встроенный GITHUB_TOKEN, без PAT.
5. При публичном распространении обеспечьте постоянную доступность corresponding
   source для каждого digest; подробнее ниже. Настройте branch protection на CI.

`ci.yml` запускается на PR → master, push master/feat/**, вручную и как reusable
workflow. Он устанавливает submodules, Node/pnpm с cache, выполняет lint, полный
typecheck, upstream/relay tests, production build, Docker build, container tests
с TLS mock и HAProxy, затем Trivy gate. В PR нет secrets и `pull_request_target`.

`docker-publish.yml` работает на push master, теги `v*` и вручную. Сначала вызывает
полный CI для того же commit. Только после успеха разрешена публикация. Ручной
запуск по умолчанию выполняет проверки без publish; нужен явный `publish=true`.
На master обычный CI и gate публикации могут выполняться одновременно: это
самостоятельные workflows с общим Buildx cache. Deployment на VPS не выполняется.

| Tag | Назначение |
|---|---|
| `main` | Проверенная публикация ветки master |
| `sha-<12 символов SHA>` | Снимок commit; workflow не перезаписывает существующий tag |
| `v1.0.0` | Публикация Git tag `v1.0.0` |
| `latest` | Только публикации release tags `v*`, не каждый commit |

Публикуются linux/amd64 и linux/arm64; frontend builder использует BUILDPLATFORM.
Добавлены OCI labels source/revision/version/created/licenses, SBOM и provenance.
Summary содержит digest. Для строгой воспроизводимости используйте digest: администратор
registry технически способен удалить/переписать tag вне workflow. При повторной
публикации SHA aliases указывают на уже существующий digest. Чтобы пересобрать base
image/security update, создайте новый commit с изменёнными digest/lockfile.

Trivy проверяет runtime image и блокирует CRITICAL, включая ещё не исправленные.
Исключений по умолчанию нет; нельзя добавлять массовый ignore или continue-on-error.
Исключение допустимо только отдельным reviewed изменением с CVE, обоснованием,
владельцем и сроком. Унаследованные старые devDependencies отсутствуют в runtime,
но требуют отдельной модернизации build toolchain. Локальный успех сборки не заменяет
актуальную проверку базы CVE в GitHub.

## VPS: DNS, Compose и HAProxy

Создайте A/AAAA для своего домена, например `telegram.example.com`, на VPS. Существующий
HAProxy должен уже иметь сертификат этого домена и слушать 443. Контейнер не запрашивает
сертификаты и не делает HTTP→HTTPS redirects.

Скопируйте `deploy/compose.yaml`, `deploy/.env.example` и HAProxy example на VPS:

```sh
mkdir -p ~/telegram-web-k
cd ~/telegram-web-k
# Поместите compose.yaml и .env.example в этот каталог.
cp .env.example .env
# Укажите реальный owner вместо OWNER (нижний регистр):
sed -i 's|ghcr.io/OWNER/telegram-web-k|ghcr.io/YOUR_OWNER/telegram-web-k|' .env
# Задайте BASIC_AUTH_USER и BASIC_AUTH_PASSWORD_HASH в .env по инструкции выше.
# При приватном package: интерактивно введите read:packages token.
docker login ghcr.io
docker compose pull
docker compose up -d
docker compose ps
curl -fsS http://127.0.0.1:8080/healthz
```

Для public package `docker login` не требуется. Compose запускает готовый image,
без build, с `restart: unless-stopped`, read-only root, всеми capabilities dropped,
no-new-privileges и tmpfs 16 MiB. Постоянных volumes нет. Лимиты CPU/RAM/pids в примере
нужно подобрать под нагрузку; Caddy поддерживает параллельные соединения пользователей.

В существующий HTTPS frontend добавьте только ACL/headers/use_backend, сохранив
его существующие bind, certificate, глобальные настройки и остальные маршруты:

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

HAProxy автоматически поддерживает HTTP Upgrade; не удаляйте Connection/Upgrade/
Sec-WebSocket-Protocol. Timeout tunnel нужен для долгих WebSocket. Проверьте, что
унаследованный timeout client допускает обычные HTTP запросы/скачивание (обычно 75s
или больше); изменения существующей инфраструктуры выполняет администратор.
X-Forwarded-Proto передаётся для совместимости, но URL клиент строит по внешнему
browser origin, поэтому HTTPS→WSS не зависит от доверия к заголовку. Caddy не
передаёт этот заголовок Telegram.

После редактирования реального файла HAProxy:

```sh
sudo haproxy -c -f /etc/haproxy/haproxy.cfg
sudo systemctl reload haproxy
curl -fsS https://telegram.example.com/healthz
curl -I https://telegram.example.com/ # Без credentials ожидается 401.
curl -I --user admin https://telegram.example.com/sw.js # curl запросит пароль.
```

Если HAProxy работает в Docker, подключите его и сервис `web` к общей external network,
уберите `ports` у Web K и используйте `server web1 telegram-web-k:8080 check`. Изменение
Compose для этого варианта:

```yaml
services:
  web:
    # Остальные параметры сохранены; поле ports удалено.
    networks:
      edge:
        aliases: [telegram-web-k]
networks:
  edge:
    external: true
```

При необходимости создайте сеть `docker network create edge`, затем подключите к ней
существующий HAProxy через его Compose. Не публикуйте порт Web K на 0.0.0.0.

## Проверка реального Telegram

`/healthz` проверяет локальный HTTP server и наличие `index.html`; он не ходит в Telegram.
Отдельная TLS/connectivity диагностика с VPS:

```sh
curl -sS --connect-timeout 10 --max-time 20 -o /dev/null -w '%{http_code}\n' \
  -X POST --data-binary '' https://venus.web.telegram.org/apiw1
curl --http1.1 -i --user admin --max-time 5 \
  -H 'Connection: Upgrade' -H 'Upgrade: websocket' \
  -H 'Sec-WebSocket-Version: 13' -H 'Sec-WebSocket-Protocol: binary' \
  -H 'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==' \
  https://telegram.example.com/mtproto/kws2/apiws
```

Пустой MTProto POST может вернуть protocol error — это проверка TLS/HTTP доступности,
не authorization. Для WebSocket ожидается 101; `curl` после Upgrade может завершиться
по `--max-time`, это не ошибка самого handshake. Запрет/недоступность конкретного DC
исследуйте отдельно для всех используемых main/file/test endpoints.

Ручной acceptance в браузере:

1. Откройте HTTPS домен, введите логин/пароль Basic Auth. Затем откройте
   DevTools → Network (включая workers), войдите в свой Telegram
   аккаунт и проверьте 2FA, если она включена. В production используйте собственный
   доверенный домен, поскольку он обслуживает код, который получает Telegram session.
2. Все MTProto WS имеют `wss://ваш-домен/mtproto/...`, HTTP POST — тот же домен.
   При загрузке файлов проверьте маршруты `-1`. Прямых `*.web.telegram.org/apiw*` быть не должно.
3. Отправьте сообщение, загрузите и скачайте файл; проверьте несколько параллельных загрузок.
4. Включите offline, затем верните сеть: reconnect должен снова использовать relay.
5. Для проверки fallback заблокируйте в DevTools WS маршруты либо откройте `/?http=1`:
   POST должен идти через relay. Остановите контейнер и убедитесь, что прямых попыток нет.
6. После обновления сравните `/build-info.json` revision и JS hashes, перезагрузите страницу,
   проверьте обновление `sw.js`. При смене старого прямого deployment на relay закройте
   старые вкладки/обновите Service Worker: уже загруженный старый код не меняется автоматически.

Test DC включаются `/?test=1`; это отдельная Telegram test environment. Premium этот
старый checkout не реализует — см. [ограничения relay](mtproto-relay.md).

## Обновление, rollback, диагностика

```sh
cd ~/telegram-web-k
# Сохранить фактически запущенный digest перед обновлением:
docker inspect --format '{{.Image}}' "$(docker compose ps -q web)"
docker image inspect --format '{{json .RepoDigests}}' "$(docker inspect --format '{{.Image}}' "$(docker compose ps -q web)")"
# Сохраните ghcr.io/...@sha256:... в журнале deployment.
docker compose pull && docker compose up -d
docker compose ps
curl -fsS --user admin https://telegram.example.com/build-info.json
```

Для закрепления/отката задайте в `.env` `IMAGE_REF=@sha256:НУЖНЫЙ_DIGEST`; он имеет
приоритет над IMAGE_TAG. Затем выполните те же `docker compose pull && docker compose up -d`.
Для возврата к обновляемому `main` удалите IMAGE_REF. Active WebSocket при замене
единственного контейнера закрываются; клиент reconnect. Это не zero-downtime deployment.

```sh
docker compose logs --tail=100 web
docker inspect --format '{{json .State.Health}}' "$(docker compose ps -q web)"
docker compose exec web caddy validate --config /etc/caddy/Caddyfile
curl -i --user admin http://127.0.0.1:8080/mtproto/unknown # С credentials: 404; без них: 401.
```

Если Caddy здоров, но Telegram не подключается: проверьте DNS/egress 443 VPS, TLS/SNI,
HTTP 101, timeout tunnel, ACL и соединения worker. Не отключайте TLS verification.

## GPL и соответствующий исходный код

Runtime содержит `/LICENSE`, `/NOTICE`, `/UPSTREAM-README.md`; upstream notices и
лицензии зависимостей сохраняются. OCI source у опубликованного образа указывает на fork,
revision — точный commit. Workflow создаёт source archive с рекурсивными submodules и
сохраняет его как Actions artifact (90 дней). **Artifact с ограниченным сроком хранения
не заменяет постоянную выдачу source получателям образа.**

Для распространения держите публичный fork с неизменяемыми release refs и доступными
исходниками submodules; разместите corresponding source archive рядом с релизом и
ссылкой на image digest. Для private distribution предоставляйте его получателям напрямую.
После commit всех изменений и инициализации submodules архив можно подготовить так:

```sh
node deploy/source-archive.cjs source.tar.gz
```

В архив входят tracked files и pinned submodules, включая build/deploy scripts; незакоммиченные
новые файлы не включаются. Не распространяйте образ без исходников соответствующей ревизии.
CI не публикует GitHub Release и не развёртывает VPS автоматически.
