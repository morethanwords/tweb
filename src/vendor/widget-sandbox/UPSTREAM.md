# widget-sandbox (vendored)

`packages/core` of TelegramMessenger/widget-sandbox at `v0.6.3` (main's 7a2ec35, a QuickJS hardening release; its
`src/` is v0.6.0's): `src/`, `vite.ts`, `profile.json`,
`scripts/sandbox-build.ts`, `scripts/profile-build.ts`, `package.json`, `tsconfig.json`, `README.md`, and the repo's
`THIRD_PARTY_NOTICES.md`. Its QuickJS build (`packages/quickjs-wasm`: `dist/`, `package.json`, the licence) is next to
it in `src/vendor/widget-sandbox-quickjs`, linked as `@telegram/widget-sandbox-quickjs` from tweb's package.json —
v0.6.3's `dist/`, the QuickJS fork at b02310a (v0.6.1's seven upstream memory-safety fixes, the RegExp-delete
use-after-free among them, and the parser's failed scope pushes and label allocations propagated, so neither a scope
nor a label is ever read or written below its table); every file matches v0.6.3's `dist.sha256`
(`emscripten-module.wasm` ded68186…), and the asyncify build is made from it (`scripts/asyncify.mjs`). The
package's tests, the native packages, the apps, the corpus and the conformance set stay upstream (tweb's fixtures are a
copy of part of the corpus — all of `corpus/attacks`, `corpus/defaults`, `corpus/interactive` and `corpus/resize` — and
of the conformance set, in `src/lib/widgetSandbox/fixtures/`; the sandbox's mock bot, `src/lib/widgetSandbox/mockBot.ts`,
follows the dev app's `apps/web/src/mock-bot.ts`).
Never mix files from two tags.

How tweb uses it: `src/lib/widgetSandbox/` (runtime, actions, storage, theme, payload, fixtures), `src/components/widgetSandbox/`
(the bubble block and the sandbox page), `src/lib/appManagers/appWidgetsManager.ts` (the per-message storage on disk),
`e2e/popupSandboxWidgets.spec.ts` with `e2e/widgetCanary.mts` (the attack corpus against the canary),
`scripts/widget-sandbox-plugin.mjs` (builds the in-page bundles; tweb does not use the package's own `vite.ts`, which
sets COOP/COEP), the Vite-only `widget-sandbox` alias, and the types in `src/lib/widgetSandbox/vendor.d.ts` (tsc does
not read these sources: they are written for strictNullChecks).

## Local changes, to be sent upstream

tweb renders through the Shadow DOM renderer with every widget's engine in the page's engine worker (`worker`, item 8)
in every browser; `inline` (the engine in the page, item 4, also what a page without workers gets), `sab` (a worker
each) and `frame` (the engine in the renderer's iframe) stay as debug switches.

v0.4.0's content safe area: a widget with no caption below it (none, or one shown above it) has its message's time
drawn over its bottom corner, as a photo has (`bubbles.ts`, the floating time), and is told the band and the corner
the time takes (`lib/widgetSandbox/safeArea.ts`, measured from the time as laid out: its backing with its margins). A
widget starts before its bubble is in the chat, so the time is measured in the staged copy of the bubble
(`staging.ts` copies it there); after that the band follows the time's size ("edited", views) and the interface's
direction, never the chat's scroll.

SDK v1 §5.1 (main's 3959d40, in v0.6.2): an outgoing bubble of a gradient that holds a widget is of one colour all over
— its header, caption, reactions and tail too — and that colour is the `bg_color` the widget gets. It is the one the
gradient shows most: the mean of what it is painted in (the freeform one's points, as on Android), moved to read the
text on as the gradient's colours are (`getSolidColor` in `@helpers/outgoingMessageGradient`, set on the theme as
`--message-out-gradient-solid-color`). `.bubble.is-out.widget-message` (`_chatBubble.scss`) paints it on the content
and takes the gradient's pictures away from its pieces, so the chat's piece leaves the bubble out
(`OutgoingGradientUnion`) and what reads a colour of the gradient for a bubble (a change's shape, a send flight, a
spoiler) takes the bubble's own; `theme.ts` reads it as the bubble's `--message-background-color`. A selection is the
row's highlight under the bubble, as for any message.

v0.5.0's wallet: tweb has no Gram Wallet yet, so it passes no `context.wallet` (`TelegramWidget.wallet` stays null) and
no `onWallet`, and the framework refuses a request for the wallet. The server's side is not on production either: the
schema of layer 233 the server publishes has `query_type` (`widgetQueryTypeData` with `with_wallet`, …) in
`messages.getBotWidgetQueryAnswer`, and production answers that method INPUT_METHOD_INVALID (2026-10-31); tweb keeps the
method production takes. The sandbox's mock bot has the dev app's mock wallet (`shop`, `gram`; the panel's Wallet switch,
`bot-demos/07-wallet`). v0.6.0 changed the wallet's docs only (the server's agreed API, `userWallet` with the StateInit),
not its code; production still answers the method INPUT_METHOD_INVALID.

v0.6.0's limits run on every transport of tweb's: `glue.ts` counts the layout queries (128 a task, and 1000 ms of
them, `queryLimitHit`) and takes the whole slice for every task, a task's time past the quota a debt
(`cpu-budget.ts`, as upstream's `worker.ts`); the validators beside the glue (`engine-worker.ts`, `frame-runtime.ts`)
hear `markLoaded` when the glue posts `loaded`, as `WidgetHost`'s does. The heavy-box count is the shared renderer's
(`renderer/core.ts`), which tweb runs in the page (`worker`, `inline`) or in the frame (`frame`); `policy` reaches it as
any message to the renderer, and its `limit` goes back to `WidgetHost`, which stops the engine wherever it is. Its frame
is asked of the widget's window, as the renderer's other frames are, and `rebind()` moves it with them (item 6). The
bundle stamps of `VERSION.json` are native only: tweb builds its bundles from these sources. Where the count meets
tweb's own changes: in a shadow root a pressed button and a widget's `:active` rule are the renderer's
`[data-tw-active]` (item 9), so a press reaches what such a rule styles, and the button exemption reads the renderer's
own record of the press (a widget can write the attribute too); the marker counts again wherever it is set or cleared
(a press let go outside the widget cleared it where the root's listeners do not hear: 17 filters under
`body:active .h{filter:none}` ran uncounted, 2026-11-06); so does an element whose style attribute the renderer
writes itself, as the widget's own write does, where a selector of the widget's reads the attribute — the play state
held paused while the widget is hidden and given back when it is shown (item 6; 17 boxes under
`.h[style*="running"]{filter:blur(1px)}` went heavy uncounted on show, 2026-11-06); the scripted animations the
host resumes when it shows the widget again (item 6) are counted again; a death the frame did not report (the paint
limit, on `frame`) sends its engine `stop`. Two gaps of the count itself, to send upstream (`renderer/core.ts`): a
counted Web Animation whose keyframes an `anim` update changes kept its first classification (an opacity fade turned
backdrop-filter passed the cap of 2), and a removed stylesheet was dropped from the set `refreshSheets` watches before
it could notice, so what the sheet overrode (`filter: none` over 17 boxes) was never counted; both count again now.

1. **`frame` sync transport** for pages that cannot be cross-origin isolated (Firefox, WebKit): the engine glue, the
   validator and the renderer core run together in the renderer's sandboxed frame (`renderer/frame-runtime.ts`,
   `host/frame-renderer.ts`, the `virtual:frame-bundle` built by `frameBuildOptions`), so a layout query is answered in
   that thread. The frame's CSP gains `'wasm-unsafe-eval'`; the page sends the wasm bytes with `init`, and the glue
   compiles them there (`wasmModule`: this emscripten build ignores `wasmBinary`). The glue (`host/glue.ts`, item 4)
   runs in the frame as it does in a worker (inputs that arrive in the middle of a task wait for its end);
   `host/widget-host.ts` picks the transport (`syncTransport`,
   `defaultSyncTransport()`: `sab` when isolated, else `frame`) and can load the frame from a URL (`frameUrl`).
   User activation works as on `sab`: the frame numbers the trusted presses (`GestureCounter`) and tells the host each
   number (`tw-gesture`) before the event's task can use it; the host's gate accepts only numbers it was told, and
   checks every bridge call and storage commit itself; a preview (`isPreview`) takes no input there either, as
   `WidgetHost` drops it on every other transport (2026-11-06: its clicks ran the widget's handlers).
   `renderer/document-env.ts` is `renderer.ts`'s `documentEnv` moved out for reuse; both frames inside a page (the
   renderer's and the engine frame) get v0.1.1's
   `frameColorScheme`. Measured per query: Chromium sab 1.05 ms, frame 0.35; Firefox sab 3.2, frame 1.9 (0.47 from
   another site); WebKit sab 2.2, frame 0.43. Caveat: the frame is off the page's main thread only where the browser
   gives it a process — Chromium always, Firefox for a frame from another site, WebKit never; the CPU limits bound how
   long one task can take.
   The handshake of a frame of the renderer's (this one, and `renderer.ts`'s for the iframe renderer) is the frame's
   now: it makes the channel and hands its parent the other end with `tw-renderer-ready`, which the host hears in the
   window its frame's element is in (`IframeRenderer`, and `rebind()` follows a frame moved before it announced
   itself); what the host sends meanwhile waits. In a Document Picture-in-Picture window neither frame started: the
   host heard for the announcement on the tab's window, and the frame took a port only from a `tw-init` whose source
   was its parent, while one the page posts comes from the window of the script that posts it — the tab's (2026-11-07).
2. **A longer budget for the sandbox bundle's boot.** `warm()` evaluated the bundle under a 5 s deadline. Measured on a
   slow VM: ~0.4 s in a worker (Chromium), 0.8–1.3 s on the page's main thread (`frame` in Firefox and WebKit), past
   5 s with a dozen engines busy side by side, which killed widgets before any of their code ran. The budget is 15 s
   (`BUNDLE_BOOT_BUDGET_MS`), and the kill message names it. (`host/worker.ts`.)
3. **The worker takes messages in its first evaluation only.** In a code-split production build the chunks quickjs
   loads with `import()` while warming import shared code back from the worker's own file, and Chrome then evaluates
   the module worker's main script a second time; that copy set `onmessage` again over an empty state, so every
   pooled worker answered its `start` with "start before warm" — only the first widget of a page ran. A `Symbol.for`
   flag on the global keeps the handler of the first evaluation. (`host/worker.ts`.)

4. **`inline` sync transport: QuickJS in the page, from a snapshot.** The glue (`host/glue.ts`, formerly the body of
   `host/worker.ts`) is a factory, one per widget: `worker.ts` runs one in a worker, `renderer/frame-runtime.ts` one in
   the frame, and `WidgetHost` with `syncTransport: 'inline'` one in the page, next to `ShadowDomRenderer` (always that
   renderer: a query is a call that must be answered in it). The sandbox bundle is evaluated once per page, in a worker
   (`host/snapshot-worker.ts`, `host/inline-snapshot.ts`), and that VM's linear memory is kept: dlmalloc's free blocks
   are zeroed first (the bundle's parse leaves megabytes of garbage in them), and the non-zero 4 KiB chunks go as runs.
   Every widget gets a fresh instance of the same compiled module with that memory written into it
   (`host/inline-engine.ts` `prepareInlineVM`): the wrappers are rebuilt around the snapshot's runtime and context
   pointers, the host functions registered under the snapshot's reference ids, and `__twDispatch` held by its handle.
   Each copy is a runtime of its own in a Memory of its own, so the memory cap, the CPU limits and the isolation between
   widgets are those of a worker each. Math.random is replaced in the snapshot by a generator that seeds itself from
   the host's crypto on its first call (QuickJS seeds once per context, so every copy would draw the same numbers).
   The shim's clocks (`performance.now()` and its `timeOrigin`, `document.timeline`, `Event.timeStamp`) start at the
   widget's `boot`, in the thread that runs the copy (`sandbox/host.ts` `startClock`): they kept the snapshot's, counted
   in the clock of the thread that took it (the snapshot worker, another engine worker), and a widget in the page or in
   a second engine saw `performance.now()` off by the two threads' origins — negative in the second engine — and
   `timeOrigin + now()` off the wall clock. `Event.timeStamp` counts from the same origin (it was the engine thread's own
   clock, upstream's too) (2026-11-06).
   With a prepared copy, `new WidgetHost(…, {inlineVM})` runs the widget's first task inside the constructor, and the
   owner lays the bubble out with its content: tweb prepares the copy while the bubble is built and starts the widget
   when the bubble enters the document, so nothing moves after (the chat keeps its scroll with the final heights).
   Measured on a development VM (~2.3× slower than an M1, Chromium, 4 KiB pages): a copy 3–8 ms (WebKit 3–30), the
   engine's warm-up once per page off the main thread (the page's longest task while it warms: 14 ms Chromium, 18 ms
   Firefox, 75 ms WebKit, against 224 / 545 / 827 ms evaluating the bundle in the page), a live widget 5.1 MB in all
   (engine 4.3 MB) against 18.7 MB with a worker (`sab`) and 12.4 MB with the engine in an iframe (`frame`). The cost is
   the main thread: a widget's first task there, ~15–45 ms on this VM (median 36), and its animation frames.
   `WidgetHost.suspend()` drops the engine and keeps the last picture (no badge): tweb parks the widgets past its live
   limit that way. It drops a background request held while the widget was off screen (v0.3.0), as dying does: the
   client shows a parked host again before replacing it, which would have sent the stopped widget's request. A host
   parked (or dead) before its engine is there takes up nothing that comes later: not the VM `inline` was copying for
   it (its stopped glue took it all the same and held it for as long as the parked host lived; a stopped glue's
   `adopt`, `init`, `warm` and `start` now do nothing), not `frame`'s `init` once the binary has loaded, and on
   `worker` not the `start` its channel held while the engine booted (the engine made the widget's copy only to drop
   it at the `stop` that followed; a channel closed before the boot posts nothing) (2026-11-06).
5. **The page parses the widget's HTML** (`host/html-tree.ts`, `sandbox/dom.ts` `hostTree`): parse5 inside QuickJS
   took 35–60 ms of a widget's first task. In a window (`inline`, `frame`) the glue answers a `parse` host call with the
   tree the browser's own parser builds in an inert DOMParser document (nothing in it runs or loads), as strings in
   the shape `build()` takes from parse5; the shim builds its DOM from it in 2–4 ms. A worker has no DOMParser, and the
   shim keeps parse5 there. HTML with a `<noscript>` is left to the shim's parse5, which parses with scripting on, as
   the browser does: DOMParser parses with it off, where a head `<noscript>`'s `<script>` came out after it (and ran) and
   its other markup went on into the body, shown (2026-11-06). So is HTML past 16 KB (`MAX_HTML`, the bound of the
   worker's parse5, item 10): the browser's parser built, and the glue walked and serialized, a DOM of whatever size a
   widget's generated `innerHTML` had, in the page's thread or the frame's, outside QuickJS's memory limit and interrupt
   (2026-11-06).
   `sandbox/dom.ts` imports `sandbox/host.ts` for that call, so a Node test that imports it outside QuickJS (the
   package's `style.test.ts`) needs a `__host` global.
6. **Shadow DOM renderer details.** It no longer measures the widget after every batch of ops (a forced layout of the
   page in every frame of an animation): its size observers report before the frame paints, and the host asks for the
   size at once after a widget's first task (`RendererEnv.deferSize`, `Renderer.flushSize`). v0.1.1's canvas
   (`syncCanvas`, which reads the root's and the body's computed backgrounds) goes the same way: once a frame before
   it paints, and in `flushSize`; and it reads every value before it writes any, and writes only what changed (it read
   each property after writing the previous one onto the host, a style recalculation apiece). Together they were +93
   style recalculations and +1.2 ms of the page's time per start in Chromium (12 widgets one at a time). Its sizes and
   coordinates
   are the untransformed ones: a transform on the page around the widget (tweb's chat scales while it opens) was in
   every client rect, so a height measured mid-animation stayed the bubble's and clipped the content
   (`RendererEnv.origin().scale`: the host's client rect over its width as laid out, unrounded — over `offsetWidth`,
   which rounds, a host 200.5 px wide was a scale of .9975, each size report a pixel taller, and a `100vh` widget grew
   to the cap, 2026-11-06). A frozen state without a reason shows no badge (`suspend()`), and a frozen widget's
   animations stop. Off screen nothing throttles a shadow root the way a browser throttles an iframe: with
   `setVisible(false)` the renderer also holds the widget's CSS animations (a `@layer tw-hidden` rule declared before
   every other layer, so no important declaration of the widget's sheets outranks it, and no `pause()` that would take
   the animation from the widget's CSS for good; an element's own important `animation-play-state`, which outranks
   every layer and ran on, is held paused in its style, and what the widget's ops set there meanwhile is what comes
   back, 2026-11-06; so is one an important `all` sets, which Chromium reports with no priority of the longhand's
   (`all: initial !important` and important animation longhands ran on while hidden there), 2026-11-07; an op of the
   widget's that may change it acts on the widget's own, given back for it and held again after: taken again from the
   style, a value the browser refused (`all: bogus`, an unknown play state or shorthand) left the renderer's `paused`
   as the widget's, and the animation stopped for good when shown, 2026-11-07; it is given back with the priority the
   declaration itself says, not always important (2026-11-07); an element removed meanwhile is let go, and a paused transition its styles cancelled; one the
   widget's own call reached meanwhile, a pause through its handle, is the widget's and is not played again; one it set
   going meanwhile, a start time through its handle, ran on off screen — a width transition laid the chat out on every
   frame — and is held paused all the same, then goes on where the engine put it, 2026-11-06: `heldCss`), pauses its
   transitions and the engine's scripted animations (one the engine removes meanwhile goes from the renderer's list
   of them: a widget hidden for long that kept starting and cancelling them kept every id, 2026-11-06), and on return
   puts the scripted ones back where the engine's timeline has them (`HostToRenderer` `visibility`,
   `AnimationState.startTimes`). When the widget's element moves into another window (Document Picture-in-Picture),
   `WidgetHost.rebind()` moves the renderer's frames and size observers there: a hidden window delivers neither. The
   engine's scripted animations go to that document's timeline too, where they were (in Firefox they stood still on
   the hidden window's), and their times are put in the timeline of the document their element is in (2026-11-06). In
   Firefox the CSS transitions and animations the widget's styles start there are of that window's realm: `instanceof`
   the page's classes missed them, and a hidden widget's width transitions ran on in it; they are told by what they
   have now (`isCSSTransition`, `isCSSAnimation`, for the widget's `anims` list and the paint count too). The elements,
   made in the page's document, keep the page's realm in Chromium and Firefox (2026-11-07); so
   is the time a scripted animation the host paused while hidden goes back to when shown, which stayed in the old
   window's clock — it went on off by the windows' time origins, seconds behind (2026-11-06).
   Its host element is `direction: ltr` (`all: initial` leaves `direction` alone, and an RTL client handed the widget
   its direction): a widget's document starts left to right, as in a frame, and its own `dir` changes that.
   v0.1.2's arbiter of presses (`renderer/core.ts`): a pointer event it does not follow (a hover, another finger) and
   the widget does not listen for is not serialized (`serialize` reads the layout: `offsetX`, the origin), and the
   point it feeds the arbiter is the one the widget gets, already in the widget's untransformed coordinates (it read
   `origin()` a second time on every move of a press). Its hold timer reads the clock of the window the widget is in:
   a Document Picture-in-Picture window's events have a timeline of their own, and the renderer tells a pointer or a
   mouse event by what it carries, not by `instanceof` (such a window's events are of its realm: they lost their
   coordinates even before v0.1.2). A pointer the bubble took is the widget's again at its next press: released
   outside the widget, its pointerup never reached the root, and every later press of the mouse was dropped.
   v0.2.2's `release` for the haptic gate is posted from the same pointer branch, before that check.
   v0.1.3's widened `touch-action` lives in the CSSOM of the widget's sheets, and a `<style>` whose host moves in the
   DOM is parsed again from its text: tweb's widget starts in a copy of its bubble and moves into its place, the chat
   moves bubbles, Document Picture-in-Picture takes the client — and a `touch-action: none` in a sheet stopped the
   chat's vertical pan again (the gesture corpus's `-xy` games kept the page still). `rebind()` widens again the rules
   that lost it (`widenSheet(el, fresh)`: those without the claim property), and tweb calls it after each move. A sheet
   whose text has no `touch-action` is not walked at all (the walk makes a CSSOM wrapper per rule; a declaration that
   passed the sanitizer is spelled out, an escaped property name is not in the profile's list).
   `WidgetHostOptions.onBeforeResize` (v0.1.3's resize anchor): the host sets the bubble's new height before
   `onResize` tells the client, so a client that keeps the anchored edge in place on screen could no longer read where
   that edge was; the new callback comes just before the height is set (only when it changes), `onResize` just after,
   in the same task. The browsers' own scroll anchoring adjusts the scroll in the layout that follows the change
   (measured in Chromium, Firefox and WebKit): reading the edge before and after and correcting the difference keeps
   it in place whatever the browser did.
   `WidgetHostOptions.onRelease` (tweb): called when the renderer reports that the primary press ended (`release`, after
   the haptics hear it). A frame's document keeps its pointer events to itself, so with the renderer in a frame the
   client heard nothing of a press let go over the widget; tweb ends the message selection's hold with it on the debug
   transports that draw in a frame (2026-11-06).
7. **CPU limits on a page's thread** (`inline`; the per-task limit stays upstream's): the host's time handling what a
   task posts (validating, applying, laying out) moves the task's deadline like a layout query and counts toward the
   quota only; one slice covers a whole task however many scripts it runs (each got a fresh one, so twenty 900 ms
   scripts would hold the page for 18 s); a widget's first tasks get twice the slice and stay out of the quota (a heavy
   showcase widget's first task passed 500 ms in WebKit, then the first tap got the 50 ms floor and was killed; since
   v0.6.0 there is no floor, and that time would be a debt holding its first frames and timers).
   `{ type: 'stop' }` drops a glue's VM and timers and keeps the picture (`suspend()` on the `frame` transport) — the
   warm-up's promise too, which held the VM it made (16 MB of wasm memory in the surviving frame), and a warm-up the stop
   overtook makes none (2026-11-06).
   v0.3.0's main-thread window (`mainThreadQuotaMs`) is the page's, as upstream has it: the glue charges it with the
   page's answers to the task's layout queries and the modelled cost of its ops (`opsCostMs`); the host's handling of
   what a task posts stays in the JS quota with the widget's code (on `worker` it is the engine's thread, validating).

8. **`worker` sync transport: every widget's engine in the page's engine worker, off the page's thread.** What tweb
   runs in every browser. One dedicated worker per page (`host/engine-worker.ts`; a second one where QuickJS runs as
   the asyncify build, past four live widgets, `host/engine-client.ts`) evaluates the sandbox bundle once and takes the
   snapshot (item 4) itself; each widget is a copy of it there, with its glue and its validator beside it, so a
   widget's code and the checks of what it asks for never run on the page's thread. The page applies the validated
   ops to a Shadow DOM renderer (`WidgetHost` `syncTransport: 'worker'`) and answers the layout queries; the widget's
   code waits for each answer without knowing (`host/suspend.ts`): with JavaScript Promise Integration where the engine
   has it (Chromium, Safari), the host-call import is `WebAssembly.Suspending` and the exports that run code
   (`QTS_Call`, `QTS_Eval`, `QTS_ExecutePendingJob`) are `WebAssembly.promising`; elsewhere (Firefox) the engine runs
   `emscripten-module.asyncify.wasm`, the same build put through `wasm-opt --asyncify` with only that import able to
   unwind (`packages/quickjs-wasm` `scripts/asyncify.mjs` here), whose stack unwinds into a buffer in its own memory
   and rewinds. A host call that waits is made twice: the first time the host function hands over the promise and
   returns nothing, then the same call is made again with the answer; a query asked where nothing can wait (widget code
   that `vm.dump()` runs as the glue reads what a task threw: its `toJSON`, its getters) is refused before the page is
   asked — asked, the page answered queries no task counted, past the per-task limit (2026-11-06). `host/suspend-kind.ts`,
   which tells the two apart and which the page imports before it knows whether widgets can run there, reads
   WebAssembly off the global: with WebAssembly off it threw at import, and the client's widget block never got to
   say that widgets cannot run (2026-11-06). The glue's tasks are
   generators that yield only
   there, so on the other transports they still run to their end in the call; a widget waiting for an answer holds up
   no other (each has its own instance), and what arrives for it meanwhile waits its turn (`exclusive`). The worker has
   no DOMParser: the `parse` host call is parse5 run by the worker's own engine (`host/html-tree-parse5.ts`; the tree
   is the one the shim builds, item 5). A query's wait moves the task's deadline; the page's time answering it counts
   toward the query budget and the quota. As on `inline` (item 7), one slice covers a whole task, however many scripts
   it runs (on a shared thread a widget of many scripts would hold every other widget), and the first tasks get twice
   the slice and stay out of the quota. On the asyncify build the same work takes ~1.8× as long, so a task gets twice
   the slice and half its time counts toward the quota. The worker takes messages in its first evaluation only, as
   `host/worker.ts` does (item 3). The validator beside the glue stops the widget at a counted cap (v0.3.0's
   `stopped`): the glue is killed with that reason (`Glue.kill`), as `WidgetHost` stops it where the validator is the
   host's; the `frame` runtime (item 1) does the same. While its first task's ops come, the host takes the renderer's
   size after each batch (`flushSize`), as `inline` does after the task: set from the renderer's observers instead,
   the host's height changed under its own observer in the middle of a delivery, a loop the browser reports.
   tweb runs a widget's first task while its bubble is built, in a hidden copy of the bubble at its width, and moves
   the frame into the bubble as it enters (client side). Measured on a development VM (Chromium 149, Firefox 151, WebKit 26.5
   via Playwright; 8 showcase widgets started at once; "page" is the page's longest task while they start):
   | 8 widgets at once | Chromium | Firefox | WebKit |
   |---|---|---|---|
   | `worker`: all drawn / the page's longest task | 183 / 17 ms | 737 / 14 ms (two engines) | 275 / 24 ms |
   | `inline`: all drawn / the page's longest task | 754 / 571 ms | 779 / 779 ms | 928 / 935 ms |
   | `sab` (Chromium, isolated): all drawn / longest task | 734 / 43 ms | – | – |
   | the page's thread while 8 animated widgets run | 261 ms/s (`inline` 573, `sab` 357) | | |
   | a widget's start on the page's thread (median) | 3 ms (`inline` 55) | 2 ms (`inline` 112) | 2 ms (`inline` 132) |

   Memory (Chromium, renderer footprint, 4 KiB pages): 4.9 MB per live widget (`inline` 4.5, `sab` 18.7); the engine
   worker's own cost is the module and the ~4 MB snapshot the page held with `inline`. A stopped widget's instance goes
   at the worker's next collection (within ~30 s idle, sooner under allocation). Conformance (auto set, 40/40 loaded):
   Chromium 156 / 7 / 0, Firefox 148 / 11 / 4, WebKit 145 / 16 / 2 (`inline`: 155 / 8 / 0, the same, the same). While a widget runs out of sight its
   `elementFromPoint` is answered with its copy made hit-testable for the call (`WidgetHost` `hitTestable`).
   Cost: a query is a round trip to the page (sub-millisecond when its thread is free); the asyncify build is 1.2 MB
   and ~1.8× slower; a second engine costs ~20 MB, so only the asyncify build gets one.

9. **What the conformance set found when run in real bubbles** (its auto, visual and client SDK widgets as messages in
   tweb's chat, in Chromium, Firefox and WebKit). Shim, renderer, validator and SDK policy, every transport:
   - `getComputedStyle(el).x` asks the renderer for that property alone (`cs` with `prop`, which the validator now
     takes for any property name): the full answer lists longhands only, so shorthands (`margin`, `overflow`,
     `white-space`, `background-position`) read empty, and it cost the page ~11 ms an element in Firefox (some 400
     properties) — a test widget reading a hundred of them went over the query budget and was killed. The full
     answer stays for enumerating a computed style, and a property it has is read from it while it is cached
     (`host.ts` `cachedQuery`): `for (i < cs.length) cs.getPropertyValue(cs[i])` asked for each of some 400 alone,
     past the 128 queries a task may ask (2026-11-06).
   - Animation and transition events carry `animationName` / `propertyName`, `elapsedTime` and `pseudoElement`.
   - Canvases drawn from one another in a task (`drawImage`; `createPattern`, out of profile 1) replay in the order
     the widget drew: a reader after its source's commands so far and before the source's next ones (the renderer
     replays canvas by canvas; a canvas drawn into before its source read the source blank). The segments a canvas's
     commands are set aside in count together toward its 4000 in a send, in the shim (its RangeError) and in the
     validator, which counts a canvas's ops in a batch together: counted segment by segment, a canvas that another one
     drew after every three commands of it passed 6000 (2026-11-06).
   - Animation and transition events no listener asked for yet are kept a second: a task that asks a layout question
     sends its DOM before it ends, so a short animation could end before the listeners added later in the same task
     reached the renderer; a browser would still deliver them. Only to that task: `listen` says when the task that
     sends it began (`since`, `performance.timeOrigin` plus `performance.now()`, a clock every thread shares; each kept
     event is stamped on it), and an event kept from before goes to no listener — an `animationend` an animation had
     before a later timer task listened reached the new handler. A first version told the task by the batches of ops
     applied before its first layout query: a later task that asked one with no change to the page in between (a 50 ms
     animation, then a timer reading `offsetWidth` before it listened) got the event too. Kept are 64 at most, those
     past the second dropped first, then the oldest: full, the buffer waited for a `listen` and dropped a later task's
     events (2026-11-06).
   - An event's position relative to the widget reads the layout (on a shadow root: two boxes and a computed width):
     it is read for an event with a position only. An animation event no listener asked for is kept a moment
     (`earlyEvents`), serialized every iteration of the animation, and it read it each time (2026-11-07).
   - Pointer id 0 (Firefox's mouse) is a pointer: `setPointerCapture` refused it, and a drag lost its moves past the
     element.
   - The move a frame the renderer forwards carries the movement of the moves it replaced (upstream too since v0.3.0);
     where a browser says a move moved nothing (WebKit's synthetic ones), the renderer takes the movement from the positions.
     It kept a position for every pointer it heard, and touch browsers give each contact an id of its own: a widget's
     every tap stayed (1000 taps, 1000 positions), its click adding it again after its end. A touch contact's goes when
     the contact ends, and what follows its end keeps none; at most 16 pointers are kept, the one heard from longest
     ago going first (2026-11-06).
   - In a shadow root's stylesheets (and the UA sheet) `:active` becomes `[data-tw-active]`, which the renderer sets
     on the pressed element and its ancestors: Firefox applies no `:active` after the mousedown the renderer cancels.
   - `checkLink` puts a Unicode host in its `xn--` form (letters, marks, digits and hyphens; a Unicode label that
     would come out ASCII is refused): sdk-v1 §2.5 says the host the client gets is ASCII, an IDN in its `xn--` form,
     and SDK 01 passes `https://пример.испытание/…`; it threw a `TypeError`. A label is mapped code point by code
     point as the browser's URL parser maps it (UTS #46): NFKC, each lowercased alone, NFC; ß, ς and ı kept. Lowercased
     whole, `ΟΣ` took the final-sigma rule, `ος`, another host than the browser's `οσ` (2026-11-06). What UTS #46 maps
     otherwise is refused, never sent elsewhere: an ignorable code point (a variation selector, which it drops), a
     fold lowercasing does not make (`ᾳ` to `αι`, Cherokee to its capitals), a mark first. Checked against Node's URL
     parser over the Latin, Greek, Cyrillic, letterlike, compatibility and mathematical blocks; left out: the bidi
     rule (a host mixing right-to-left letters the browser refuses goes out in its `xn--` form). The package's own
     `tests/fixtures/sdk-policy.json` expects `null` for `https://пример.рф/`, so upstream's two sources disagree.
   - `WidgetHost` passes the point to `hitTestable(x, y)`: a widget hit-testing a point out of the viewport (its
     bubble below the fold) or under the page's own interface got `null`; tweb moves the bubble, or the staged copy,
     for the call so that the point is in sight and on top.
   Live collections and the script animations sent before a layout query, found the same way, came with v0.1.1;
   tweb runs upstream's, with one change: the calls linkedom makes to carry out a `textContent` write (a
   `replaceChildren`, a `remove`, an `appendChild`) no longer ask again whether they change the tree (`capture.ts`
   `treeDepth`; the value is turned into a string first, so no widget code runs among them). They were ~250 checks a
   frame for a widget writing 40 cells' text, its script +20% against v0.1.0 (the package's Node harness and tweb's
   bench, every engine); now at v0.1.0's level. Only there: inside a method or another setter widget code can run (a
   `toString`, an event handler), and `innerText` inserts its `<br>`s as steps of its own. The package's
   live-collection, capture and shim tests pass. A step is only what linkedom calls: `replaceChildren()` and
   `appendChild(text)` on the element, `remove()` on a child of it — and only where linkedom's calls reach the shim's
   own wrappers: where the widget overrode one of them (on the element, a child or a prototype), linkedom runs the
   widget's code among the steps, and every call of the write decides as anywhere else, at once; setters always. A
   collection the override read, before and after removing a paragraph, kept it (2026-11-06). The same holds for the
   shim's own fast path for an element's lone text node (`dom.ts`: one `replaceChild` with a node of
   `document.createTextNode`, where the widget holds the node): an override of either ran among the steps as well
   (2026-11-06). Reading those methods runs a getter of the widget's all the same (on a node or a prototype), after the
   write counted its change and before steps that count nothing: one that took a child out and read a collection left
   it counting what the steps then removed. The write counts the tree as changed again once its steps are done, where
   it had element children or anything changed the tree meanwhile; reading the methods off their descriptors instead,
   to run no getter, made a ticker's text writes ~40% slower (2026-11-07). Left on purpose: a getter that returns the
   shim's own method still takes the fast path, so a collection it reads in the middle of the write can count a child
   the steps have taken out (after the write it is right); it is the widget's own getter seeing its own write half
   done, and a check by descriptor cached per prototype and write cost ~57% (70→116 ms, 2026-11-07). Free of cost
   would be a flag the shim sets once a widget defines an accessor for one of those methods or swaps a node's
   prototype, sending every later write the slow way.
   Client side (tweb): the palette follows a chat's own colours, which a chat applies after `theme_changed` (once its
   wallpaper is drawn) — the widget got the previous theme's colours, and now gets the theme once, then; staged
   copies are hidden by clipping, not opacity (WebKit samples a transparent subtree's animations sparsely and the
   first `animationiteration` events were lost). tweb's bench (`lib/widgetSandbox/bench.ts`, the widget sandbox's
   Bench view) measures every transport against the others in the browser it runs in.

10. **What a security audit of tweb's integration found** (2026-10-28; every transport). Five of its findings went
   upstream and are the library's since v0.3.0, with their Swift and Kotlin copies and tests: `light-dark()`'s branch
   walked by the CSS checks, pointer capture only of a press begun on the widget, a finger's or a pen's press a gesture
   from its release, a timer id asked for again replacing its timer, and the bitmaps a widget makes the page hold (the
   validator stops a widget whose canvases pass 2048² pixels together and gives a data: image past 1024² the
   placeholder; the renderer keeps 4096² as its own bound). tweb's copies of the glue carry two of them: the timer fix
   is in `glue.ts`, and `renderer/frame-runtime.ts` begins a new gesture at the renderer's claim and at any
   `pointerdown` (`GestureCounter.pressBegan`) as `WidgetHost` does. What stays tweb's:
   - The engine worker's `parse` host call (item 8) parsed any length, synchronously, outside QuickJS's interrupt, in
     the thread every widget's engine shares — and parse5 is quadratic in the nesting (no depth cap like a browser's
     512): `<div></div>` × 200 000 set as `innerHTML` took 79 s. It parses at most 16 KB (nested `<ul>`s: 0.12 s at
     16 KB on a development VM); longer HTML goes back to the shim's parse5, which the CPU limits stop.
   Client side (tweb): a widget's last `localStorage` commit, which comes as its bubble goes, could bring back the
   storage of a message just deleted; a poll of the shared state wrote its answer over a carrier that got a newer
   update of its own meanwhile; a widget sent from inline results kept its temporary message id and the preview's flags.

11. **What a review of the v0.3.0 upgrade found** (2026-10-29): the strict cap on stylesheet rules counted an escaped
   brace outside a string (`.a\{x`, `@keyframes k\}x`) as one. The library's since v0.6.0, with Swift's copy, together
   with the three order-of-batch findings of the v0.4.0 upgrade (text and rules compared after the batch, `syncChildren`
   removing first, the 64 script animations counting script ones only) and `auto/33` stopping on the ops cap at 5 MB.
12. **What a review of tweb's whole integration found** (2026-10-31):
   - `glue.ts` `waitingEntries`, `drive`: on the engine's thread a task goes on in promise reactions, queued behind
     what other widgets' tasks queued — after every call into the VM (JSPI gives a promise also for one that ran
     through without suspending), as its code resumes after a layout query's answer, and once that code has ended.
     Those waits counted as the widget's time, toward its slice and its quota: six widgets starting together killed
     scripts that run in ~30 ms alone, and six answered together, each working half a slice after its answer, killed
     the ones whose code went on last (a first fix covered only the call that ran through). Now each glue takes the
     thread where its code goes on (`takeThread`: each step of a task, the answer taken, and `Suspender.onResume`
     right before resumed code — on JSPI a reaction queued next to JSPI's own on the same promise, on asyncify the
     rewind); the glue it was taken from notes the moment, its own code having ended there, and on taking the thread
     back counts the time since as the others' (`taskOthersMs`). Only that is excluded: a widget past its slice
     between its resumed code and a promise job is still stopped, alone or among others (`widgetSandboxEngine.test.ts`,
     the real glue on both builds). Only tweb's `worker` transport runs several VMs on one thread; through the engine
     worker each answer is a message task of its own, so resumed code shares a turn with another widget's only where
     answers settle together (an invalid query's immediate answer, say).
   - `engine-client.ts` `openEngineChannel`: a second engine boots only once it has the first one's snapshot, and a
     channel opened on it before that (no reservation, or one on a retired engine) posted `start` ahead of `boot` —
     "the engine was not booted". Its messages now wait for the boot, in order. A first engine ready only after the
     second had stopped waiting for it (`SHARE_TIMEOUT_MS`) was still asked for its snapshot, by a listener nothing
     took away: the snapshot and the module it got stayed with the first engine for its life. Once the wait is over
     nothing is asked (2026-11-06). Nor do they stay when they came in time: the wait was a race that `from.gone` (the
     first engine stopping) is part of, which holds it, and what it resolved to, for the first engine's life — ~4 MB
     more with every second engine started. The race resolves to nothing now, and the snapshot goes beside it
     (2026-11-06). Two engines whose widgets went at once both waited the shorter idle time (30 s,
     `IDLE_EXTRA_MS`, for an engine with another beside it) and both stopped, so the next widget compiled QuickJS and
     warmed a snapshot again; the time is now decided as it runs out, and the last engine left waits the rest of
     `IDLE_LAST_MS` (5 min) (2026-11-06).
   - `widget-host.ts`: a host made with `visible: false` told only the engine; the renderer's own animations (item 6)
     ran until the widget had been shown and hidden once (`setVisible` sends changes only). The renderer hears it at
     creation now.
   - `capture.ts`: the textContent steps (item 9) turned `undefined` into the text "undefined"; a nullish value
     clears the text, as in a browser.
13. **The client's own emoji** (2026-11-05; tdesktop 7.4 draws its emoji set in widgets, and so does tweb wherever its
   messages do — every platform but Apple's): `RendererEnv.emoji` (`renderer/core.ts`), set for every shadow renderer
   with `setClientEmoji` (`host/shadow-renderer.ts`), splits a text into its plain parts and the emoji the client draws,
   each with its image's URL. Such a text shows inside a `<tw-text>` of the client's, one inline box (a flex or grid
   container still lays it out as one item), standing where the widget's text node stood: the node with the part before
   the first emoji, then a text node per plain part and a `<tw-emoji>` per emoji — a 1em box (tdesktop's, calibrated on
   the conformance references' Apple Color Emoji: its middle .35em above the baseline) with the image as its background
   and the character inside, out of view, for a copy. Their styles are the renderer's, out of the widget's reach;
   the ops that move, remove or insert before the node act on the wrapper. Not inside `<style>`, `<title>`,
   `<textarea>`, `<option>`, `<script>`, SVG or a node out of the tree: there the node keeps the whole text. On a canvas
   `fillText`/`strokeText` draw each emoji's image, 1em square, in the advance the platform's glyph has, so
   `measureText` (the platform's) holds for the drawing; an image not loaded yet draws the glyph, and a text with
   right-to-left characters or direction is the platform's to draw. The box hangs from the alphabetic baseline, found
   from a glyph's `actualBoundingBoxAscent` under the text's baseline and under the alphabetic one: Firefox gives no
   `alphabeticBaseline` without its extended text metrics, and the emoji drew nothing; where it cannot be told, the
   platform's glyphs (2026-11-06). A deviation a native client does not have: the
   widget's selectors see the wrapper, so counted among its siblings (`:last-child`, `a + b`) it can match otherwise.
   What it may cost (2026-11-06): a text in n parts is n − 1 nodes, or draws, more than the one op or command the
   validator counts and models for it, made on the page's thread where the CPU limits do not reach (`'©'.repeat(5000)`
   passed strict validation as one text node and made 5000 elements). A widget's texts stand in at most 1024 such
   parts at once, and it makes at most 2048 a second (1024 at once) in its DOM and on its canvases together
   (`EMOJI_PARTS`); a text past either keeps the platform's glyphs, whole. The renderer tells the client how many parts
   it takes (`emoji(text, max)`), so that the split can stop there. On a canvas the parts are drawn where the whole
   text puts them in the widget's own space (they were drawn in a space moved to the text's start, and a gradient
   filled them from there), their images smoothed whatever the widget sets for its own, and only where parts
   drawn one by one make the one draw: over what is there, with no shadow and no filter (outside profile 1, which the
   validator drops, but the split does not rest on that). The client's elements take of the widget's styles what its
   text would and no more: `all: unset` (with `direction` and `unicode-bidi`) and no `::before` or `::after`, important
   in a layer of the renderer's sheet, which beats every declaration of the widget's (its CSS has no layers; it can put
   no inline style on them), one rule for them all rather than a style attribute apiece. Their inline styles, `opacity`
   among what they left out, and their pseudo-elements were the widget's to style: `p * {opacity: .5}` over 24 emoji
   made 25 heavy boxes the paint count, which counts the widget's elements, never saw (2026-11-06). They are no
   targets either (`pointer-events: none`), as text is none: a press on an emoji is its element's, with the offsets the
   browser gives there — it came with the helper's, a click 160 px into a button at `offsetX` of a few pixels; a drag
   still selects the text across them (2026-11-06). The paint count takes the wrapper's place among its siblings for
   the text's: a removal or a move invalidated the wrapper, no element of the widget's, and the siblings it had were
   not counted again (an emoji text gone before 17 `.h:nth-child(odd)` made them all heavy unseen); an insert, and a
   `data` op that wraps or unwraps the text, count its siblings again under a sibling combinator too, as for an
   element (2026-11-06).
   Upstream: a platform's own emoji is a renderer concern of every client; a hook like this one (or a decision that a
   client's emoji are out of scope) belongs in the shared renderer.
14. **The layout budget** (2026-11-10, v0.6.3's `render-*` attacks; `shared/layout-policy.ts`, `renderer/core.ts`).
   v0.6.3 says the web lays those widgets out as any page. WebKit does not lay them all out in bounded time: a grid
   container that is an item of a grid is laid out again for each pass of its parent, two a level, so `n` nested grids
   cost it 2^n passes — on a development VM (~2.3× slower than an M1) 14 took 49 ms, 18 816 ms, 20 3.2 s, and the 30
   of `render-nested-grid` never end; `inline-grid`, `1fr` and `min-content` tracks alike, a flex or a block between
   two grids breaks the chain. The widget's DOM is the page's (a shadow root, or a frame on the page's thread), so the
   page never came back: the WebKit run of the attack corpus hung there. Each node under the grids counts: a tree of
   grids 8 deep with 3 children each (3280 nodes) took 1.4 s, 10 deep with 2 (1023) 1.4 s, about 1 µs for every pass
   of every node. Chromium and Firefox lay all of these out in a few milliseconds, and the other `render-*` attacks in
   every engine (an over-long `var()` takes its fallback, a gradient of no period is drawn at once, the marker is
   decimal). Nested multi-column is exponential in Chromium and WebKit too, but outside profile 1 (the declaration is
   dropped). A native renderer bounds one layout to 100,000 boxes laid out afresh and 50 more per element (twidget);
   the renderer now counts the same before anything lays the widget out: every node once for each pass of the
   elements above it that may be grids, Σ 2^(those). Past the budget it takes away, before the page lays anything
   out, every element that may be a grid with as many such ones above it as the deepest level that still fits
   (`display: none !important`, what is under it with it), takes no more ops, and reports `limit` with the code
   `layout-limit`; the host stops the widget with `Layout limit exceeded: … boxes to lay out afresh, of nested grids`
   — in every policy, `compat` too: its grids are gone. The count runs at a batch's end, before a scroll or a
   canvas's text inside one (both lay the page out), after a script's animations, before a query and before the size,
   and again, the widget stopped or not, after the renderer changes the DOM itself (the stopped badge, the sheet without
   effects), which the widget's selectors see: `.late:not(:last-child) div` matched a whole chain once the badge came.
   What may be a grid is read from the widget's declarations and matched by selector, never from a computed value:
   in a shadow root whose host is a size container (`container-type: size`) a computed value is a layout in WebKit
   (20 nested grids: 3.4 s to read their `display`), and in Chromium as soon as a rule depends on the container, the
   very layout this has to come before. A rule may make a grid when its `display` is a grid's or comes from elsewhere
   (`var()`, `attr()`, `env()`, `inherit`, `revert-layer`; `all` alike), an inline style the same, a script's
   animation while its keyframes set one (by its id: one removed or given other keyframes no longer counts) and, when
   an `@keyframes` sets one, whatever runs an animation (an `animation` shorthand with a substitution too, whose
   longhands CSSOM gives as empty strings); a rule inside `@media`, `@container` or `@supports` counts whatever its
   condition. The rules are read from each `<style>`'s text, parsed as a sheet of its own (`CSSStyleSheet.replaceSync`):
   a `<style>` out of the document has no sheet, and a widget built before its renderer is in the page would be laid
   out once attached with nothing counting it again. What the DOM decides is counted again after every op that
   changes it, a text's included (`:empty`, and the client's emoji wrap it in an element); what changes without an op
   counts as held both ways (`layout-policy.ts` `widenSelector`): the user's states (`:hover`, `:active`, `:focus` …,
   a negation or an argument naming one), the attributes the renderer or the browser writes (`style`, `data-tw-*`,
   `open`), `:lang()` and `:dir()` (an element without its own takes the page's, which tweb changes as it runs), and
   a pseudo-element counts as its element. A widget with nothing that may
   be a grid costs a read of its sheets when they change; one with grid rules a walk over its nodes after a batch that
   changes nodes, attributes, a display or a sheet — at the node cap (2000, half of them elements matched against the
   rules) 0.7 ms in Chromium and WebKit, 1.1 ms in Firefox. The corpus's widgets have at most 2 grids on a path and 8
   levels of DOM; with 10 grids in a chain WebKit takes 5 ms. Unit tests in `widgetSandboxHardening.test.ts`, the
   `render-*` attacks and grids a script nests later in `e2e/popupSandboxWidgets.spec.ts` (every engine).
   Upstream: the web host's renderer is the shared one, and the iframe renderer (`sab`, upstream's web demo) is on
   the page's thread in WebKit too, so the same count belongs there, with the code in the protocol.

Dropped with v0.1.0 (profile 1 has no libraries and canvas 2D only): the library URLs from the host, the bridge's
`gesture` flag (v0.1.0 numbers gestures itself), and tweb's WebGL / three.js extension. The last state of those is kept
outside the tree (`tmp/twidget/archive/` in the worktree that made them).

## Open upstream questions

- v0.6.0's `auto/44-stop-nodes` builds 1900 elements in one task, and in Firefox on a development VM (~2.3× slower than an
  M1) that task's flush passes the CPU limit before the node cap is reached, on every transport: 500 ms on `inline` and
  `frame` (the plain build), 1000 ms on `worker` (asyncify, twice the slice); `auto/19-limits`' 4000 canvas commands in
  a timer task the same. Chromium and WebKit stop on the node cap. The release notes say the web was not measured on
  weak hardware; QuickJS in SpiderMonkey is that case.

- v0.1.1's canvas of the Shadow DOM renderer (`syncCanvas`) copies the root's or the body's background onto the host
  and leaves the element painting it too: a translucent one is laid twice over the element's box (a document's root
  or body stops painting what it hands to the canvas), and a gradient repeats at another position. It is copied only
  after ops and theme messages, so a root or body background that `:hover`, a CSS animation or transition, or a
  container query changes stays as it was on the host.
- The `lineHeight` text token takes at most three decimals, and a client whose message text is 1.3125 (21 px at 16)
  passes 1.313; `auto/22-ua-defaults` then wants the root's line height as `fontSize × lineHeight` to the hundredth
  (21.01), and Firefox, which lays line heights out in 1/60 px, computes 21. Four decimals, or a tolerance in the
  check, would let it pass.
- Text a widget makes selectable (v0.1.1) lies in its shadow root, where a client's copy guard that walks up from the
  selection does not see the bubble around it (Firefox reports the shadow tree's own nodes): tweb's guard for
  protected messages climbs from a shadow root to its host. A client with such a guard needs the same.

- `frame` in Firefox wants the engine frame served from a separate site (`frameUrl`), which needs a domain of its own;
  in WebKit a busy widget still costs the page's main thread. (tweb now uses `inline`.)
- `inline` runs widget code on the page's main thread; the per-task CPU limit (500 ms) is the worker's. A lower limit
  for in-page engines would be a profile decision, the same on every client. (tweb now runs `worker`.)
- The asyncify build exists only because Firefox has no JSPI yet: a slice twice as long there is tweb's measure of
  what the same work costs on it (item 8). A release of QuickJS built with asyncify by upstream, or JSPI in Firefox,
  would let it go.
- tweb's page CSP closes the paths a widget's DOM could reach (`img-src`, `media-src`, `font-src`, `style-src` without
  remote sheets, `form-action`, `object-src`, `base-uri`) but leaves `frame-src` open for mini apps, games and payment
  forms; the renderer and the validator both refuse frames. `connect-src` is not set: no widget code runs in the page.
- A renderer iframe that is moved in the DOM reloads as an empty document the host no longer talks to (the debug
  transports): tweb restarts the widget then (`widgetBlock.tsx`). The Shadow DOM renderer moves with its element.
- The conformance set's own expectations, where tweb's results differ from its pictures: `auto/01-html-elements-a`
  "br starts a new line" assumes the inline box fits the line, which plain Firefox does not do with a fallback font
  (the same numbers natively). (v0.2.3 fixed the pictures of `visual/06` and `visual/08-canvas-a`.)
- `docs/tgw-format.md`'s widget TL is not the server's: the server's layer 233 schema has other constructor ids, a
  `public_data_hash` next to `public_data` (in `messageMediaWidget`, `botInlineMessageWidget` and
  `updateMessageWidgetData`, the hash `getWidgetPublicData` takes), `string` rather than `bytes` for the states and
  `result`, `allow_queries` / `shared_widget` without `fwd_allow_queries` in `inputMediaWidget`, and `invert_media`,
  `message` and `entities` in the inline result constructors. tweb takes the server's.
- A widget restarting over its picture (tweb: back in view after it was parked) runs its first task in a copy clipped
  away over the picture, then takes its place; in WebKit, and in Chromium under load, that run's first
  `animationiteration` events can be lost (`auto/10` on a restart; its first start passes).
- With the iframe renderer a press the bubble takes reaches the client only as `onBubbleGesture`, after the fact: a
  right click can open the message menu from it (tweb does), but a hold and a swipe-to-reply, which follow the finger,
  cannot be played from it. The Shadow DOM renderer, tweb's default, lets the touches through to the chat's own
  recognizers.
- What the bubble does with a hold is the client's: on a touch screen tweb's hold selects the message (a tap opens its
  menu, as on Android), over a widget's `auto` element as over any bubble — there at the arbiter's verdict
  (`onBubbleGesture`, 500 ms), with the chat's own hold (400 ms) kept off widgets, or a finger lifted in between
  would have selected the message and still been the widget's tap. Swipe-to-reply stays the chat's own recognizer
  (its axis locks past 20 px, the arbiter's at 10): both always agree on whose a drag is — the claimed axis is the
  widget's, the other the bubble's — not always on which of the bubble's gestures it is (a reply or the scroll).
