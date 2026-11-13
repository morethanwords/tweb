# Telegram Web K на сервере с 3x-ui и HAProxy

Инструкция для `max.leocat.fyi` и установки 3x-ui собственным скриптом из соседнего
репозитория `../3x-ui`. Схема сверена с его `setup-v3.sh`: функциями `write_edge`,
`write_cert_hook` и генерацией Nginx. Это инструкция для этой установки, а не для
стандартного upstream installer 3x-ui.
Все команды выполняются вручную: подготовка этой инструкции не меняет сервер.
Контейнер обслуживает приложение и MTProto relay, Basic Auth включён в Caddy.

## 1. Определить действующий конфиг HAProxy

В предоставленном `/etc/haproxy/haproxy.cfg` есть только `global` и `defaults`.
Сам по себе такой файл не создаёт listener на 443. Установщик `setup-v3.sh`
запускает отдельный экземпляр HAProxy:

- systemd service: `xui-edge.service`;
- конфиг: `/etc/3x-ui-setup-v3/haproxy.cfg`;
- внешний `frontend public_tls`: TCP/SNI, порт 443;
- существующие backend: Xray TLS master и REALITY/сайт.

Сначала подтвердите это **на сервере**:

```sh
sudo systemctl show xui-edge.service -p ExecStart -p FragmentPath
sudo systemctl status xui-edge.service --no-pager
sudo ss -lntp '( sport = :443 )'
# При необходимости посмотрите аргументы актуального PID из ss:
# sudo ps -ww -p ACTUAL_PID -o args=
sudo less /etc/3x-ui-setup-v3/haproxy.cfg
```

Ожидается `ExecStart=/usr/sbin/haproxy -Ws -f /etc/3x-ui-setup-v3/haproxy.cfg ...`
и секция `frontend public_tls` с `req.ssl_sni`. Не публикуйте конфиг целиком:
там может находиться пароль stats. Если путь, сервис или структура отличаются,
сначала установите фактическую схему; последующие правки рассчитаны именно на неё.
Стандартный `haproxy.service` запускать или перезапускать для этого не нужно.

После настройки трафик пойдёт так:

```text
Internet :443 → HAProxy xui-edge, TCP/SNI
  ├─ прежние домены → прежние backend 3x-ui/Xray
  └─ max.leocat.fyi → 127.0.0.1:18443, HAProxy TLS → HTTP 127.0.0.1:8080, Caddy
                                                            └─ HTTPS/WSS Telegram
Internet :80 → существующий Nginx → ACME challenge / redirect на HTTPS
```

Новый TLS frontend слушает только loopback. Внешний 443 по-прежнему занимает
единственный `public_tls`; существующие `send-proxy-v2`, Nginx `proxy_protocol`,
ALPN и fallback 3x-ui сохраняются. В новой ветке PROXY protocol не используется.
SNI выбирает backend по имени из TLS ClientHello — см.
[HAProxy: req.ssl_sni](https://docs.haproxy.org/3.0/configuration.html#7.3.6-req.ssl_sni).

## 2. Домен и предварительные условия

В DNS зоны `leocat.fyi` создайте:

| Тип | Имя | Значение |
| --- | --- | --- |
| A | `max` | Публичный IPv4 сервера |
| AAAA, необязательно | `max` | IPv6 сервера, только если он доступен и обслуживает 80/443 |

Используйте прямую DNS-запись без CDN proxy. Отдельные `api`, `ws`, `dc1` и wildcard
не нужны: приложение и `/mtproto/*` работают на одном домене. Нужны входящие TCP
80/443 и исходящий HTTPS к Telegram/registry/ACME. Порты 8080 и 18443 наружу не открывайте.
Правила SSH и 3x-ui сохраняются; не очищайте firewall.

**Если домен другой:** замените **все** вхождения `max.leocat.fyi` в примерах ниже:
DNS, Nginx `server_name`, Certbot `--cert-name`/`-d`, пути `live/...`, HAProxy SNI,
переменную `domain` в renewal hook и URL проверок. Файлы `telegram-web-k.*`, имена
backend, Compose и приложение переименовывать не требуется. Образ пересобирать
из-за смены домена не нужно.

Нужны установленный Docker Engine с Compose v2, Certbot и работающие Nginx/HAProxy:

```sh
docker version
docker compose version
certbot --version
sudo nginx -t
sudo haproxy -c -f /etc/3x-ui-setup-v3/haproxy.cfg
sudo ss -lntp '( sport = :8080 or sport = :18443 )'
```

Последняя команда до установки не должна показывать занятые порты. Если заняты:
для 8080 согласованно поменяйте **хостовую** часть Compose `ports` и backend HAProxy;
для 18443 — `server tls` и `bind` нового TLS frontend. Контейнерный порт остаётся 8080.
Если Docker ещё нет, используйте [официальную инструкцию для Debian](https://docs.docker.com/engine/install/debian/).

## 3. Подготовить образ и Compose

Нужен образ **из ревизии с Basic Auth**. При подготовке этой инструкции изменения
Basic Auth ещё не опубликованы; предыдущий push в GitHub завершился ошибкой SSH.
Наличие актуального `ghcr.io/zkhvroman/telegram-web-k:main` пока не подтверждено.
Сначала отправьте изменения и дождитесь успешного workflow **Docker publish**:
push в `master`, release tag `v*` либо ручной запуск с `publish=true`.
Публикация feature-ветки вручную создаёт `sha-*`, но не обновляет `main`.
Возьмите полный image digest из summary workflow.

На локальном компьютере, из корня этого проекта, скопируйте Compose на сервер
(замените `USER@SERVER` на SSH-адрес):

```sh
ssh USER@SERVER 'mkdir -p ~/telegram-web-k && chmod 700 ~/telegram-web-k'
scp deploy/compose.yaml deploy/.env.example USER@SERVER:~/telegram-web-k/
```

Далее на сервере:

```sh
cd ~/telegram-web-k
cp -n .env.example .env
chmod 600 .env
# Только если GHCR package приватный: введите token с read:packages интерактивно.
# docker login ghcr.io
# Замените PUBLISHED_DIGEST на hex digest из workflow (без повторного sha256:).
docker pull ghcr.io/zkhvroman/telegram-web-k@sha256:PUBLISHED_DIGEST
docker run --rm -it ghcr.io/zkhvroman/telegram-web-k@sha256:PUBLISHED_DIGEST hash-password
nano .env
```

`hash-password` запросит пароль интерактивно и выведет bcrypt-хеш. Содержимое `.env`:

```dotenv
IMAGE=ghcr.io/zkhvroman/telegram-web-k
IMAGE_REF=@sha256:PUBLISHED_DIGEST
BASIC_AUTH_USER=admin
BASIC_AUTH_PASSWORD_HASH='$2a$14$ПОЛНЫЙ_ХЕШ_ИЗ_КОМАНДЫ'
```

Одинарные кавычки вокруг полного bcrypt-хеша обязательны, чтобы Compose сохранил `$`.
Пароль/хеш задаются на сервере, в образ и GitHub их добавлять не нужно.
`API_ID` и `API_HASH` здесь не задаются: остаётся выбранная публичная пара upstream,
встроенная при сборке. [Подробнее о сборке и переменных](deployment.md).

```sh
docker compose config --quiet
docker compose pull
docker compose up -d
docker compose ps
curl -fsS http://127.0.0.1:8080/healthz
curl -I http://127.0.0.1:8080/
curl -I --user admin http://127.0.0.1:8080/
```

Ожидается `healthy`, `/healthz` → 200, `/` без пароля → 401,
с верным паролем → 200. `curl --user admin` запросит пароль.
Если без пароля приходит 200, остановите развёртывание: выбран образ без защиты.

## 4. HTTP и сертификат через существующий Nginx

Сохраните исходный конфиг edge перед редактированием; выполняйте команды этого раздела
и настройки HAProxy в одной root-сессии:

```sh
sudo -i
umask 077
backup_dir="/root/telegram-web-k-backup-$(date +%Y%m%d-%H%M%S)"
mkdir -m 700 "$backup_dir"
cp -a /etc/3x-ui-setup-v3/haproxy.cfg "$backup_dir/haproxy.cfg"
echo "$backup_dir"
```

Запишите путь backup для отката. Создайте отдельный файл
`/etc/nginx/sites-available/telegram-web-k.conf` (существующий конфиг 3x-ui не меняется):

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name max.leocat.fyi;

    location ^~ /.well-known/acme-challenge/ {
        root /var/www/3x-ui-setup-v3/acme;
    }
    location / {
        return 301 https://$host$request_uri;
    }
}
```

Активируйте файл, проверьте конфиг и выпустите сертификат:

```sh
ln -s /etc/nginx/sites-available/telegram-web-k.conf /etc/nginx/sites-enabled/telegram-web-k.conf
nginx -t && systemctl reload nginx
certbot certonly --webroot -w /var/www/3x-ui-setup-v3/acme \
  --cert-name max.leocat.fyi -d max.leocat.fyi
install -d -m 700 /etc/haproxy/certs
# Выполняйте после успешного Certbot; PEM включает закрытый ключ.
cat /etc/letsencrypt/live/max.leocat.fyi/fullchain.pem \
    /etc/letsencrypt/live/max.leocat.fyi/privkey.pem \
    > /etc/haproxy/certs/telegram-web-k.pem
chmod 600 /etc/haproxy/certs/telegram-web-k.pem
```

Если сайт уже настроен повторно, не создавайте второй symlink/vhost.
Certbot использует работающий Nginx для HTTP-01; режим `standalone` не нужен,
поскольку 80 уже занят. DNS должен указывать на этот сервер, включая AAAA, если он есть.
См. [Certbot webroot](https://eff-certbot.readthedocs.io/en/stable/using.html#webroot).

## 5. Добавить домен в действующий xui-edge

Редактируйте `/etc/3x-ui-setup-v3/haproxy.cfg`. Внутри **существующего**
`frontend public_tls`, после строк `tcp-request`, перед прежними `use_backend`, добавьте:

```haproxy
 acl telegram_web_sni req.ssl_sni -i max.leocat.fyi
 use_backend telegram_web_tls if telegram_web_sni
```

Сохраните прежние `bind`, `tcp-request inspect-delay`, `tcp-request content accept`,
`use_backend` и `default_backend`. В конец файла добавьте три новые секции:

```haproxy
backend telegram_web_tls
 mode tcp
 timeout connect 5s
 timeout server 1h
 server tls 127.0.0.1:18443 check

frontend telegram_web_https
 bind 127.0.0.1:18443 ssl crt /etc/haproxy/certs/telegram-web-k.pem alpn h2,http/1.1 ssl-min-ver TLSv1.2
 mode http
 option httplog
 timeout client 75s
 http-request set-header X-Forwarded-Proto https
 default_backend telegram_web

backend telegram_web
 mode http
 option httpchk GET /healthz
 http-check expect status 200
 timeout connect 10s
 timeout server 75s
 timeout tunnel 1h
 server web1 127.0.0.1:8080 check
```

Не добавляйте `send-proxy` в эти новые backend: Caddy и новый TLS frontend не ожидают
PROXY protocol. `Authorization` должен доходить до Caddy для Basic Auth; сам Caddy
удаляет его перед обращением к Telegram. WebSocket Upgrade HAProxy пропускает штатно.

Проверка и применение, всё ещё из root-сессии:

```sh
haproxy -c -f /etc/3x-ui-setup-v3/haproxy.cfg && systemctl reload xui-edge.service
systemctl status xui-edge.service --no-pager
ss -lntp '( sport = :443 or sport = :18443 or sport = :8080 )'
```

При ошибке проверки не перезагружайте сервис, исправьте конфиг.
8080 и 18443 должны слушать только `127.0.0.1`; 443 — внешний адрес.
На существующих доменах проверьте панель 3x-ui, подписку и подключение VPN.

**Установщик перезаписывает этот файл при `reconfigure`/обновлении.** Сохраните отдельную
копию добавленных секций. После обслуживания 3x-ui проверьте и при необходимости снова
внесите именно эти добавления, выполните `haproxy -c`, reload и проверки приложения.
Не возвращайте целиком старый конфиг поверх нового: порты/маршруты Xray могли измениться.

## 6. Автоматическое продление сертификата

HAProxy использует объединённый PEM, поэтому после продления его нужно обновлять.
Создайте **отдельный** файл
`/etc/letsencrypt/renewal-hooks/deploy/telegram-web-k.sh`, сохранив существующий hook 3x-ui:

```bash
#!/usr/bin/env bash
set -Eeuo pipefail
domain='max.leocat.fyi' # ЗАМЕНИТЬ при другом домене.
lineage="/etc/letsencrypt/live/$domain"
[[ "${RENEWED_LINEAGE:-}" == "$lineage" ]] || exit 0

umask 077
dest='/etc/haproxy/certs/telegram-web-k.pem'
tmp=$(mktemp "${dest}.XXXXXX")
trap 'rm -f -- "$tmp"' EXIT
cat "$lineage/fullchain.pem" "$lineage/privkey.pem" > "$tmp"
chmod 600 "$tmp"
mv -f -- "$tmp" "$dest"
/usr/sbin/haproxy -c -f /etc/3x-ui-setup-v3/haproxy.cfg
systemctl reload xui-edge.service
```

Затем проверьте права, hook с действующим сертификатом и ACME renewal:

```sh
chmod 750 /etc/letsencrypt/renewal-hooks/deploy/telegram-web-k.sh
bash -n /etc/letsencrypt/renewal-hooks/deploy/telegram-web-k.sh
RENEWED_LINEAGE=/etc/letsencrypt/live/max.leocat.fyi \
  /etc/letsencrypt/renewal-hooks/deploy/telegram-web-k.sh
certbot renew --cert-name max.leocat.fyi --dry-run
systemctl list-timers --all | grep -E 'certbot|letsencrypt'
exit
```

Последний `exit` завершает root-сессию. Должен быть настроен штатный timer/cron Certbot;
если его нет, включите механизм обновления вашей установки Certbot. Dry-run проверяет
ACME, но по умолчанию не запускает deploy hooks — поэтому hook проверяется отдельно
с действующим сертификатом. Он срабатывает только для нового домена и не перезапускает
Xray. См. [Certbot renewal hooks](https://eff-certbot.readthedocs.io/en/stable/using.html#renewing-certificates).

## 7. Проверки с внешнего компьютера

```sh
curl -I http://max.leocat.fyi/                     # 301 на HTTPS
curl -fsS https://max.leocat.fyi/healthz           # 200, без пароля
curl -I https://max.leocat.fyi/                   # 401, WWW-Authenticate
curl -I --user admin https://max.leocat.fyi/      # 200 с верным паролем
curl -fsS --user admin https://max.leocat.fyi/build-info.json
```

Не используйте `curl -k`: проверка должна подтвердить доверенный TLS-сертификат.
Откройте сайт в браузере, пройдите Basic Auth, затем вход Telegram. В DevTools → Network:
WebSocket — `wss://max.leocat.fyi/mtproto/...`, POST — тот же домен; прямых запросов
к Telegram DC из браузера быть не должно. Проверьте отправку сообщения, загрузку и
скачивание файла, reconnect. `/?http=1` включает HTTP transport для проверки fallback.
Полный [acceptance checklist](deployment.md#проверка-реального-telegram).

`/healthz` подтверждает работу контейнера, но не доступность Telegram с VPS.
Basic Auth защищает сетевой доступ и не удаляет уже скачанные данные браузера.

## 8. Обновление, диагностика и откат

Перед обновлением сохраните текущий `IMAGE_REF` и копию `.env` с правами 600.
Поменяйте digest в `.env`, затем:

```sh
cd ~/telegram-web-k
docker compose pull && docker compose up -d
docker compose ps
curl -fsS --user admin https://max.leocat.fyi/build-info.json
```

Для отката приложения верните прежний digest и повторите команды. При замене
единственного контейнера активные WebSocket разорвутся, клиент переподключится.
Для смены Basic Auth сгенерируйте новый хеш и измените `.env`, затем `docker compose up -d`.

Диагностика:

```sh
cd ~/telegram-web-k
docker compose logs --tail=100 web
sudo journalctl -u xui-edge.service --since '15 minutes ago' --no-pager
sudo haproxy -c -f /etc/3x-ui-setup-v3/haproxy.cfg
sudo nginx -t
```

Если при первоначальной настройке нарушилась работа 3x-ui, верните backup edge
(замените `BACKUP_DIRECTORY` на записанный ранее путь, убедитесь, что после backup
не было других изменений конфигурации):

```sh
sudo cp -a BACKUP_DIRECTORY/haproxy.cfg /etc/3x-ui-setup-v3/haproxy.cfg
sudo haproxy -c -f /etc/3x-ui-setup-v3/haproxy.cfg && sudo systemctl reload xui-edge.service
```

Это уберёт маршрут нового домена и восстановит прежнюю схему. Контейнер при
необходимости остановите `docker compose down` из `~/telegram-web-k`.
Новый Nginx vhost обслуживает только `max.leocat.fyi` и не заменяет vhost 3x-ui.
