/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

/**
 * Chat background — gradient + optional pattern/image, with cross-fade transitions.
 *
 * Two consumers:
 *  1. `<ChatBackground>` Solid component — used inline (passcode lock, fake bubbles previews).
 *  2. `appChatBackground` singleton — page-wide background mounted on body, driven imperatively
 *     by `index.ts` (initial load) and `appImManager` / `Chat` (per-peer updates).
 *
 * The component double-buffers two DOM layers ("slots"): one is currently visible to the user,
 * the other is built offstage. When a new background is ready we swap their roles via opacity
 * cross-fade. Race protection is handled via `tempId`: each effect run claims a fresh id; if a
 * newer run starts mid-flight the older one bails after disposing its half-built renderers.
 */

import {Component, createEffect, createSignal, on, onCleanup, onMount} from 'solid-js';
import {render} from 'solid-js/web';

import {Theme, WallPaper} from '@layer';
import themeControllerSingleton, {ThemeController} from '@helpers/themeController';
import {getColorsFromWallPaper} from '@helpers/color';
import ChatBackgroundGradientRenderer from '@components/chat/gradientRenderer';
import ChatBackgroundPatternRenderer from '@components/chat/patternRenderer';
import ChatBackgroundStore from '@lib/chatBackgroundStore';
import appDownloadManager from '@lib/appDownloadManager';
import renderImageFromUrl from '@helpers/dom/renderImageFromUrl';
import {averageColorFromCanvas, averageColorFromImage} from '@helpers/averageColor';
import highlightingColor from '@helpers/highlightingColor';
import rootScope from '@lib/rootScope';
import windowSize from '@helpers/windowSize';
import {logger, LogTypes} from '@lib/logger';
import {MOUNT_CLASS_TO} from '@config/debug';
import {DEFAULT_BACKGROUND_SLUG} from '@config/app';
import {AppManagers} from '@lib/managers';
import {AppTheme} from '@config/state';
import {appState} from '@stores/appState';
import classNames from '@helpers/string/classNames';

import styles from '@components/chat/bubbles/chatBackground.module.scss';

export type ChatBackgroundTheme = AppTheme | Theme;

/**
 * - `auto` — instant if file is already in cache, else 200ms fade.
 * - `instant` — no transition.
 * - `fade` — 200ms opacity fade-in over previous bg.
 * - `crossfade-forwards` / `crossfade-backwards` — synced with the chat slide animation
 *   (`var(--transition-standard-in)` 0.3s / `var(--transition-standard-out)` 0.25s).
 */
export type ChatBackgroundTransition = 'auto' | 'instant' | 'fade' | 'crossfade-forwards' | 'crossfade-backwards';

export type ChatBackgroundProps = {
  theme?: ChatBackgroundTheme;
  wallPaper?: WallPaper;
  /** When set without explicit theme/wallPaper, the wallpaper is resolved from this user's profile. */
  peerId?: PeerId;
  transition?: ChatBackgroundTransition;
  class?: string;
  /** Override the global theme controller — used by the passcode lock screen for HMR safety. */
  themeController?: ThemeController;
  /** Override the global managers — same reason as `themeController`. */
  managers?: AppManagers;
  /**
   * Pattern-canvas size (CSS pixels). Defaults to the window size — correct for full-screen chat
   * backgrounds, but wasteful for thumbnails. Picker / theme-tile previews should pass the actual
   * rendered size of `.background-item` so we don't build a 1400×900 canvas to be CSS-scaled into
   * a ~72×96 tile.
   */
  width?: number;
  height?: number;
  gradientRendererRef?: (value: ChatBackgroundGradientRenderer | undefined) => void;
  onHighlightColor?: (hsla: string) => void;
  onCachedStatus?: (cached: boolean) => void;
  onReady?: () => void;
};

type ResolvedBackground = {
  theme: ChatBackgroundTheme;
  wallPaper: WallPaper;
};

/** One of the two double-buffered DOM layers. Holds the renderers/canvases currently mounted into `el`. */
type Slot = {
  el: HTMLElement;
  appliedTheme?: ChatBackgroundTheme;
  appliedWallPaper?: WallPaper;
  gradientRenderer?: ChatBackgroundGradientRenderer;
  patternRenderer?: ChatBackgroundPatternRenderer;
  gradientCanvas?: HTMLCanvasElement;
  patternCanvas?: HTMLCanvasElement;
  image?: HTMLImageElement;
};

/**
 * Pre-built background not yet attached to a slot. The Solid effect builds these offstage so a
 * stale run (superseded by a newer one) can throw it away without touching live DOM.
 */
type BuiltContent = {
  resolved: ResolvedBackground;
  isPattern: boolean;
  isDarkPattern: boolean;
  isTinted: boolean;
  patternRenderer?: ChatBackgroundPatternRenderer;
  patternCanvas?: HTMLCanvasElement;
  gradientRenderer?: ChatBackgroundGradientRenderer;
  gradientCanvas?: HTMLCanvasElement;
  image?: HTMLImageElement;
  readyPromise: Promise<void>;
};

const FADE_TRANSITION_CLASSES = [
  styles.SlotFade,
  styles.SlotCrossfadeForwards,
  styles.SlotCrossfadeBackwards
];

const log = logger('CHAT-BG', LogTypes.Log | LogTypes.Warn | LogTypes.Error);

async function resolveFromPeer(
  peerId: PeerId,
  managers: AppManagers
): Promise<{theme?: ChatBackgroundTheme, wallPaper?: WallPaper}> {
  if(!peerId.isUser()) return {};
  const full = await managers.appProfileManager.getCachedFullUser(peerId.toUserId());
  if(full?.wallpaper) return {wallPaper: full.wallpaper};
  if(full?.theme) {
    const themeEmoticon = 'emoticon' in full.theme ? full.theme.emoticon : undefined;
    const acctTheme = appState.accountThemes.themes?.find((t) => t.emoticon === themeEmoticon);
    if(acctTheme) {
      const wallPaper = acctTheme.settings?.find((s) => s.wallpaper)?.wallpaper as WallPaper.wallPaper | undefined;
      return {theme: acctTheme, wallPaper};
    }
  }
  return {};
}

function resolveBackgroundSync(
  options: {theme?: ChatBackgroundTheme, wallPaper?: WallPaper},
  themeController: ThemeController
): ResolvedBackground {
  const globalTheme = themeController.getTheme();
  const theme = options.theme ?? globalTheme;
  const wallPaper = options.wallPaper ?? themeController.getThemeSettings(theme).wallpaper;
  return {theme, wallPaper};
}

function getWallPaperUrl(
  wallPaper: WallPaper,
  managers: AppManagers | undefined
): {urlOrPromise: string | Promise<string> | undefined, isColorOnly: boolean} {
  const colors = getColorsFromWallPaper(wallPaper);
  const slug = (wallPaper as WallPaper.wallPaper)?.slug;
  const isColorOnly = !!colors && !slug && !wallPaper.settings?.intensity;

  if(isColorOnly || !slug) {
    return {urlOrPromise: undefined, isColorOnly};
  }

  // Built-in default pattern is bundled — used on auth screens before managers exist.
  if(slug === DEFAULT_BACKGROUND_SLUG) {
    return {urlOrPromise: 'assets/img/pattern.svg', isColorOnly};
  }

  const settings = wallPaper.settings;
  const urlOrPromise = ChatBackgroundStore.getBackground({
    slug,
    canDownload: !!managers,
    managers,
    appDownloadManager,
    blur: settings && settings.pFlags.blur
  });

  return {urlOrPromise, isColorOnly};
}

function buildContent(
  layer: HTMLElement,
  resolved: ResolvedBackground,
  url: string | undefined,
  width: number,
  height: number
): BuiltContent {
  const {wallPaper} = resolved;
  const colors = getColorsFromWallPaper(wallPaper);
  const isPattern = !!(wallPaper as WallPaper.wallPaper)?.pFlags?.pattern;
  const themeName = (resolved.theme as AppTheme)?.name;
  // Two compositing strategies for dark patterns:
  // - Default (mask): pattern canvas painted black with pattern-shape holes, covering most of the gradient.
  //   Only the pattern shape gets the gradient color. Used by `night` (its bright peach/pink/purple gradient
  //   would be too vivid at full opacity — the mask "darkens" the result by black-ing the gaps).
  // - Overlay (Android-faithful): gradient at full opacity, pattern image as a soft-light overlay (with
  //   color invert because the bundled pattern.svg is black-on-transparent and we need light doodles over
  //   the dark gradient). Matches MotionBackgroundDrawable's positive-intensity flow. Used by `tinted` so
  //   its dark navy gradient is actually visible (matches Android Dark Blue's appearance).
  const useOverlayRender = themeName === 'tinted';
  // Tinted forces its rendering parameters from the default tinted wallpaper so picker selections preserve
  // the "Dark Blue" rendering style (overlay + intensity 38) regardless of the picked theme's intensity sign.
  // Picker still controls gradient colors and accent — only the rendering knobs (intensity, isDarkPattern)
  // are held to default tinted's values.
  let intensity = wallPaper.settings?.intensity && wallPaper.settings.intensity / 100;
  if(useOverlayRender) intensity = -0.38;
  const isDarkPattern = useOverlayRender || (!!intensity && intensity < 0);

  let patternCanvas: HTMLCanvasElement | undefined;
  let gradientCanvas: HTMLCanvasElement | undefined;
  let image: HTMLImageElement | undefined;
  let patternRenderer: ChatBackgroundPatternRenderer | undefined;
  let gradientRenderer: ChatBackgroundGradientRenderer | undefined;

  if(url && isPattern) {
    patternRenderer = ChatBackgroundPatternRenderer.getInstance({
      element: layer,
      url,
      width,
      height,
      mask: isDarkPattern && !useOverlayRender
    });
    patternCanvas = patternRenderer.createCanvas();
    patternCanvas.classList.add(styles.CanvasCommon);
    if(!isDarkPattern || useOverlayRender) patternCanvas.classList.add(styles.Blend);
    if(useOverlayRender) patternCanvas.classList.add(styles.DarkPatternInvert);
  } else if(url) {
    image = document.createElement('img');
    image.classList.add(styles.CanvasCommon);
  }

  if(colors) {
    const created = ChatBackgroundGradientRenderer.create(colors);
    gradientRenderer = created.gradientRenderer;
    gradientCanvas = created.canvas;
    gradientCanvas.classList.add(styles.CanvasCommon, styles.GradientCanvas);
  }

  if(intensity) {
    // Mask path applies opacity to the gradient (so the small visible gradient area in pattern shape
    // is dimmed). Overlay path applies opacity to the pattern overlay (gradient stays full).
    const setOpacityTo = image ?? (isDarkPattern && !useOverlayRender ? gradientCanvas : patternCanvas);
    let opacityMax = Math.abs(intensity) * (isDarkPattern && !useOverlayRender ? .5 : 1);
    if(image) opacityMax = Math.max(0.3, 1 - intensity);
    else if(isDarkPattern && !useOverlayRender) opacityMax = Math.max(0.3, opacityMax);
    setOpacityTo?.style.setProperty('--opacity-max', '' + opacityMax);
  }

  const readyPromise = new Promise<void>((resolve) => {
    if(patternRenderer && patternCanvas) {
      patternRenderer.renderToCanvas(patternCanvas).then(() => resolve());
    } else if(image && url) {
      renderImageFromUrl(image, url, () => resolve(), false);
    } else {
      resolve();
    }
  });

  return {
    resolved,
    isPattern,
    isDarkPattern,
    isTinted: useOverlayRender,
    patternRenderer,
    patternCanvas,
    gradientRenderer,
    gradientCanvas,
    image,
    readyPromise
  };
}

/** Releases renderers attached to a built-but-not-mounted content (used when an effect run is superseded). */
function disposeBuilt(built: BuiltContent) {
  if(built.patternRenderer && built.patternCanvas) built.patternRenderer.cleanup(built.patternCanvas);
  if(built.gradientRenderer) built.gradientRenderer.cleanup();
}

/** Moves a built content into a slot's DOM, taking ownership of its renderers. */
function attachBuiltToSlot(slot: Slot, built: BuiltContent) {
  slot.el.classList.toggle(styles.IsPattern, built.isPattern);
  slot.el.classList.toggle(styles.IsImage, !!built.image);
  slot.el.classList.toggle(styles.IsTinted, built.isTinted);

  if(built.gradientCanvas) slot.el.append(built.gradientCanvas);
  if(built.patternCanvas) slot.el.append(built.patternCanvas);
  if(built.image) slot.el.append(built.image);

  slot.appliedTheme = built.resolved.theme;
  slot.appliedWallPaper = built.resolved.wallPaper;
  slot.gradientRenderer = built.gradientRenderer;
  slot.patternRenderer = built.patternRenderer;
  slot.gradientCanvas = built.gradientCanvas;
  slot.patternCanvas = built.patternCanvas;
  slot.image = built.image;
}

function clearSlot(slot: Slot) {
  if(slot.patternRenderer && slot.patternCanvas) {
    slot.patternRenderer.cleanup(slot.patternCanvas);
  }
  if(slot.gradientRenderer) {
    slot.gradientRenderer.cleanup();
  }
  while(slot.el.firstChild) slot.el.removeChild(slot.el.firstChild);
  slot.appliedTheme = undefined;
  slot.appliedWallPaper = undefined;
  slot.gradientRenderer = undefined;
  slot.patternRenderer = undefined;
  slot.gradientCanvas = undefined;
  slot.patternCanvas = undefined;
  slot.image = undefined;
}

function transitionClassFor(transition: ChatBackgroundTransition): string | undefined {
  switch(transition) {
    case 'fade': return styles.SlotFade;
    case 'crossfade-forwards': return styles.SlotCrossfadeForwards;
    case 'crossfade-backwards': return styles.SlotCrossfadeBackwards;
    default: return undefined;
  }
}

function resolveTransition(
  requested: ChatBackgroundTransition | undefined,
  cached: boolean,
  hadPrevious: boolean
): ChatBackgroundTransition {
  // First-ever bg, or caller didn't override: cache hit → instant, miss → fade.
  if(!hadPrevious || !requested || requested === 'auto') {
    return cached ? 'instant' : 'fade';
  }
  return requested;
}

function computeHighlightingHsla(built: BuiltContent): string | undefined {
  if(!built.gradientCanvas && !built.image) return;
  const pixel = built.image ? averageColorFromImage(built.image) : averageColorFromCanvas(built.gradientCanvas!);
  return highlightingColor(Array.from(pixel) as any);
}

function createSlotEl(): HTMLDivElement {
  const el = document.createElement('div');
  el.classList.add(styles.Slot);
  return el;
}

export const ChatBackground: Component<ChatBackgroundProps> = (props) => {
  let layer!: HTMLDivElement;

  // Two double-buffered slots: `visibleSlot` is what the user currently sees, `stagingSlot` is
  // where the next bg is built. After the transition completes their roles swap.
  let visibleSlot!: Slot;
  let stagingSlot!: Slot;

  // Monotonic counter — each effect run claims one. If a later run starts before this one
  // finishes (e.g. props change during async URL load), the older run aborts at its next checkpoint.
  let tempId = 0;

  const themeController = (): ThemeController => props.themeController ?? themeControllerSingleton;
  const managers = (): AppManagers | undefined => props.managers ?? rootScope.managers;

  /** Promotes `stagingSlot` to visible and demotes `visibleSlot`, then swaps the references. */
  const presentStagingSlot = (transition: ChatBackgroundTransition) => {
    const incoming = stagingSlot;
    const outgoing = visibleSlot;

    incoming.el.classList.remove(...FADE_TRANSITION_CLASSES);
    outgoing.el.classList.remove(...FADE_TRANSITION_CLASSES);

    const transitionClass = transitionClassFor(transition);
    if(transitionClass) {
      incoming.el.classList.add(transitionClass);
      outgoing.el.classList.add(transitionClass);
    }

    if(transition === 'instant') {
      incoming.el.classList.add(styles.SlotActive);
      outgoing.el.classList.remove(styles.SlotActive);
      [visibleSlot, stagingSlot] = [incoming, outgoing];
      clearSlot(stagingSlot);
      return;
    }

    // Force reflow so the just-added transition class kicks in cleanly.
    void incoming.el.offsetWidth;

    incoming.el.classList.add(styles.SlotActive);
    // For plain fade we keep the outgoing slot at opacity 1 underneath (new layer fades in over it).
    // For crossfades the outgoing actively fades out.
    // if(transition !== 'fade') {
    outgoing.el.classList.remove(styles.SlotActive);
    // }

    [visibleSlot, stagingSlot] = [incoming, outgoing];

    if(stagingSlot.appliedWallPaper) {
      stagingSlot.el.addEventListener('transitionend', () => {
        stagingSlot.el.classList.remove(styles.SlotActive);
        clearSlot(stagingSlot);
      }, {once: true});
    }
  };

  onMount(() => {
    visibleSlot = {el: createSlotEl()};
    stagingSlot = {el: createSlotEl()};
    layer.append(visibleSlot.el, stagingSlot.el);

    const onResize = () => ChatBackgroundPatternRenderer.resizeInstancesOf(layer);
    window.addEventListener('resize', onResize);
    onCleanup(() => {
      window.removeEventListener('resize', onResize);
      clearSlot(visibleSlot);
      clearSlot(stagingSlot);
    });
  });

  createEffect(on(
    () => [props.theme, props.wallPaper, props.peerId] as const,
    async(deps) => {
      const [propTheme, propWallPaper, propPeerId] = deps;
      const myTempId = ++tempId;
      const ctl = themeController();
      const mgrs = managers();

      // Resolve theme/wallPaper from peer profile if caller passed only peerId.
      let theme = propTheme;
      let wallPaper = propWallPaper;
      if(propPeerId && !theme && !wallPaper && mgrs) {
        const fromPeer = await resolveFromPeer(propPeerId, mgrs);
        if(myTempId !== tempId) return;
        theme = fromPeer.theme;
        wallPaper = fromPeer.wallPaper;
      }

      const resolved = resolveBackgroundSync({theme, wallPaper}, ctl);

      if(visibleSlot.appliedTheme === resolved.theme && visibleSlot.appliedWallPaper === resolved.wallPaper) {
        log('same background, skipping');
        props.onCachedStatus?.(true);
        props.onReady?.();
        return;
      }

      // Load the wallpaper file (may be cached or kick off a download).
      const {urlOrPromise} = getWallPaperUrl(resolved.wallPaper, mgrs);
      let url: string | undefined;
      let cached = true;
      if(urlOrPromise !== undefined) {
        cached = !(urlOrPromise instanceof Promise);
        props.onCachedStatus?.(cached);
        try {
          url = await urlOrPromise;
        } catch(err) {
          log.warn('wallpaper load failed', err);
          props.onReady?.();
          return;
        }
        if(myTempId !== tempId) return;
      } else {
        props.onCachedStatus?.(true);
      }

      // Build canvases/renderers offstage; only mount into the slot once we know we're still current.
      const built = buildContent(
        layer,
        resolved,
        url,
        props.width ?? windowSize.width,
        props.height ?? windowSize.height
      );
      await built.readyPromise;
      if(myTempId !== tempId) {
        disposeBuilt(built);
        return;
      }

      const hadPrevious = !!visibleSlot.appliedWallPaper;
      const transition = resolveTransition(props.transition, cached, hadPrevious);

      clearSlot(stagingSlot);
      attachBuiltToSlot(stagingSlot, built);

      props.gradientRendererRef?.(built.gradientRenderer);

      const hsla = computeHighlightingHsla(built);
      if(hsla) props.onHighlightColor?.(hsla);

      presentStagingSlot(transition);
      props.onReady?.();
    }
  ));

  return <div ref={layer} class={classNames(styles.Layer, props.class)} />;
};

/**
 * Page-wide singleton. Lives at module scope, mounts a `<ChatBackground>` into a body-level div.
 *
 * Imperative API surface:
 * - `attach(parent)` — mount the layer (idempotent; default parent is `document.body`).
 * - `setBackground({theme, wallPaper, transition, onCachedStatus})` — drive a new bg, returns a
 *   promise that resolves once the new layer is on screen. Calling again before resolution
 *   resolves the previous promise as superseded.
 * - `getActiveGradientRenderer()` — current gradient renderer (used by send-message animation).
 * - `getReadyPromise()` — promise of the most recent `setBackground` call (or resolved if idle).
 * - `resize()` — re-render pattern at the new layer size.
 */
const appChatBackground = (() => {
  const element = document.createElement('div');

  // Solid signal driving the embedded `<ChatBackground>` props.
  const [props, setProps] = createSignal<ChatBackgroundProps>({});

  let activeGradientRenderer: ChatBackgroundGradientRenderer | undefined;
  const gradientRendererListeners = new Set<(r: ChatBackgroundGradientRenderer | undefined) => void>();
  let mounted = false;

  // `pendingResolve` resolves the promise returned from the in-flight setBackground call.
  // Replaced (and called) when a newer setBackground arrives.
  let pendingResolve: (() => void) | undefined;
  let latestReady: Promise<void> = Promise.resolve();
  // Tracks the most-recently-applied (settled) theme/wallPaper so we can short-circuit a
  // setBackground call whose deps match — otherwise the inner `on(...)` effect wouldn't fire
  // and the returned promise would hang. We can't read the signal here because callers run
  // inside a reactive scope and we'd accidentally subscribe → setProps → recurse.
  let lastAppliedTheme: ChatBackgroundTheme | undefined;
  let lastAppliedWallPaper: WallPaper | undefined;
  let lastHighlightHsla: string | undefined;
  let hasSettled = false;

  const attach = (parent: HTMLElement = document.body) => {
    if(element.parentElement !== parent) {
      parent.insertBefore(element, parent.firstChild);
    }
    if(mounted) return;
    mounted = true;

    render(() => (
      <ChatBackground
        theme={props().theme}
        wallPaper={props().wallPaper}
        transition={props().transition}
        gradientRendererRef={(r) => {
          activeGradientRenderer = r;
          for(const listener of gradientRendererListeners) listener(r);
        }}
        onHighlightColor={(hsla) => {
          lastHighlightHsla = hsla;
          // Always update the global root — the auth shell, sidebars, and any
          // bubble outside an active chat container all read the highlighting
          // color from `:root`. The singleton itself is *not* an ancestor of
          // bubbles, so writing the var on `element` is dead.
          themeControllerSingleton.applyHighlightingColor({hsla});
          // Per-chat handoff: the active Chat passes its container as the
          // target so its bubbles see *its* hsla, not whatever the next chat
          // overwrites on root.
          props().onHighlightColor?.(hsla);
        }}
        onCachedStatus={(cached) => props().onCachedStatus?.(cached)}
        onReady={() => props().onReady?.()}
      />
    ), element);
  };

  const setBackground = (opts: {
    theme?: ChatBackgroundTheme,
    wallPaper?: WallPaper,
    transition?: ChatBackgroundTransition,
    onCachedStatus?: (cached: boolean) => void,
    onHighlightColor?: (hsla: string) => void
  } = {}): Promise<void> => {
    // Resolve any in-flight promise as superseded so awaiters don't hang.
    pendingResolve?.();

    let resolve!: () => void;
    latestReady = new Promise<void>((r) => resolve = r);
    pendingResolve = resolve;

    // The component's effect runs via `on([theme, wallPaper, peerId])` (referential equality).
    // If theme & wallPaper are unchanged the effect won't fire — onReady would never be called
    // and awaiters (e.g. `Chat.finishPeerChange`) would hang. Short-circuit in that case.
    if(hasSettled && lastAppliedTheme === opts.theme && lastAppliedWallPaper === opts.wallPaper) {
      opts.onCachedStatus?.(true);
      // Replay the cached hsla so a returning chat (publishBackground hits the
      // short-circuit) still applies its highlighting color to its container.
      if(lastHighlightHsla !== undefined) {
        opts.onHighlightColor?.(lastHighlightHsla);
      }
      resolve();
      if(pendingResolve === resolve) pendingResolve = undefined;
      return latestReady;
    }

    setProps({
      theme: opts.theme,
      wallPaper: opts.wallPaper,
      transition: opts.transition,
      onCachedStatus: opts.onCachedStatus,
      onHighlightColor: opts.onHighlightColor,
      onReady: () => {
        hasSettled = true;
        lastAppliedTheme = opts.theme;
        lastAppliedWallPaper = opts.wallPaper;
        resolve();
        if(pendingResolve === resolve) pendingResolve = undefined;
      }
    });

    return latestReady;
  };

  // Re-paint when the global theme switches (day ↔ night). Without this the
  // canvas-based bg would stay frozen — the inner effect tracks [theme, wallPaper,
  // peerId] by reference, and the dominant code path (auth flow, plus appImManager's
  // own theme_changed handler) calls setBackground without an explicit theme, so
  // none of the deps change. We pass the resolved theme so the wrapper's
  // lastAppliedTheme check sees a fresh reference and lets the effect re-fire.
  rootScope.addEventListener('theme_changed', () => {
    if(!hasSettled) return;
    setBackground({
      theme: themeControllerSingleton.getTheme(),
      transition: 'fade'
    });
  });

  return {
    element,
    attach,
    setBackground,
    getActiveGradientRenderer: () => activeGradientRenderer,
    /**
     * Subscribe to changes of the active gradient renderer (replaced on wallpaper/theme swap).
     * Listener is called with the current renderer immediately on subscribe. Returns an
     * unsubscribe function.
     */
    onActiveGradientRendererChange: (listener: (r: ChatBackgroundGradientRenderer | undefined) => void) => {
      gradientRendererListeners.add(listener);
      listener(activeGradientRenderer);
      return () => {
        gradientRendererListeners.delete(listener);
      };
    },
    getReadyPromise: () => latestReady,
    resize: () => ChatBackgroundPatternRenderer.resizeInstancesOf(element)
  };
})();

export type AppChatBackground = typeof appChatBackground;
MOUNT_CLASS_TO && (MOUNT_CLASS_TO.appChatBackground = appChatBackground);
export default appChatBackground;
