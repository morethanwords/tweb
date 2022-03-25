## Telegram Web K
Based on Webogram, patched and improved. Available for everyone here: https://web.telegram.org/k/


### Developing
Install dependencies with:
```lang=bash
npm install
```
This will install all the needed dependencies.


#### Running web-server
Just run `npm start` to start the web server and the livereload task.
Open http://localhost:8080/ in your browser.


#### Running in production

Run `npm run build` to build the minimized production version of the app. Copy `public` folder contents to your web server.


### Dependencies
* [BigInteger.js](https://github.com/peterolson/BigInteger.js) ([Unlicense](https://github.com/peterolson/BigInteger.js/blob/master/LICENSE))
* [pako](https://github.com/nodeca/pako) ([MIT License](https://github.com/nodeca/pako/blob/master/LICENSE))
* [cryptography](https://github.com/spalt08/cryptography) ([Apache License 2.0](https://github.com/spalt08/cryptography/blob/master/LICENSE))
* [emoji-data](https://github.com/iamcal/emoji-data) ([MIT License](https://github.com/iamcal/emoji-data/blob/master/LICENSE))
* [twemoji-parser](https://github.com/twitter/twemoji-parser) ([MIT License](https://github.com/twitter/twemoji-parser/blob/master/LICENSE.md))
* [rlottie](https://github.com/rlottie/rlottie.github.io) ([MIT License](https://github.com/Samsung/rlottie/blob/master/licenses/COPYING.MIT))
* [fast-png](https://github.com/image-js/fast-png) ([MIT License](https://github.com/image-js/fast-png/blob/master/LICENSE))
* [opus-recorder](https://github.com/chris-rudmin/opus-recorder) ([BSD License](https://github.com/chris-rudmin/opus-recorder/blob/master/LICENSE.md))
* [libwebp.js](https://libwebpjs.appspot.com/)
* fastBlur

### Debugging
You are welcome in helping to minimize the impact of bugs. There are classes, binded to global context. Look through the code for certain one and just get it by its name in developer tools.
Source maps are included in production build for your convenience.

#### Additional query parameters
* **test=1**: to use test DCs
* **debug=1**: to use debug wherever it tests the flag

Should be applied like that: http://localhost:8080/?test=1


### Troubleshooting & Suggesting

If you find an issue with this app or wish something to be added, let Telegram know using the [Suggestions Platform](https://bugs.telegram.org/c/4002).

### Licensing

The source code is licensed under GPL v3. License is available [here](/LICENSE).
