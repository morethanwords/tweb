import {createEffect, createSignal, on, onCleanup, onMount, Show, untrack} from 'solid-js';
import type Chat from '@components/chat/chat';
import animationIntersector, {AnimationItemWrapper} from '@components/animationIntersector';
import {IconTsx} from '@components/iconTsx';
import {getPageButtonClasses} from '@components/instantViewFormatting';
import {PreloaderTsx} from '@components/putPreloader';
import A11yButton from '@components/a11yButton';
import {reachPoint, stageInBlock, stageInChat, WidgetStage} from '@components/widgetSandbox/staging';
import Modes from '@config/modes';
import classNames from '@helpers/string/classNames';
import noop from '@helpers/noop';
import I18n, {i18n} from '@lib/langPack';
import rootScope from '@lib/rootScope';
import {handleWidgetAction} from '@lib/widgetSandbox/actions';
import {getWidgetClaim, setWidgetClaim, WIDGET_ATTRIBUTE} from '@lib/widgetSandbox/gestures';
import {getRememberedWidgetHeight, getWidgetFixedHeight, rememberWidgetHeight, WIDGET_MIN_WIDTH} from '@lib/widgetSandbox/sizing';
import {
  checkLiveWidgets,
  getWidgetLocale,
  isWidgetSandboxSupported,
  LiveWidget,
  loadWidgetRuntime,
  registerLiveWidget,
  resolveWidgetTransport,
  widgetEngineCount,
  widgetRendererKind,
  WidgetEngine,
  WidgetRuntime,
  widgetSuspend,
  widgetTransport
} from '@lib/widgetSandbox/runtime';
import type {
  BubbleGesture,
  ResizeAnchor,
  WidgetContext,
  WidgetData,
  WidgetHostOptions,
  WidgetStorage,
  WidgetSyncTransport
} from 'widget-sandbox/host/widget-host';
import type {AppManagers} from '@lib/managers';
import {trackWidgetCarrier} from '@lib/widgetSandbox/publicData';
import type {WidgetStorageBinding} from '@lib/widgetSandbox/storage';
import {getWidgetTheme, watchChatTheme} from '@lib/widgetSandbox/theme';
import {measureContentSafeArea, NO_CONTENT_SAFE_AREA} from '@lib/widgetSandbox/safeArea';
import themeController from '@helpers/themeController';
import type {ContentSafeArea, WidgetHost} from 'widget-sandbox/host/widget-host';
import styles from '@components/widgetSandbox/widgetBlock.module.scss';

/** The part of a scrollable a height change corrects (Scrollable's). */
export type WidgetScroller = {container: HTMLElement, scrollPosition: number, setScrollPositionSilently: (value: number) => void};

/**
 * `waiting`: in the chat, not started, keeping its place (its bubble went in out of sight): it starts as it comes near
 * the screen; `starting`: in the chat with nothing drawn yet (an engine that boots on its own, a start that took longer
 * than the chat waited); `parked`: the engine is gone and its last picture stays (too many widgets alive); `crashed`:
 * it died MAX_CRASHES times in a row before this bubble was built, so there is no picture of it, only the placeholder.
 */
type WidgetState = 'idle' | 'waiting' | 'starting' | 'running' | 'parked' | 'stopped' | 'crashed' | 'failed';

/** What a start needs from the network and the disk, and the engine it runs on. */
type Preparation = {runtime: WidgetRuntime, storage: WidgetStorage, transport: WidgetSyncTransport, engine?: WidgetEngine};

/** A widget that died this many times in a row stays stopped until the app restarts or its HTML changes (D22). */
const MAX_CRASHES = 2;
/** How long a widget in a chat waits after `theme_changed` for the chat to apply its colours (watchChatTheme). */
const CHAT_THEME_WAIT_MS = 1000;

/** Deaths in a row per widget, kept across re-renders of its bubble. */
const crashes = new Map<string, {html: string, count: number}>();

// Taps and double taps belong to a running widget alone (docs/sdk-v1.md §5.5): in the shadow renderer they would
// otherwise bubble on to the bubble's own handlers (its menu on a tap, its reaction on a double click); a stopped or a
// parked picture's are the bubble's. The context menu, touches and the wheel go on: the bubble's, unless the widget claims
// them (onGestureClaim). The iframe keeps its events to itself anyway.
const OWN_EVENTS = ['pointerdown', 'mousedown', 'click', 'dblclick'] as const;

/**
 * Where the widget's frame sits in its block, and what says when the block enters the document: the moment a
 * widget started off screen moves in (its first task done, its height known), or an `inline` one runs. Entering
 * another window's document later (the client moving into Document Picture-in-Picture) moves the renderers' frames
 * and observers there.
 */
class WidgetSlotElement extends HTMLElement {
  public onConnect: () => void;

  public connectedCallback() {
    this.onConnect?.();
  }
}

const SLOT_TAG = 'tweb-widget-slot';
if(!customElements.get(SLOT_TAG)) customElements.define(SLOT_TAG, WidgetSlotElement);

/**
 * A promise the chat's bubble batch waits on that runs `start` only then: by the time the chat waits for a bubble's
 * media the bubble is complete, and the classes that set its width (the share button beside a channel post, the
 * side it is on) come after the widget is made.
 */
function startWhenAwaited(start: () => Promise<void>): Promise<void> {
  let started: Promise<void>;
  const run = () => started ??= start();
  return {
    then: (onFulfilled, onRejected) => run().then(onFulfilled, onRejected),
    catch: (onRejected) => run().catch(onRejected),
    finally: (onFinally) => run().finally(onFinally),
    [Symbol.toStringTag]: 'Promise'
  } as Promise<void>;
}

/**
 * How near the screen a widget that waits (`lazy`) starts: within a screen above or below what its scroller shows (a
 * vertical rootMargin percentage is of the root's height in Chromium, Firefox and WebKit alike).
 */
const NEAR_MARGIN = '100% 0px';
/** One observer per scroller, for every widget waiting in it. */
const nearObservers = new WeakMap<Element, {observer: IntersectionObserver, callbacks: Map<Element, () => void>}>();

/**
 * Calls `callback` once, when `element` comes within NEAR_MARGIN of what `root` shows (the viewport, without one);
 * returns what stops the wait.
 */
function whenNear(element: HTMLElement, root: HTMLElement | undefined, callback: () => void) {
  const key = root ?? element.ownerDocument.documentElement;
  let entry = nearObservers.get(key);
  if(!entry) {
    const callbacks = new Map<Element, () => void>();
    // made in the element's own window (the client may be in Document Picture-in-Picture)
    const view = element.ownerDocument.defaultView ?? window;
    const observer = new view.IntersectionObserver((entries) => {
      for(const {target, isIntersecting} of entries) {
        const fn = isIntersecting && callbacks.get(target);
        if(!fn) continue;
        callbacks.delete(target);
        observer.unobserve(target);
        fn();
      }
    }, {root, rootMargin: NEAR_MARGIN});
    nearObservers.set(key, entry = {observer, callbacks});
  }

  const {observer, callbacks} = entry;
  callbacks.set(element, callback);
  observer.observe(element);
  return () => {
    if(callbacks.delete(element)) observer.unobserve(element);
  };
}

/**
 * An HTML widget (`messageMediaWidget`): the widget's script in QuickJS, its DOM validated before it reaches the
 * renderer. The engine runs off the page's thread (the `worker` transport) and the widget runs its first task while
 * its bubble is built, in a hidden copy of the bubble at its width (staging.ts): the chat waits for that
 * (`loadPromises`), and the widget's frame moves into the bubble as the bubble enters, so the chat lays the bubble out,
 * and keeps its scroll, with the widget's content already in it, and nothing moves after. A widget that starts again
 * (shown after it was parked, new HTML) starts hidden over its picture and takes its place once it has drawn. It pauses
 * with the chat's other animations (out of view, another chat, a hidden tab), takes the colours of the bubble it sits
 * in, and keeps only its picture when too many widgets are alive. A bubble that goes in out of sight (`lazy`) waits for
 * nothing: its widget keeps the place it is known to take and starts as it comes near the screen.
 */
export default function WidgetBlock(props: {
  /** The widget's source; another one restarts the widget on the same storage. */
  html: string,
  /** The bot's width in pixels, kept within [WIDGET_MIN_WIDTH, the container's width]; without one it fills its container. */
  width?: number,
  /** The bot's height in pixels, kept within [WIDGET_MIN_HEIGHT, WIDGET_MAX_HEIGHT]; without one it takes its content's, clipped at WIDGET_MAX_HEIGHT. */
  height?: number,
  class?: string,
  chat?: Chat,
  /** Identifies the widget across re-renders of its message (the remembered height, the crash count). */
  widgetKey: string,
  /** The message's Web Storage; without it the widget starts empty every time. */
  storage?: WidgetStorageBinding,
  /** The bubble's: resolves when the widget has drawn, or can draw without waiting. */
  loadPromises?: Promise<any>[],
  /**
   * The bubble goes in out of sight (beyond an opening chat's screen, history loaded by scrolling): the widget holds
   * none of it back and starts as it comes near the screen, keeping meanwhile the place it is known to take (the bot's
   * height, else the one it had when it last ran).
   */
  lazy?: boolean,
  /**
   * Watches for its bubble to go out of sight while the bubble waits for it (as the heights of the widgets around it
   * come to be known); then it waits no more, and the widget waits to come near the screen. Returns what stops it.
   */
  whenOutOfSight?: (onOutOfSight: () => void) => () => void,
  /** The layout its content wraps to (its chat's width and text size): a height it reports is remembered with it. */
  layout?: () => string,
  /** The widget changed its height. */
  onLayout?: (element: HTMLElement) => void,
  /** The bubble took a press from the widget (a hold, a swipe, the scroll, back, a right click). */
  onBubbleGesture?: (gesture: BubbleGesture) => void,
  /** The widget's state as its message has it now; a change reaches the running widget. */
  data?: WidgetData,
  /** The message's flags, the chat's kind and the viewer; `preview`: an inline result, which takes no input. */
  context?: WidgetContext,
  /** The widget's requests to the bot (without it the framework refuses them). */
  onRequest?: WidgetHostOptions['onRequest'],
  /** The widget's wallet calls, with `context.wallet` (without it the framework refuses them). */
  onWallet?: WidgetHostOptions['onWallet'],
  /** `TelegramWidget.copyText`. */
  onCopyText?: (text: string) => void,
  /** A shared widget: polled for its shared state while it watches it and is in view (publicData.ts). */
  publicData?: {widgetId: string, peerId: PeerId, mid: number, managers: AppManagers},
  /** What scrolls the widget, if not its chat's bubbles: a height change keeps the widget's anchored edge in place there. */
  scrollable?: WidgetScroller,
  /**
   * What the client draws over the widget's bottom corner — its message's time, when no caption is below the widget —
   * and the widget keeps clear of (the content safe area); none: nothing is drawn over it.
   */
  timeOver?: () => HTMLElement | undefined
}) {
  let element: HTMLDivElement;
  /** The widget on screen, and its frame in the slot. */
  let host: WidgetHost;
  let frame: HTMLDivElement;
  /** A widget starting off screen (`worker`), until it takes the place of what is on screen. */
  let next: {host: WidgetHost, frame: HTMLDivElement, stage: WidgetStage, loaded: boolean};
  /** The widget starting off screen is dropped. */
  const dropNext = () => {
    next?.host.destroy();
    next?.stage.dispose();
    next = undefined;
  };
  let unregisterLive: () => void;
  /** What ends the message selection's hold a press of the widget started (selection.holdOn): a frame's release. */
  let releaseHold: () => void;
  /**
   * The hold ends with the press, or with the widget on screen that took it: one that goes (gone, parked, dead, another
   * in its place) says nothing of the press any more, and a finger's touchend goes to what is gone.
   */
  const endHold = () => {
    releaseHold?.();
    releaseHold = undefined;
  };
  let disposed = false;
  /** The block has been in the document. */
  let entered = false;
  const whenEntered: (() => void)[] = [];
  /** Bumped by every (re)start: a preparation that comes back for an older one is dropped. */
  let generation = 0;
  const [state, setState] = createSignal<WidgetState>('idle');
  // a widget plays from the start (playback below): the intersector says only when it leaves the view, and comes back
  const [inView, setInView] = createSignal(true);
  /** The widget on screen watches its shared state (`watchPublicData`). */
  const [watching, setWatching] = createSignal(false);
  const preview = untrack(() => props.context?.preview);
  /**
   * The renderer arbitrates the widget's presses: a widget that runs. A placeholder, a stopped or a parked picture is
   * plain bubble (and a preview, whose presses are its result's).
   */
  const ownsInput = () => !preview && state() === 'running';
  // read once: the resize callbacks run outside any root, and the key does not change for a block
  const widgetKey = untrack(() => props.widgetKey);
  const [height, setHeight] = createSignal(getRememberedWidgetHeight(widgetKey));
  const supported = isWidgetSandboxSupported();
  const fixedHeight = () => getWidgetFixedHeight(props.height);
  /**
   * What each host was given last of a kind (as JSON), so that the same again is not sent; `send` sends a change and
   * `remember` notes what a host was made with.
   */
  const sendChanged = <T, >(send: (target: WidgetHost, value: T) => void) => {
    const sent = new WeakMap<WidgetHost, string>();
    return {
      send: (target: WidgetHost, value: T) => {
        const json = JSON.stringify(value);
        if(sent.get(target) === json) return;
        sent.set(target, json);
        send(target, value);
      },
      remember: (target: WidgetHost, value: T) => sent.set(target, JSON.stringify(value))
    };
  };
  // the colours of the bubble the widget sits in, read where its frame is (a copy of the bubble while it is staged)
  const theme = (from: HTMLElement = element) => getWidgetTheme(from, themeController.isNight() ? 'dark' : 'light');
  const themes = sendChanged<ReturnType<typeof getWidgetTheme>>((target, value) => target.setTheme(value));
  const applyTheme = (target: WidgetHost, from?: HTMLElement) => themes.send(target, theme(from));
  const showsPlaceholder = () => !supported || state() === 'waiting' || state() === 'starting' || state() === 'crashed' || state() === 'failed';

  /** The band and the corner the time takes over the block, as laid out in the document (none before it is there). */
  const measureSafeArea = () => measureContentSafeArea(element, untrack(() => props.timeOver?.()), I18n.getIsRTL());
  const safeAreas = sendChanged<ContentSafeArea>((target, area) => target.setContentSafeArea(area));
  const applySafeArea = safeAreas.send;
  /**
   * Only with the bubble's layout: the time widened ("edited", views), the language turned the corner's side. A widget
   * still in the copy of its bubble measures the copy's time; nothing is measured while the block is out of the
   * document (what was given stands).
   */
  const updateSafeArea = () => {
    if(host && element.isConnected) applySafeArea(host, measureSafeArea());
    if(!next) return;
    const {stage} = next;
    if(stage.overlay) applySafeArea(next.host, measureContentSafeArea(stage.container, stage.overlay, I18n.getIsRTL()));
    else if(element.isConnected) applySafeArea(next.host, measureSafeArea());
  };

  const slot = document.createElement(SLOT_TAG) as WidgetSlotElement;
  slot.className = classNames(styles.Slot, preview && styles.IsPreview);
  // a preview takes no input: a tap on it is its result's, and its controls are no stops of the keyboard's (with or
  // without the a11y layer: a preview never takes input; its result's title and description name it)
  if(preview) slot.inert = true;
  else OWN_EVENTS.forEach((type) => slot.addEventListener(type, (e) => {
    if(untrack(ownsInput)) e.stopPropagation();
  }));
  // never the browser's menu over a widget: a right click or a hold on `touch-action: none` is the widget's (the
  // renderer gives it its own contextmenu), any other the bubble's
  slot.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    if(getWidgetClaim(element)?.hold) e.stopPropagation();
  });
  slot.onConnect = () => {
    if(entered) {
      host?.rebind();
      next?.host.rebind();
      return;
    }

    entered = true;
    // inserted inside the chat's own insertion: a failure here must not break it
    for(const fn of whenEntered.splice(0)) {
      try {
        fn();
      } catch(err) {
        console.error('[widget] failed to start', err);
        setState('failed');
      }
    }

    // in with nothing drawn, its start still preparing (the chat waited no longer: the engine or the storage slow to
    // come): the placeholder keeps the place, at the height the widget is known to take
    if(!host && untrack(state) === 'idle' && generation) setState('starting');
  };
  const onEntered = (fn: () => void) => entered ? fn() : whenEntered.push(fn);

  /** Marks the bubble complete (the chat is waiting for its media); without a chat to wait, it is complete now. */
  let markComplete: () => void;
  const bubbleComplete = new Promise<void>((resolve) => markComplete = resolve);

  const crashCount = () => {
    const entry = crashes.get(widgetKey);
    return entry?.html === props.html ? entry.count : 0;
  };
  /** A run that ends without dying — parked, or its bubble gone — breaks the row of deaths (D22: "in a row"). */
  const endRun = () => {
    if(untrack(state) === 'running' && untrack(crashCount)) crashes.delete(widgetKey);
  };

  const live: LiveWidget = {
    visible: undefined,
    lastVisibleAt: 0,
    park: () => {
      unregisterLive = undefined;
      // a widget that died holds no engine and stays stopped (MAX_CRASHES); it is not registered by then anyway
      if(state() === 'stopped') return;
      endRun();
      endHold();
      host?.suspend();
      props.storage?.flush();
      setState('parked');
    }
  };

  // played and paused with the chat's animations (animationIntersector); out of view, the chat or the tab behind
  // another, a heavy animation running pause it. It starts playing, as the widget does (its first task has run by the
  // time the bubble enters the chat): the intersector pauses only what plays, and a widget that entered out of view
  // must stop.
  const playback: AnimationItemWrapper = {
    paused: false,
    autoplay: true,
    loop: true,
    pause: () => {
      playback.paused = true;
      live.visible = false;
      setInView(false);
      host?.setVisible(false);
      props.storage?.flush();
      checkLiveWidgets();
    },
    play: () => {
      playback.paused = false;
      live.visible = true;
      live.lastVisibleAt = Date.now();
      setInView(true);
      host?.setVisible(true);
    },
    remove: noop
  };

  /**
   * A height change keeps what is on screen in place: on screen the edge the widget chose (`setResizeAnchor`,
   * docs/integration.md "Bubble sizing"), above the screen the bottom one, next to what is on screen — read before the
   * new height lays the block out, the scroll corrected after by as much as the edge has moved (the chat's scroller does
   * not anchor its content by itself; one that does has moved it back already). The top edge on screen, and anything
   * below the screen, moves nothing on screen.
   */
  const measureBlock = () => {
    const scrollable: WidgetScroller = props.scrollable ?? props.chat?.bubbles?.scrollable;
    if(!scrollable || !element.isConnected) return;
    // what of it is seen: a chat's bubbles run on under its topbar and input field
    const view = (props.scrollable ? scrollable.container : props.chat.bubblesViewport ?? scrollable.container).getBoundingClientRect();
    return {scrollable, view, rect: element.getBoundingClientRect()};
  };
  const getAnchoredEdge = (measured: ReturnType<typeof measureBlock>, anchor: ResizeAnchor) => {
    if(!measured) return;
    const {scrollable, view, rect} = measured;
    if(rect.bottom > view.top && (anchor !== 'bottom' || rect.top >= view.bottom)) return;
    return {scrollable, bottom: rect.bottom};
  };
  const readAnchoredEdge = (anchor: ResizeAnchor) => getAnchoredEdge(measureBlock(), anchor);
  const keepAnchoredEdge = (edge: ReturnType<typeof readAnchoredEdge>) => {
    if(!edge) return;
    const moved = element.getBoundingClientRect().bottom - edge.bottom;
    if(Math.abs(moved) >= .5) edge.scrollable.setScrollPositionSilently(edge.scrollable.scrollPosition + moved);
  };
  let anchoredEdge: ReturnType<typeof readAnchoredEdge>;

  const prepare = async(): Promise<Preparation> => {
    const runtime = await loadWidgetRuntime();
    const transport = resolveWidgetTransport(untrack(widgetTransport));
    const [storage, engine] = await Promise.all([props.storage?.load(), runtime.prepare(transport)]);
    return {runtime, storage, transport, engine};
  };

  const createFrame = () => {
    const div = document.createElement('div');
    div.className = styles.Frame;
    return div;
  };

  /** Creates a host into `container`, which takes the colours of `themeFrom`; `safeArea`: what is drawn over it. */
  const createHost = (
    {runtime, storage, transport, engine}: Preparation,
    container: HTMLElement,
    themeFrom: HTMLElement,
    safeArea: ContentSafeArea,
    events: {onLoaded: () => void, onDead: () => void}
  ) => {
    const html = untrack(() => props.html);
    // an `inline` widget can die inside createHost, before it returns
    const ref: {host?: WidgetHost} = {};
    const initialTheme = untrack(() => theme(themeFrom));
    const created = ref.host = runtime.createHost(container, html, {
      theme: initialTheme,
      // before the first render, so the first height already has the band
      contentSafeArea: safeArea,
      locale: getWidgetLocale(),
      storage,
      renderer: untrack(widgetRendererKind),
      // the one it was prepared for, with its engine (the switch may have moved since)
      transport,
      engine,
      visible: live.visible !== false,
      stoppedLabel: I18n.format('Widget.Stopped', true),
      data: untrack(() => props.data),
      context: props.context,
      onRequest: props.onRequest,
      onWallet: props.onWallet,
      onCopyText: props.onCopyText,
      onWatchPublicData: (on) => {
        if(ref.host === host) setWatching(on);
      },
      // the height of the block is the widget's on screen, or (none there yet) the placeholder's, which takes the height
      // the widget starting under it reports
      onBeforeResize: (_, anchor) => {
        if((ref.host === host || (!host && entered)) && !untrack(fixedHeight)) anchoredEdge = readAnchoredEdge(anchor);
      },
      onResize: (value) => {
        if(!untrack(fixedHeight)) {
          // the layout is read before the height is written
          rememberWidgetHeight(widgetKey, value, props.layout?.());
          setHeight(value);
        }

        keepAnchoredEdge(anchoredEdge);
        anchoredEdge = undefined;
        props.onLayout?.(element);
      },
      onLoaded: () => events.onLoaded(),
      onDead: (reason) => {
        if(Modes.debug) console.warn('[widget] stopped:', reason);
        crashes.set(widgetKey, {html, count: untrack(crashCount) + 1});
        if(ref.host && ref.host === host) {
          endHold();
          // the engine is gone: nothing to park, and no restart in view past MAX_CRASHES
          unregisterLive?.();
          unregisterLive = undefined;
          setState('stopped');
        }

        events.onDead();
      },
      onAction: handleWidgetAction,
      onStorageCommit: (area, values) => {
        props.storage?.commit(area, values);
        // nobody sees it now: the write does not wait for the next commit (the tab may go first)
        if(!untrack(inView) || document.hidden) props.storage?.flush();
      },
      onGestureClaim: (claim) => setWidgetClaim(element, claim),
      // the renderer ends a press the bubble takes for the widget (gestures.ts): a finger's hold selects the message
      // here, at the policy's moment (the chat's own hold timer keeps off widgets); a swipe-to-reply and a right click
      // are the chat's own recognizers', which see the shadow root's events — but a frame keeps its events, and its
      // right click opens the message's menu from here
      bubbleGestures: !preview && {rtl: I18n.getIsRTL()},
      onBubbleGesture: (taken) => {
        props.onBubbleGesture?.(taken);
        const {gesture, x, y} = taken;
        const bubble = element.closest<HTMLElement>('.bubble');
        if(gesture === 'hold') {
          releaseHold = bubble && props.chat?.selection.holdOn(bubble);
          return;
        }

        const frame = created.element;
        if(gesture !== 'menu-click' || !(frame instanceof HTMLIFrameElement)) return;
        const rect = frame.getBoundingClientRect();
        frame.dispatchEvent(new MouseEvent('contextmenu', {bubbles: true, cancelable: true, clientX: rect.left + x, clientY: rect.top + y}));
      },
      // the press a hold above took ended: let go in a frame, whose document keeps its events. A shadow root's reach the
      // page, which ends the hold itself — a finger's with its touchend, which comes after this and has to be cancelled
      onRelease: () => {
        if(created.element instanceof HTMLIFrameElement) endHold();
      },
      // a widget hit-testing its own elements: while it runs off screen (its first task), out of the viewport or under
      // the chat's topbar or input field
      hitTestable: (x, y) => {
        const staged = next?.host === ref.host ? next : undefined;
        const unreveal = staged?.stage.reveal();
        // an `inline` widget's first task runs inside createHost, before it returns the host: its element is in the container
        const rendered = ref.host?.element ?? container.firstElementChild as HTMLElement;
        const unreach = reachPoint(rendered, x, y, staged?.stage.mover ?? element.closest<HTMLElement>('.bubble') ?? element);
        return () => {
          unreach();
          unreveal?.();
        };
      },
      onLog: Modes.debug ? (level, text) => console.log(`[widget] ${level}:`, text) : undefined,
      onDiag: Modes.debug ? (kind, detail) => console.log(`[widget] ${kind}:`, detail) : undefined
    });
    themes.remember(created, initialTheme);
    safeAreas.remember(created, safeArea);

    // a frame is named by its title, a shadow root by its host (the name stays on with or without ?a11y=1)
    const label = I18n.format('Widget.Title', true);
    const rendered = created.element;
    if(rendered instanceof HTMLIFrameElement) {
      rendered.title = label;
      // A frame moved in the DOM reloads, and comes back as an empty document the sandbox no longer talks
      // to: the chat re-inserts a bubble it repositions, the bubble is adopted into Document PiP. The
      // widget starts over in a new frame then. (A shadow root moves with its element.)
      let loads = 0;
      rendered.addEventListener('load', () => {
        if(++loads > 1 && host?.element === rendered) restart();
      });
    } else {
      rendered.setAttribute('aria-label', label);
    }

    return created;
  };

  /**
   * Puts `newHost` on screen in `newFrame`, in the place of what was there, in one task; `before`: the block as it was
   * before `newFrame` went into it beside what was there (a widget starting in its place).
   */
  const show = (newHost: WidgetHost, newFrame: HTMLDivElement, alive: boolean, before?: ReturnType<typeof measureBlock>) => {
    const replaced = host;
    if(frame !== newFrame) {
      // a widget that starts again takes the place of its picture at its own height, by its own anchor
      const edge = replaced && !untrack(fixedHeight) ? getAnchoredEdge(before ?? measureBlock(), newHost.resizeAnchor) : undefined;
      const moved = newFrame.parentElement !== slot;
      slot.append(newFrame);
      frame?.remove();
      frame = newFrame;
      // its style sheets were parsed again as it moved in from where it started
      if(moved) newHost.rebind();
      keepAnchoredEdge(edge);
    }

    host = newHost;
    setWatching(newHost.watchesPublicData);
    if(replaced && replaced !== newHost) {
      endHold();
      replaced.destroy();
    }
    // as the chat last said (a widget that started off screen heard nothing since it was made)
    if(live.visible !== undefined) newHost.setVisible(live.visible);
    unregisterLive?.();
    unregisterLive = alive ? registerLiveWidget(live) : undefined;
  };

  /** `inline` and the debug transports: the widget starts in its place (`inline`: drawing in the call). */
  const startInPlace = (prepared: Preparation) => {
    // the edge it keeps is read without the new frame beside the one it replaces
    const before = host && !untrack(fixedHeight) ? measureBlock() : undefined;
    const newFrame = createFrame();
    slot.append(newFrame);
    let synchronous = true, loaded = false, died = false;
    const created = createHost(prepared, newFrame, element, measureSafeArea(), {
      onLoaded: () => {
        loaded = true;
        if(!synchronous && created === host && untrack(state) === 'starting') setState('running');
      },
      onDead: () => died = true
    });
    synchronous = false;
    // before it is counted among the live ones, which may park it at once (a death inside createHost included)
    setState(died ? 'stopped' : loaded ? 'running' : 'starting');
    show(created, newFrame, !died, before);
  };

  /**
   * `worker`: the widget starts off screen — before its bubble is in the chat in a copy of the bubble, else hidden
   * over its picture — and takes the place of what is on screen once it has drawn its first task. Resolves then.
   * `superseded`: the start is let go (another one, the block gone, its bubble out of sight).
   */
  const startOffScreen = async(prepared: Preparation, current: number, superseded: Promise<void>): Promise<void> => {
    if(!entered) await bubbleComplete;
    if(disposed || current !== generation) return;
    const overlay = untrack(() => props.timeOver?.());
    const stage = (!entered && props.chat ? await stageInChat(props.chat, element, overlay, superseded) : undefined) ??
      (entered ? stageInBlock(element) : undefined);
    if(disposed || current !== generation) return stage?.dispose();
    if(!stage) {
      // nothing to copy and not in the document yet: it starts in its place when it is
      return new Promise<void>((resolve) => onEntered(() => {
        if(!disposed && current === generation) startOffScreen(prepared, current, superseded).then(resolve, resolve);
        else resolve();
      }));
    }

    const newFrame = createFrame();
    stage.container.append(newFrame);
    // the time as the copy of the bubble lays it out, or (in the chat already) as the bubble does
    const safeArea = stage.overlay ? measureContentSafeArea(stage.container, stage.overlay, I18n.getIsRTL()) :
      entered ? measureSafeArea() : NO_CONTENT_SAFE_AREA;
    return new Promise<void>((resolve) => {
      // drawn (or dead); a death after it, before it is placed, places it as stopped
      let alive = true, placing = false;
      const take = () => {
        resolve();
        if(placing || disposed || current !== generation || next?.frame !== newFrame) return;
        placing = true;
        // before the bubble is in the chat it moves in as the bubble enters, with its first task drawn
        onEntered(() => {
          if(disposed || current !== generation || next?.frame !== newFrame) return;
          next = undefined;
          // before it is counted among the live ones, which may park it at once
          setState(alive ? 'running' : 'stopped');
          show(created, newFrame, alive);
          stage.dispose();
        });
      };
      const created = createHost(prepared, newFrame, stage.container, safeArea, {
        onLoaded: () => {
          if(next?.frame === newFrame) next.loaded = true;
          take();
        },
        onDead: () => {
          alive = false;
          take();
        }
      });
      dropNext();
      next = {host: created, frame: newFrame, stage, loaded: false};
      // in the chat with nothing on screen: the placeholder keeps the place until it has drawn
      onEntered(() => {
        if(next?.frame === newFrame && !next.loaded && !host && untrack(state) === 'idle') setState('starting');
      });
    });
  };

  const unmount = () => {
    endRun();
    endHold();
    unregisterLive?.();
    unregisterLive = undefined;
    host?.destroy();
    host = undefined;
    dropNext();
    props.storage?.flush();
  };

  /** Prepares a start and runs it; resolves when the widget has drawn (`worker`) or can draw without waiting. */
  /**
   * The latest start (a restart takes the place of the one before), and what lets go of the one before: a start whose
   * host was dropped may never settle.
   */
  let starting: Promise<void>, supersede: () => void;
  const start = (): Promise<void> => {
    const current = ++generation;
    supersede?.();
    const superseded = new Promise<void>((resolve) => supersede = resolve);
    return starting = Promise.race([superseded, prepare().then((prepared) => {
      if(disposed || current !== generation) return;
      if(prepared.transport === 'worker') return startOffScreen(prepared, current, superseded);
      onEntered(() => {
        if(!disposed && current === generation) startInPlace(prepared);
      });
    }, (err) => {
      if(disposed || current !== generation) return;
      console.error('[widget] failed to load the sandbox', err);
      setState('failed');
    })]);
  };

  /** A new widget from the HTML, over the current one (which stays on screen until the new one has drawn). */
  const restart = () => {
    props.storage?.flush();
    start();
  };

  /** A waiting widget (`lazy`) starts: it has come near the screen. */
  let stopWaiting: () => void;
  const startWaiting = () => {
    stopWaiting?.();
    stopWaiting = undefined;
    if(disposed || untrack(state) !== 'waiting') return;
    setState('starting');
    start();
  };

  /** Keeps its place until it comes near the screen, then starts. */
  const wait = () => {
    setState('waiting');
    onEntered(() => {
      if(disposed || untrack(state) !== 'waiting') return;
      stopWaiting = whenNear(element, (props.scrollable ?? props.chat?.bubbles?.scrollable)?.container, startWaiting);
    });
  };
  let stopWatchingSight: () => void;

  if(supported && crashCount() >= MAX_CRASHES) {
    // the bubble was built again (the chat reopened, a caption edited): the same HTML stays stopped
    setState('crashed');
    markComplete();
  } else if(supported) {
    if(untrack(() => props.lazy)) {
      // nothing of the bubble waits for it: it goes in with the place the widget is known to take
      markComplete();
      wait();
    } else if(props.loadPromises) {
      // the bubble waits for this before it enters the chat: the widget has drawn by then — unless the bubble turns out
      // to go in out of sight meanwhile, when the start is dropped and the widget waits to come near the screen
      start();
      let release: () => void;
      const released = new Promise<void>((resolve) => release = resolve);
      stopWatchingSight = untrack(() => props.whenOutOfSight)?.(() => {
        stopWatchingSight = undefined;
        if(disposed || entered || next?.loaded) return;
        ++generation;
        supersede?.();
        dropNext();
        wait();
        release();
      });
      // the latest start: new HTML while the first one ran restarted it (the bubble still waits for it)
      const untilStarted = (): Promise<void> => {
        const current = starting;
        return current.then(() => current === starting ? undefined : untilStarted());
      };
      props.loadPromises.push(startWhenAwaited(() => {
        markComplete();
        return Promise.race([untilStarted(), released]).then(noop, noop);
      }));
    } else {
      markComplete();
      start();
    }
  } else {
    markComplete();
  }

  // the chat's own recognizers stand back only while the renderer arbitrates the widget's presses (ownsInput)
  createEffect(() => element.toggleAttribute(WIDGET_ATTRIBUTE, ownsInput()));

  // the bot's edit of the state, a new shared state from a poll: the running widget gets the events
  createEffect(on(() => props.data, (data) => {
    host?.setData(data);
    next?.host.setData(data);
  }, {defer: true}));

  // the bubble's edge strip (gestures.ts) is on the leading side, which a language switch flips live
  createEffect(on(I18n.isRTL, (rtl) => {
    // the time moves to the other corner once the document has its new direction, which comes after the signal
    queueMicrotask(updateSafeArea);
    if(preview) return;
    host?.setBubbleGestures({rtl});
    next?.host.setBubbleGestures({rtl});
  }, {defer: true}));

  // the time over the corner changes its size only with the bubble's layout ("edited", a channel's views): the band
  // and the corner follow it then, never per frame (an observer reports a change of size, not a move)
  let timeObserver: ResizeObserver;
  onEntered(() => {
    const time = untrack(() => props.timeOver?.());
    if(!time || disposed) return;
    timeObserver = new (element.ownerDocument.defaultView ?? window).ResizeObserver(updateSafeArea);
    timeObserver.observe(time);
  });

  // a shared widget is polled while it watches its shared state and is in view
  const publicData = untrack(() => props.publicData);
  if(publicData && supported) {
    const carrier = trackWidgetCarrier(publicData.widgetId, publicData);
    createEffect(() => carrier.setActive(watching() && inView() && state() === 'running'));
    onCleanup(() => carrier.dispose());
  }

  // messages being selected: a press selects the message, never the widget's (tdesktop gives it no input then) — the
  // bubble turns presses off its attachment, which an element of the widget with a `pointer-events` of its own takes back
  const selection = props.chat?.selection;
  if(selection) {
    const onSelecting = (selecting: boolean) => element.inert = selecting;
    onMount(() => onSelecting(selection.isSelecting));
    selection.addEventListener('toggle', onSelecting);
    onCleanup(() => selection.removeEventListener('toggle', onSelecting));
  }

  onMount(() => {
    if(!supported) return;
    const group = props.chat?.animationGroup || '';
    animationIntersector.addAnimation({
      animation: playback,
      group,
      observeElement: element,
      controlled: true,
      type: 'widget'
    });
    // the window idle already, or its chat kept behind another (a thread open over it): it starts paused, as what played
    // was paused as that came about — what starts paused itself (a sticker, a GIF) waits for a play that does not come
    if(animationIntersector.isGroupHeld(group)) playback.pause();
  });

  // a picture comes back to life when it is shown; a widget that died too, unless it keeps dying; one that waits starts
  // (whatever its scroller's observer said)
  createEffect(on(inView, (visible) => {
    if(!visible) return;
    if(state() === 'waiting') startWaiting();
    else if(state() === 'parked' || (state() === 'stopped' && crashCount() < MAX_CRASHES)) restart();
  }, {defer: true}));

  // new HTML (the bot edited the message): a new widget on the same storage; the same HTML keeps it running, and one
  // that waits starts with it
  createEffect(on(() => props.html, () => {
    // one starting where it waits (`idle` with a start going on) starts again too, on the new HTML
    if(state() !== 'waiting' && (state() !== 'idle' || generation)) restart();
  }, {defer: true}));

  // the debug switches (renderer, transport, the engines'): a running widget restarts on the new one
  createEffect(on([widgetRendererKind, widgetTransport, widgetSuspend, widgetEngineCount], () => {
    if(host) restart();
  }, {defer: true}));

  // the bubble's colours change with the theme (day / night, the accent, a chat's own theme)
  const applyThemes = () => {
    clearTimeout(themeFallback);
    if(host) applyTheme(host);
    if(next) applyTheme(next.host, next.stage.container);
  };
  // In a chat its colours come a moment after `theme_changed`, once it has painted its wallpaper (watchChatTheme):
  // the widget gets the theme then, in one change — not the new scheme with the old colours first. It gets it
  // anyway after CHAT_THEME_WAIT_MS, for a chat whose colours stay.
  let unwatchChatTheme: () => void, themeFallback: number;
  const onThemeChanged = () => {
    if(!unwatchChatTheme) return applyThemes();
    clearTimeout(themeFallback);
    themeFallback = window.setTimeout(applyThemes, CHAT_THEME_WAIT_MS);
  };
  rootScope.addEventListener('theme_changed', onThemeChanged);
  // * a chat's, from the start: a chat put on another peer applies that peer's colours as its bubbles go in
  // * (Chat.revealPreparedBackground), after a widget started for one of them has read the colours of the peer before
  const chatContainer = props.chat?.container;
  if(chatContainer) unwatchChatTheme = watchChatTheme(chatContainer, applyThemes);
  else onEntered(() => unwatchChatTheme = watchChatTheme(element, applyThemes));
  // the text tokens follow the chat's text size (appImManager has set it on the page by now)
  const onSettingsUpdated = ({key}: {key: string}) => {
    if(key === 'settings.messagesTextSize') applyThemes();
  };
  rootScope.addEventListener('settings_updated', onSettingsUpdated);

  onCleanup(() => {
    disposed = true;
    // the start the bubble may still wait for lets go: a host dropped before it has drawn never says so
    supersede?.();
    stopWaiting?.();
    stopWatchingSight?.();
    slot.onConnect = undefined;
    whenEntered.length = 0;
    rootScope.removeEventListener('theme_changed', onThemeChanged);
    rootScope.removeEventListener('settings_updated', onSettingsUpdated);
    unwatchChatTheme?.();
    timeObserver?.disconnect();
    clearTimeout(themeFallback);
    animationIntersector.removeAnimationByPlayer(playback);
    unmount();
  });

  return (
    <div
      ref={element}
      class={classNames(
        styles.Widget,
        fixedHeight() && styles.IsFixedHeight,
        !fixedHeight() && showsPlaceholder() && styles.IsWaiting,
        state() === 'starting' && styles.IsStarting,
        props.class
      )}
      aria-busy={state() === 'starting' ? 'true' : undefined}
      style={{
        'width': props.width ? `min(100%, ${Math.max(props.width, WIDGET_MIN_WIDTH)}px)` : undefined,
        'height': fixedHeight() ? fixedHeight() + 'px' : undefined,
        '--widget-height': height() ? height() + 'px' : undefined
      }}
    >
      {slot}
      <Show when={showsPlaceholder()}>
        <div class={styles.Placeholder}>
          <Show when={state() === 'starting'}>
            <PreloaderTsx class={styles.Preloader} />
          </Show>
          <Show when={!supported || state() === 'crashed' || state() === 'failed'}>
            <IconTsx icon="apps" class={styles.PlaceholderIcon} />
            <div class={styles.PlaceholderTitle}>{i18n('Widget.Title')}</div>
            <div class={styles.PlaceholderText}>
              {i18n(!supported ? 'Widget.Unsupported' : state() === 'crashed' ? 'Widget.Stopped' : 'Widget.Failed')}
            </div>
            <Show when={supported && state() === 'failed'}>
              {/* a native button with the a11y layer only: without it, one that takes the focus would hand Enter on to
                the chat's input (passEventToInput), which sends the draft */}
              <A11yButton
                ripple
                class={classNames(...getPageButtonClasses('primary'), 'rp-overflow', styles.Button)}
                onClick={restart}
              >
                {i18n('Widget.Restart')}
              </A11yButton>
            </Show>
          </Show>
        </div>
      </Show>
    </div>
  );
}
