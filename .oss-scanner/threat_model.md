# Threat model

## What Telegram Web K is and where untrusted input enters

Telegram Web K is the Telegram web client served at https://web.telegram.org/k/, written in TypeScript with Solid.js
(a fork in `src/vendor/solid/`). It speaks MTProto 2.0 to Telegram's servers itself, from a SharedWorker
(`src/lib/mtproto/`, `src/lib/crypto/`, `src/lib/mainWorker/`). It keeps the session and its cache in the browser:
the auth keys in localStorage (`src/lib/sessionStorage.ts`), state in IndexedDB (`src/lib/storages/`), media in
CacheStorage (`src/lib/files/`). A ServiceWorker streams media and handles the Web Share Target
(`src/lib/serviceWorker/`). Business logic lives in the managers in `src/lib/appManagers/`; the UI is in
`src/components/`. Paths below are relative to `src/`.

Script that runs in the client's origin owns the account: it can read the auth keys and act as the user. The origin is
shared with the other Telegram web client at `web.telegram.org/a/`, so it owns that client's session too.

The main attacker is any other Telegram user, bot or channel. Anyone can message the victim, add them to a group or
post in a channel they read. Everything such a party controls is untrusted, even though it arrives from Telegram's
servers over an authenticated MTProto session:

* message text and entities, turned into DOM by `lib/richTextProcessor/` (`wrapRichText.ts`, `parseEntities.ts`,
  `parseMarkdown.ts`, `wrapUrl.ts`), rich messages (`lib/richMessage.ts`, `components/chat/bubbles/richMessage.tsx`),
  formulas (Temml, `components/instantViewMath.tsx`) and code blocks (`vendor/prism.ts`);
* Instant View pages and link previews (`components/instantView.tsx`, `components/instantViewFormatting.ts`,
  `lib/appManagers/appWebPagesManager.ts`), including the embeds IV puts in sandboxed iframes;
* names, usernames, bios, captions, polls, contacts, locations, reply and inline keyboards, inline bot results, and
  file names and MIME types;
* media, much of it downloaded and decoded without a click: photos, videos and GIFs, voice and round video messages
  (`lib/opusDecodeController.ts`, `vendor/opus/`), stickers in every format (Lottie TGS through the WASM renderer in
  `lib/lottie/` and `vendor/tlottie/`, WebM, WebP through `lib/webp/` where the browser lacks it), custom emoji
  (`lib/customEmoji/`), HLS and RTMP streams (`lib/hls/`, `lib/rtmp/`), wallpapers, patterns and themes
  (`lib/appManagers/appThemesManager.ts`), statistics charts (`lib/tchart/`), and cloud language packs
  (`lib/langPack.ts`);
* links: `tg://` and `t.me` links handled in `lib/internalLinkProcessor.ts` and `lib/internalLink.ts`, and the
  warning before a link whose text hides its target (`helpers/dom/safeWindowOpen.ts`, `showMaskedAlert`);
* bot Mini Apps and payment forms: web pages written by arbitrary bot or site owners, loaded in iframes
  (`components/telegramWebView.ts`), which talk to the client through the `postMessage` bridge in
  `components/webApp.tsx`, `components/popups/webApp.tsx` and `components/popups/payment.tsx`;
* calls and group calls (`lib/calls/`): the other party's signaling, the SDP built from it (`lib/calls/sdp/`), and
  the end-to-end encryption of conference calls (`lib/calls/e2e/`).

The second attacker is a web page in another origin. It can open the client in a window or a frame, `postMessage`
to it, and send it a Web Share Target request (`lib/serviceWorker/share.ts`). Message handlers that do not check the
sender, and any action a cross-origin request can trigger without the user's confirmation, are in scope.

The third is on the network. The client reaches Telegram over WebSocket or HTTPS, so the network attacker sees TLS
first, then MTProto's obfuscation (`lib/mtproto/transports/`). In scope still: auth key creation and the server's
RSA key checks (`lib/mtproto/authorizer.ts`, `lib/mtproto/rsaKeysManager.ts`, `lib/crypto/dhValidation.ts`),
temporary keys (`lib/mtproto/tempAuthKeys.ts`), the decryption and integrity checks of incoming packets
(`lib/mtproto/networker.ts`), and the 2FA password check (`lib/crypto/srp.ts`).

We treat Telegram's servers as honest relays. Data that only the server controls (configuration, data center
options, fields no other user can set) is less important than data another user controls, and a report that needs a
malicious Telegram server should say so. The user, their browser, its extensions and the browser profile are trusted.

## Components that matter most and least

Most important:

* `lib/richTextProcessor/`, `lib/richMessage.ts`, `components/chat/`, `components/instantView*`: everything that
  turns another user's content into DOM;
* `components/webApp.tsx`, `components/telegramWebView.ts`, `components/popups/webApp.tsx`,
  `components/popups/payment.tsx`: iframes and their bridges to the client;
* `lib/internalLinkProcessor.ts`, `lib/internalLink.ts`, `helpers/dom/safeWindowOpen.ts`: links that act;
* `lib/serviceWorker/`, `lib/superMessagePort.ts`, `lib/apiManagerProxy.ts`: messages between the tabs, the workers
  and other origins;
* `lib/lottie/`, `lib/webp/`, `lib/hls/`, `lib/rtmp/`, `lib/opusDecodeController.ts`, `lib/customEmoji/`,
  `lib/appManagers/appThemesManager.ts`: decoding attacker-supplied media and themes;
* `lib/mtproto/`, `lib/crypto/`, `lib/sessionStorage.ts`: the protocol and the keys; `lib/passcode/` and
  `lib/encryptedStorageLayer.ts`: the local passcode and the storage it encrypts;
* `lib/appManagers/`: turning server updates into client objects;
* `lib/calls/`.

Lower priority: settings tabs, popups that only show the user's own data, and layout code.

Out of scope:

* `public/`, which holds the committed production bundle. It is built from `src/`: report against the source;
* npm dependencies in `node_modules`, except where the client misuses them;
* vendored code in `src/vendor/`, unless content from Telegram reaches the bug. Then name the upstream project;
* the popup sandbox (`components/popupSandbox/`), which only dev builds contain, and other dev tooling;
* `src/scripts/`, `scripts/`, `src/tests/`, `e2e/`, `server.js` and the `.docker/` files;
* the headers web.telegram.org is served with (CSP, framing), which are not in this repository.

## How to exercise it

* The image has the dependencies installed and the production bundle built in `/src/dist` with source maps.
  `pnpm start` runs the dev server on port 8080, and `node server.js --dist` serves the bundle.
* The app cannot sign in without Telegram's servers, and the scan has none. The practical way to reproduce a bug is a
  unit test that feeds the crafted input to the function in question: `pnpm test --run src/tests/<file>` (Vitest,
  jsdom, setup in `src/tests/setup.ts`). The tests in `src/tests/` show how to build messages and entities.
* The popup sandbox renders every popup from mock data with no Telegram traffic: open the dev server with
  `?popups=1`, or drive it with `window.popupSandbox` (`list`, `open`). Chromium for Playwright is installed:
  `pnpm test:popups` runs the sandbox suites, and `pnpm exec playwright test e2e/<spec>` runs one spec.
* For received content, show the TL object (constructor and fields, typed in `src/layer.d.ts`) that another user can
  get delivered, and say whether the server is likely to relay it unchanged. Entity offsets, URLs and file names may
  be validated server-side.

## How we rate severity

* Critical: script execution in the client's origin from content another user, bot or channel sends, with no
  interaction beyond receiving it or opening the chat. Reading the auth keys from another origin. Reading or forging
  MTProto traffic, or obtaining the auth key, as a network attacker.
* High: script execution in the client's origin that needs one ordinary action, such as clicking a link or opening a
  file, an Instant View page, a Mini App or a payment form. A Mini App, an IV embed or another iframe escaping its
  sandbox or reaching the client's window. A Mini App, a link or another origin making the client act without the
  confirmation the user normally sees: sending messages or files, sharing the phone number, joining a chat, paying,
  or authorizing a login. A received message that breaks the client again on every load.
* Medium: a received message that freezes or crashes the tab until it is reloaded. Hiding a link's real target past
  the warning, or other UI spoofing of a sender, a link or a file. CSS injection without script. Leaking the user's IP
  address to a third party without a click.
* Low: resource exhaustion that does not freeze the tab. Issues that need a malicious Telegram server rank one level
  below the same issue from a field another user controls.

## Anything to leave alone

* `VITE_API_ID` and `VITE_API_HASH` in `.env`, which are public by design.
* Missing or weak security headers on web.telegram.org: the server sets them, not this code.
* Self-XSS through the developer console, and attacks by someone who already controls the browser, its profile or an
  extension.
* Memory leaks without a security impact.
* Bugs in npm dependencies, unless the client's use of them is the problem.
