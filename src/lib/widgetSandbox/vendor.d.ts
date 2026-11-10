// The part of the vendored widget-sandbox web host (src/vendor/widget-sandbox) that tweb uses. The
// sources are reached through the Vite-only `widget-sandbox` alias and stay out of tsc (they are written
// for strictNullChecks); keep these declarations in step with them.

declare module 'widget-sandbox/host/renderer' {
  export interface Renderer {
    readonly element: HTMLElement;
    readonly cssScope?: 'document' | 'shadow';
    destroy(): void;
  }

  export type RendererFactory = (container: HTMLElement, theme: 'light' | 'dark') => Renderer;
}

declare module 'widget-sandbox/host/iframe-renderer' {
  import type {RendererFactory} from 'widget-sandbox/host/renderer';

  export class IframeRenderer {
    static readonly factory: RendererFactory;
  }
}

declare module 'widget-sandbox/renderer/core' {
  /** tweb: a part of a text, plain or an emoji the client draws with its image (RendererEnv.emoji). */
  export type EmojiRun = string | {emoji: string, src: string};

  /** Where a renderer draws a widget: a document, or a shadow root with three elements for its html, head and body. */
  export interface RendererEnv {
    doc: Document;
    root: Document | ShadowRoot;
    roots(): {html: HTMLElement, head: HTMLElement, body: HTMLElement};
    origin(): {x: number, y: number, scale?: number} | null;
    viewport(): {innerWidth: number, innerHeight: number, dpr: number};
    docHeight(): number;
    matchMedia(query: string): boolean;
    onViewportResize(cb: () => void): () => void;
    onColorSchemeChange(cb: () => void): () => void;
    deferSize?: boolean;
    emoji?(text: string, max: number): EmojiRun[] | undefined;
  }

  /** The renderer of one widget, which applies its validated ops (`{type: 'ops', ops}`) to the DOM. */
  export function createRenderer(env: RendererEnv): {
    init(send: (msg: unknown) => void): void,
    onMessage(msg: {type: string, [key: string]: unknown}): void,
    destroy(): void
  };
}

declare module 'widget-sandbox/host/shadow-renderer' {
  import type {RendererFactory} from 'widget-sandbox/host/renderer';
  import type {EmojiRun} from 'widget-sandbox/renderer/core';

  export class ShadowDomRenderer {
    static readonly factory: RendererFactory;
  }

  /**
   * tweb: the client's own emoji for every renderer made from now on; none: the platform's font. `max`: the most parts
   * the renderer takes for the text now (its budget); a text of more may come back undefined as soon as that is known.
   */
  export function setClientEmoji(emoji: ((text: string, max: number) => EmojiRun[] | undefined) | undefined): void;
}

declare module 'widget-sandbox/host/html-tree' {
  /** The glue's `parse` host call: the widget's HTML as the browser parses it, as JSON in the shape the shim builds from. */
  export function parseHtmlTree(arg: string): string;
}

declare module 'widget-sandbox/host/html-tree-parse5' {
  /** `parseHtmlTree` for the engine worker, which has no DOMParser: parse5 in the worker's own engine. */
  export function parseHtmlTreeParse5(arg: string): string;
}

declare module 'widget-sandbox/host/user-activation' {
  /** Numbers a widget's presses: one physical press is one gesture, a privileged call needs one (0: none). */
  export class GestureCounter {
    gestureFor(ev: {type?: unknown, detail?: unknown}): number;
    /** A primary press began (the renderer's `gesture` claim): what follows is a new gesture. */
    pressBegan(): void;
  }
}

declare module 'widget-sandbox/host/url-policy' {
  /** The URL a widget may put in its DOM or CSS (`image`: a data: image of the profile's), or null. */
  export function checkUrl(raw: string, kind: 'image' | 'fragment-only'): string | null;
  /** The size a decoder gives a data: image of the profile's formats, by its bytes; null for none of them. */
  export function dataImageSize(url: string): [number, number] | null;
  export const MAX_IMAGE_PIXELS: number;
  export const BROKEN_IMAGE: string;
}

declare module 'widget-sandbox/host/validator' {
  /** Style rules and `@keyframes` blocks in a sanitized stylesheet, as the strict caps count them. */
  export function countCssRules(css: string): {rules: number, keyframes: number};

  /** A widget's ops checked against the profile and the caps (`strict`: past a cap the widget stops, `stopped` says why). */
  export class Validator {
    constructor(diag: (kind: string, detail: string) => void);
    setPolicy(policy: 'compat' | 'strict'): void;
    processOps(batch: unknown): unknown[];
    readonly stopped: string | null;
  }
}

declare module 'widget-sandbox/host/glue' {
  /** The trusted code around one widget's QuickJS runtime, in the thread that runs it. */
  export interface Glue {
    receive(msg: {type: string, [key: string]: unknown}): void;
    /** `worker`, `inline`: starts the widget in a VM restored from the snapshot. */
    adopt(restored: unknown, msg: {type: 'start', html: string, config: unknown}): void;
    destroy(): void;
  }

  export function createGlue(env: {
    post(msg: {type: string, [key: string]: unknown}): void,
    query?(queryJson: string): {json: string},
    /** `worker`: the page answers a layout query later, while the widget's code waits. */
    ask?(query: unknown): Promise<{json: string, hostMs: number}>
  }): Glue;
}

declare module 'widget-sandbox/host/inline-snapshot' {
  /** A warmed VM's memory, which every widget's VM is a copy of. */
  export interface Snapshot {
    pages: number;
  }

  export function takeSnapshot(module: WebAssembly.Module, sandboxBundle: string): Promise<Snapshot>;
  export function copyMaximum(snapshot: Snapshot, memoryLimitBytes: number): number;
  /** A fresh QuickJS instance of `module` (one that cannot wait: `inline`) in a Memory of `pages`, growing to `maximum`. */
  export function instantiate(module: WebAssembly.Module, pages: number, maximum: number): Promise<{memory: WebAssembly.Memory, QuickJS: unknown}>;
  export function restoreVM(QuickJS: unknown, memory: WebAssembly.Memory, snapshot: Snapshot, memoryLimitBytes: number, suspender?: unknown): {pending: {type: string}[]};
}

declare module 'widget-sandbox/host/suspend' {
  /** A fresh instance of `module` whose host calls can wait (JSPI, or the asyncify build). */
  export function instantiateSuspendable(module: WebAssembly.Module, kind: 'jspi' | 'asyncify', pages: number, maximum: number):
    Promise<{memory: WebAssembly.Memory, QuickJS: unknown, suspender: unknown}>;
}

declare module 'widget-sandbox/shared/protocol' {
  /** The limits every host starts a widget with. */
  export const LIMIT_DEFAULTS: {
    memoryLimitBytes: number,
    cpuLimitMs: number,
    cpuQuotaMs: number,
    cpuQuotaWindowMs: number,
    cpuKillAfterMs: number,
    mainThreadQuotaMs: number,
    maxTimers: number
  };
}

declare module 'widget-sandbox/sandbox/canvas' {
  /** The shim's recording 2D context of a canvas of the sandbox's DOM. */
  export class Context2D {
    constructor(canvas: unknown);
    [member: string]: any;
  }

  /** Hands what the canvases recorded since the last flush over as `canvas` ops, in the order they replay. */
  export function flushCanvases(push: (op: {op: 'canvas', id: number, cmds: unknown[][]}) => void): void;
}

declare module 'widget-sandbox/sandbox/capture' {
  /** What the sandbox does as the shim mirrors an element to the host (sandbox/index.ts sets them). */
  export function setHooks(hooks: {
    elementCreated(el: unknown, id: number): void,
    attributeChanged(el: unknown, name: string, value: string | null): void,
    elementSynced(el: unknown, id: number, push: (op: unknown) => void, isNew: boolean): void,
    flushExtra(push: (op: unknown) => void): void
  }): void;
  /** The node's id with the host, the node announced to it if it was not yet. */
  export function ensureCreated(node: unknown): number;
  /** Every prototype on the chains of `samples` (sandbox/index.ts hands it the shim's nodes of every kind). */
  export function collectPrototypes(samples: unknown[]): unknown[];
  /** Wraps the DOM's mutators on `protos` so that what they change is mirrored, and counted for live collections. */
  export function installDirtyTracking(protos: unknown[], tokenListProto: unknown): void;
  /** How many times the tree may have changed: a live collection re-reads its matches when this moved. */
  export function domGeneration(): number;
}

declare module 'widget-sandbox/sandbox/layout' {
  /** The shim's getComputedStyle: the renderer's answers, by layout queries. */
  export function getComputedStyle(el: unknown, pseudo?: string | null): CSSStyleDeclaration;
}

declare module 'widget-sandbox/sandbox/dom' {
  /** The sandbox's own document (linkedom), which the shim mirrors to the host. */
  export const document: Document;
}

declare module 'widget-sandbox/host/css-sanitizer' {
  /** One CSS value as the renderer may take it, or null when it must be dropped; `diag` hears why. */
  export function sanitizeCssValue(value: string, diag: (kind: string, detail: string) => void, where?: string, env?: {colorScheme: 'light' | 'dark'}): string | null;
}

declare module 'widget-sandbox/host/inline-engine' {
  /** A copy of the engine warmed once per page, for one widget (`inline` transport). */
  export interface InlineVM {
    readonly memoryLimitBytes: number;
  }

  export function warmInlineEngine(): Promise<void>;
  export function prepareInlineVM(memoryLimitBytes?: number): Promise<InlineVM>;
}

declare module 'widget-sandbox/shared/gesture-policy' {
  /** Presses that start this close (CSS px) to the widget's leading edge take no claim: the system back gesture starts there. */
  export const EDGE_STRIP_PX: number;

  /** What the widget takes of a press beyond its taps and double taps, from `touch-action` (docs/sdk-v1.md §5.5). */
  export interface GestureClaim {
    /** Horizontal drags (no swipe-to-reply or back). */
    x: boolean;
    /** Vertical drags (no list scroll). */
    y: boolean;
    /** Holds, and a right click with a mouse: no message menu; the widget gets `contextmenu`. */
    hold: boolean;
  }

  export type Gesture = 'press' | 'tap' | 'double-tap' | 'hold' | 'drag-x' | 'drag-y' | 'menu-click';
  /** What the bubble does with a press it takes. */
  export type BubbleAction = 'menu' | 'swipe' | 'scroll' | 'back';
}

declare module 'widget-sandbox/shared/layout-policy' {
  /** The boxes one layout of a widget may make afresh, and so many more for each of its nodes. */
  export const LAYOUT_BOXES: number;
  export const LAYOUT_BOXES_PER_NODE: number;
  export function layoutBudget(nodes: number): number;
  /** Whether a declared `display` (or `all`) may compute to a grid container. */
  export function mayDisplayGrid(value: string): boolean;
  export function mayAllGrid(value: string): boolean;
  /** A selector list widened to every element it may match before the DOM changes by an op. */
  export function widenSelector(selector: string): string;
}

declare module 'widget-sandbox/shared/sdk-policy' {
  import type {ChatType, WidgetContext, WidgetViewer} from 'widget-sandbox/host/widget-host';

  /** The URL a link call of the SDK opens, normalised (an IDN host in its `xn--` form), or null when it breaks the rules. */
  export function checkLink(method: 'openLink' | 'openTelegramLink', url: unknown): string | null;
  /** The server's flags and the chat's kind for each kind of message a widget may be in (the dev app's and the harness's). */
  export const WIDGET_MESSAGE_KINDS: Record<
    'private' | 'group' | 'via-bot' | 'no-queries' | 'live-copy' | 'copy' | 'preview',
    Required<Pick<WidgetContext, 'isCopy' | 'canQuery' | 'backgroundQuery' | 'chatType'>> & {preview?: boolean}
  >;
  export type WidgetMessageKind = keyof typeof WIDGET_MESSAGE_KINDS;
  export const CHAT_TYPES: readonly ChatType[];
  /** A viewer written as `id,first,last,username,premium`; no positive id → null. */
  export function viewerFromList(list: string): WidgetViewer | null;
}

declare module 'widget-sandbox/host/suspend-kind' {
  /** How a `worker` widget's code waits for a query's answer: JSPI, or the asyncify build of QuickJS. */
  export type SuspendKind = 'jspi' | 'asyncify';

  /** JSPI where the engine has it, else (or when preferred) asyncify. */
  export function suspendKind(prefer?: SuspendKind | 'auto'): SuspendKind;
}

declare module 'widget-sandbox/host/engine-client' {
  import type {SuspendKind} from 'widget-sandbox/host/suspend-kind';

  /** An engine worker kept for one widget being prepared (`worker` transport). */
  export interface EngineSlot {
    readonly engine: unknown;
  }

  export interface EngineOptions {
    suspend: SuspendKind | 'auto';
    engines: number | 'auto';
  }

  export interface EngineInfo {
    kind: string;
    bootMs: number;
    widgets: number;
  }

  /** Picks (or starts) the engine worker the next widget runs in; resolves when it can run it. */
  export function reserveEngine(): Promise<EngineSlot>;
  /** One widget's messages to and from its engine (the reserved one, if any). */
  export function openEngineChannel(onMessage: (msg: {type: string}) => void, slot?: EngineSlot): {
    send(msg: {type: string, [key: string]: unknown}): void,
    close(): void
  };
  /** How engines start from now on; the running ones take no new widget and stop when their last one is gone. */
  export function setEngineOptions(options: Partial<EngineOptions>): void;
  /** The engines that take widgets now. */
  export function listEngines(): EngineInfo[];
}

declare module 'widget-sandbox/host/worker-pool' {
  export interface WorkerPoolOptions {
    limits?: {memoryLimitBytes?: number, cpuLimitMs?: number};
    canRefill?: () => boolean;
  }

  export class WorkerPool {
    readonly stats: {created: number, hits: number, misses: number};
    constructor(size: number, opts?: WorkerPoolOptions);
    prewarm(): Promise<void>;
    refill(): void;
    readonly warm: number;
    destroy(): void;
  }
}

declare module 'widget-sandbox/host/widget-host' {
  import type {BubbleAction, Gesture, GestureClaim} from 'widget-sandbox/shared/gesture-policy';
  import type {EngineSlot} from 'widget-sandbox/host/engine-client';
  import type {InlineVM} from 'widget-sandbox/host/inline-engine';
  import type {RendererFactory} from 'widget-sandbox/host/renderer';
  import type {WorkerPool} from 'widget-sandbox/host/worker-pool';

  export interface WidgetStats {
    jsMs: number,
    tasks: number,
    memoryBytes: number,
    ops: number,
    queries: number,
    queryMs: number,
    queryCacheHits: number,
    missedMutations: number,
    throttledTasks: number,
    cpuWindowMs: number,
    nodes: number
  }

  /** The Mini Apps palette keys (docs/sdk-v1.md §2.3), each `#rrggbb`. */
  export type WidgetThemeKey = keyof import('@types').TelegramWebViewTheme | 'section_separator_color' | 'bottom_bar_bg_color';

  /** The client's own `<button>` (§2.4): colours `#rrggbb`, lengths in px / em / rem, a font with generic families only. */
  export interface WidgetButtonTokens {
    bg?: string;
    text?: string;
    radius?: string;
    font?: string;
    padding?: string;
    height?: string;
    pressedOpacity?: number;
    disabledOpacity?: number;
  }

  /** A message's text (§2.4): font size 8–64 px, unitless line height 1–3, its inset in the bubble (CSS lengths). */
  export interface WidgetTextTokens {
    fontSize?: number | string;
    lineHeight?: number | string;
    padding?: string;
  }

  export interface WidgetTheme {
    colorScheme: 'light' | 'dark';
    params?: Partial<Record<WidgetThemeKey, string>>;
    button?: WidgetButtonTokens;
    text?: WidgetTextTokens;
  }

  /** What the widget asked for, already checked: URL rules, one link per tap, the haptic rate limit (§3.2). */
  export type WidgetAction =
    | {kind: 'ready'}
    | {kind: 'openLink', url: string}
    | {kind: 'openTelegramLink', url: string}
    | {kind: 'haptic', haptic: 'impact' | 'notification' | 'selection', value?: string};

  /** The edge of the bubble that stays put when the widget's height changes (`TelegramWidget.setResizeAnchor`, §2.12). */
  export type ResizeAnchor = 'top' | 'bottom';

  /** The kind of chat the message is in, as the Bot API names it. */
  export type ChatType = 'private' | 'group' | 'supergroup' | 'channel';

  /** The widget's state as the message has it (§2.13): the chat state and the shared state, none = null. */
  export interface WidgetData {
    chatData?: string | null;
    publicData?: string | null;
  }

  /** The account that looks at the widget, as the bot gets it in `from`. */
  export interface WidgetViewer {
    id: number;
    firstName?: string;
    lastName?: string;
    username?: string;
    isPremium?: boolean;
  }

  /** The server's flags of the message, the chat's kind and the viewer (§4.4); `preview`: an inline result not sent yet. */
  export interface WidgetContext {
    isCopy?: boolean;
    canQuery?: boolean;
    backgroundQuery?: boolean;
    chatType?: ChatType;
    viewer?: WidgetViewer;
    preview?: boolean;
    /** The client has Gram Wallet for this user (§2.18): the widget gets `TelegramWidget.wallet` where it may request. */
    wallet?: boolean;
  }

  /**
   * A request of the widget to the bot (`TelegramWidget.request`, checked): `data`, 1–64 bytes; `wallet`, asked on a tap
   * with `{wallet: true}`: the server attaches the user's wallet card (`with_wallet`).
   */
  export interface WidgetRequest {
    data: string;
    wallet?: boolean;
  }

  /** One message of a TON Connect `sendTransaction` request: the destination, nanotons as a decimal string, cells in base64. */
  export interface WalletMessage {
    address: string;
    amount: string;
    payload?: string;
    stateInit?: string;
  }

  /** A transaction as TON Connect's `sendTransaction` request has it (its own field names). */
  export interface WalletTransaction {
    valid_until?: number;
    network?: string;
    from?: string;
    messages: WalletMessage[];
  }

  /** A TON Connect `signData` payload: a text, bytes or a cell with its TL-B schema; the client signs for `bot<bot_id>`. */
  export interface SignDataPayload {
    type: 'text' | 'binary' | 'cell';
    text?: string;
    bytes?: string;
    schema?: string;
    cell?: string;
    network?: string;
    from?: string;
  }

  /** A wallet call that passed its checks (§2.18); `data` goes to the bot with the call's outcome. */
  export type WalletCall =
    | {method: 'sendTransaction', transaction: WalletTransaction, data: string}
    | {method: 'signData', payload: SignDataPayload, data: string};

  /** The bot's answer: `result`, at most 1024 bytes of text; none, an empty answer. */
  export interface WidgetRequestAnswer {
    result?: string | null;
  }

  /** What a request the client could not complete rejects with. */
  export type RequestFailure = 'TIMEOUT' | 'RATE_LIMITED' | 'FAILED';
  /** What a wallet call rejects with: a request's failures, the user's decline, the wallet's refusal. */
  export type WalletFailure = RequestFailure | 'REJECTED' | 'BAD_REQUEST';

  /** A press the bubble took (`bubbleGestures`): what it does with it, where the pointer was in widget coordinates. */
  export interface BubbleGesture {
    action: BubbleAction;
    gesture: Gesture;
    x: number;
    y: number;
    /** It started in the leading edge strip, where the widget's claim does not apply. */
    edge: boolean;
  }

  /**
   * What the client draws over the widget, in CSS px (docs/sdk-v1.md §2.17): `bottom`, the band the message time takes
   * at the widget's bottom edge; `cornerRight` (`cornerLeft` right to left), the corner it takes in that band.
   */
  export interface ContentSafeArea {
    top: number;
    right: number;
    bottom: number;
    left: number;
    cornerLeft: number;
    cornerRight: number;
  }

  /** A message's Web Storage (§2.8): 4 KB per area. */
  export type WidgetStorageArea = 'local' | 'session';
  export type WidgetStorage = Partial<Record<WidgetStorageArea, Record<string, string>>>;

  export interface WidgetHostOptions {
    theme: 'light' | 'dark' | WidgetTheme;
    locale?: string;
    /** What the client draws over the widget (the time over its corner), given before the first render; 0 when absent. */
    contentSafeArea?: Partial<ContentSafeArea>;
    storage?: WidgetStorage;
    memoryLimitBytes?: number;
    cpuLimitMs?: number;
    cpuQuotaMs?: number;
    cpuQuotaWindowMs?: number;
    cpuKillAfterMs?: number;
    /** The host's main-thread work for the widget per window (layout queries + 25 µs per op + 2 µs per canvas command); default 100 ms. */
    mainThreadQuotaMs?: number;
    maxTimers?: number;
    visible?: boolean;
    features?: string[];
    onLog?: (level: string, text: string) => void;
    onDiag?: (kind: string, detail: string) => void;
    onStats?: (stats: WidgetStats) => void;
    onAction?: (action: WidgetAction) => void;
    onStorageCommit?: (area: WidgetStorageArea, values: Record<string, string>) => void;
    /** On every primary pointerdown: what of this press the widget claims with `touch-action`. */
    onGestureClaim?: (claim: GestureClaim) => void;
    /**
     * The renderer plays the bubble: a press the widget does not claim is the bubble's, and the widget gets
     * `pointercancel` when the bubble takes it. `rtl`: the leading edge strip is on the right.
     */
    bubbleGestures?: boolean | {touch?: boolean, rtl?: boolean};
    /** With `bubbleGestures`: the bubble took a press; (x, y) in widget coordinates. */
    onBubbleGesture?: (gesture: BubbleGesture) => void;
    /** The primary press ended in the renderer, let go or taken away (a frame's document keeps it to itself). */
    onRelease?: () => void;
    onDead?: (reason: string) => void;
    onError?: (text: string) => void;
    stoppedLabel?: string;
    onLoaded?: () => void;
    /** The bubble's height on every size report, and the edge that stays put when it changes. */
    onResize?: (height: number, anchor: ResizeAnchor) => void;
    /** tweb: the height is about to change (called just before the host sets it, `onResize` just after). */
    onBeforeResize?: (height: number, anchor: ResizeAnchor) => void;
    /** The widget's state now; later changes go through `setData`. */
    data?: WidgetData;
    /** Fixed for the host's life. Without `canQuery` every request is refused. */
    context?: WidgetContext;
    /** Sends a request to the bot; rejects with a `RequestFailure`. Without it every request is refused. */
    onRequest?: (request: WidgetRequest) => Promise<WidgetRequestAnswer> | WidgetRequestAnswer;
    /**
     * A wallet call (§2.18), only with `context.wallet`: the client's wallet window, then the outcome to the bot; resolves
     * with the bot's answer, rejects with a `WalletFailure`. Without it every call is refused.
     */
    onWallet?: (call: WalletCall) => Promise<WidgetRequestAnswer> | WidgetRequestAnswer;
    /** Copy the text and show a toast that says what was copied (one per press, checked). */
    onCopyText?: (text: string) => void;
    /** The widget started or stopped watching its shared state (`watchPublicData`): poll it only while it watches. */
    onWatchPublicData?: (on: boolean) => void;
    rendererFactory?: RendererFactory;
    workerPool?: WorkerPool;
    syncTransport?: WidgetSyncTransport;
    frameUrl?: string;
    inlineVM?: InlineVM;
    engineSlot?: EngineSlot;
    hitTestable?: (x: number, y: number) => (() => void) | void;
  }

  /**
   * `sab`: the engine in a worker, blocking on a SharedArrayBuffer; `frame`: the engine in the renderer's frame;
   * `inline`: the engine in the page, on a shadow root; `worker`: the engine in the page's engine worker, on a shadow
   * root.
   */
  export type WidgetSyncTransport = 'sab' | 'frame' | 'inline' | 'worker';

  /** `sab` on a cross-origin isolated page, `frame` everywhere else. */
  export function defaultSyncTransport(): WidgetSyncTransport;

  export class WidgetHost {
    readonly element: HTMLElement;
    readonly syncTransport: WidgetSyncTransport;
    constructor(container: HTMLElement, html: string, opts: WidgetHostOptions);
    setTheme(theme: WidgetHostOptions['theme']): void;
    setVisible(visible: boolean): void;
    /** What the client draws over the widget changed with the bubble's layout (never per frame). */
    setContentSafeArea(area: Partial<ContentSafeArea>): void;
    /** Turns the renderer's bubble on or off (`WidgetHostOptions.bubbleGestures`). */
    setBubbleGestures(mode: WidgetHostOptions['bubbleGestures']): void;
    /** The widget's latest `setResizeAnchor`, `top` until then. */
    readonly resizeAnchor: ResizeAnchor;
    /** Whether the widget watches its shared state. */
    readonly watchesPublicData: boolean;
    /** The state changed (the bot's edit, a poll): the full new state; the widget gets the events, nothing restarts. */
    setData(data: WidgetData): void;
    /** Drops the engine and keeps the last picture, without a badge and without input. */
    suspend(): void;
    /** Its element moved into another window (Document Picture-in-Picture): frames and observers follow. */
    rebind(): void;
    destroy(): void;
  }
}
