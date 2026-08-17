## Telesrv Web K
Based on Telegram Web K, patched and improved. Available for everyone here: https://webk.telesrv.net

### Production deployment
Create folder:
```bash
mkdir -p /opt/gramsrv-tweb
cd /opt/gramsrv-tweb
```

Download the configuration files:
```bash
curl -o docker-compose.yaml https://raw.githubusercontent.com/iamxvbaba/gramsrv-tweb/dev/docker-compose.yaml
curl -o .env https://raw.githubusercontent.com/iamxvbaba/gramsrv-tweb/dev/.env.example
```

Run the container and check logs:
```bash
docker compose up -d
docker compose logs -f
```
Open http://localhost:80/ in your browser.


### Developing
Install dependencies with:
```lang=bash
pnpm install
```
This will install all the needed dependencies.

Run `pnpm start` to start the web server.
Open http://localhost:8080/ in your browser.

### Dependencies
* [BigInteger.js](https://github.com/peterolson/BigInteger.js) ([Unlicense](https://github.com/peterolson/BigInteger.js/blob/master/LICENSE))
* [fflate](https://github.com/101arrowz/fflate) ([MIT License](https://github.com/101arrowz/fflate/blob/master/LICENSE))
* [cryptography](https://github.com/spalt08/cryptography) ([Apache License 2.0](https://github.com/spalt08/cryptography/blob/master/LICENSE))
* [emoji-data](https://github.com/iamcal/emoji-data) ([MIT License](https://github.com/iamcal/emoji-data/blob/master/LICENSE))
* [emoji-test-regex-pattern](https://github.com/mathiasbynens/emoji-test-regex-pattern) ([MIT License](https://github.com/mathiasbynens/emoji-test-regex-pattern/blob/main/LICENSE))
* [tlottie](https://github.com/dkaraush/tlottie) (MIT License)
* [fast-png](https://github.com/image-js/fast-png) ([MIT License](https://github.com/image-js/fast-png/blob/master/LICENSE))
* [opus-recorder](https://github.com/chris-rudmin/opus-recorder) ([BSD License](https://github.com/chris-rudmin/opus-recorder/blob/master/LICENSE.md))
* [Prism](https://github.com/PrismJS/prism) ([MIT License](https://github.com/PrismJS/prism/blob/master/LICENSE))
* [Solid](https://github.com/solidjs/solid) ([MIT License](https://github.com/solidjs/solid/blob/main/LICENSE))
* [TinyLD](https://github.com/komodojp/tinyld) ([MIT License](https://github.com/komodojp/tinyld/blob/develop/license))
* [libwebp.js](https://libwebpjs.appspot.com/)
* fastBlur
* [Mediabunny](https://github.com/Vanilagy/mediabunny) ([Mozilla Public License 2.0](https://github.com/Vanilagy/mediabunny/blob/main/LICENSE))
* [Temml](https://github.com/ronkok/Temml) ([MIT License](https://github.com/ronkok/Temml/blob/main/LICENSE))

### Licensing
The source code is licensed under GPL v3. License is available [here](/LICENSE).
