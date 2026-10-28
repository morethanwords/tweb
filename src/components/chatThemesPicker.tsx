import {createEffect, createResource, on, onCleanup, Ref} from 'solid-js';
import {ScrollableX} from '@components/scrollable';
import {AppBackgroundTab} from '@components/sidebarLeft/tabs/background';
import {attachClickEvent} from '@helpers/dom/clickEvent';
import {attachPickerGrid} from '@helpers/dom/attachListNavigation';
import findUpClassName from '@helpers/dom/findUpClassName';
import ListenerSetter from '@helpers/listenerSetter';
import createMiddleware from '@helpers/solid/createMiddleware';
import {IS_SAFARI} from '@environment/userAgent';
import {DEFAULT_THEME} from '@config/state';
import {blendWallpaperForTinted} from '@config/themePresets';
import {BaseTheme, Theme} from '@layer';
import rootScope from '@lib/rootScope';
import I18n from '@lib/langPack';
import themeController from '@helpers/themeController';
import {paintThemeOutBubble} from '@helpers/outgoingMessageGradient';
import {getRgbColorFromTelegramColor, rgbaToHexa} from '@helpers/color';
import liteMode from '@helpers/liteMode';
import LottiePlayer from '@lib/lottie/lottiePlayer';
import wrapStickerEmoji from '@components/wrappers/stickerEmoji';
import {bindManagersToSession} from '@lib/accounts/bindManagersToAccount';

type ThemeItem = {
  container: HTMLElement;
  theme: Theme;
  player?: LottiePlayer;
  wallPaperContainers: {[key in BaseTheme['_']]?: HTMLElement};
};

const AVAILABLE_BASE_THEMES: Set<BaseTheme['_']> = new Set([
  'baseThemeClassic',
  'baseThemeNight',
  'baseThemeDay',
  'baseThemeTinted'
]);

// Inverse of themeController's `themeNameToBaseTheme`. The virtual theme below
// pins its `name` so that applyTheme's internal `getThemeSettings` —
// which re-derives the base via `getBaseThemeForName(name)` — lands back on the
// single entry we hand it. Pinning a bare 'day'/'night' only works for the
// classic/night bases (the popup's only two), because getBaseThemeForName('day')
// is 'baseThemeClassic' and ('night') is 'baseThemeNight'. For Day/Light/Tinted
// bases (which General Settings uses) that lookup misses the entry and applyTheme
// throws reading `accent_color` off undefined — so map base → its own name.
const BASE_THEME_TO_THEME_NAME: {[k in BaseTheme['_']]?: string} = {
  baseThemeClassic: 'day',
  baseThemeNight: 'night',
  baseThemeDay: 'light',
  baseThemeTinted: 'tinted'
};

export type ChatThemesPickerProps = {
  /** Reactive theme.id of the currently selected theme. Empty string = DEFAULT_THEME. */
  selectedId: () => string;
  /** Called when the user picks a tile. */
  onSelect: (theme: Theme) => void;
  /**
   * Reactive base theme for wallpaper rendering. Defaults to the live base from
   * `themeController`. Override when the picker needs to show a different
   * brightness than the global app theme (e.g. the My QR popup, where the user
   * can toggle local night-mode independently of the chat).
   */
  baseTheme?: () => BaseTheme['_'];
  /**
   * When true, the active tile is scrolled to centre after a base-theme change
   * (day/night/tinted switch). Opt-in for General Settings (which restores the
   * legacy auto-centre behaviour); the My QR popup leaves it off so a tile pick
   * isn't fought by a competing scroll.
   */
  recenterOnBaseChange?: boolean;
  class?: string;
  ref?: Ref<HTMLDivElement>;
  /** Fires once the tiles are built and in the DOM. */
  onReady?: () => void;
};

/**
 * Horizontal-scrollable strip of cloud chat themes (emoji-on-wallpaper tiles).
 *
 * Lifted out of `generalSettings.tsx`'s `ThemeSection` so the My QR popup can
 * share the exact same tiles without dragging in `themeController.applyNewTheme`
 * side effects. The component is pure-UI: selection state is owned externally
 * via `selectedId` + `onSelect`; clicking a tile only animates and emits — it's
 * up to the caller to apply the theme globally if that's what they want.
 *
 * Mirrors the legacy picker's behaviour:
 *  - First tile is `DEFAULT_THEME` (the "no custom theme" sentinel, id === '').
 *  - Each cloud theme renders its wallpaper for the active base + its emoticon
 *    as a Lottie sticker that scales-pulse-restores on click.
 *  - Wallpaper variants are pre-blended for `baseThemeTinted` on non-curated
 *    themes, matching `themeController.applyNewTheme`'s preview path.
 */
export default function ChatThemesPicker(props: ChatThemesPickerProps) {
  const middleware = createMiddleware().get();

  const themesMap = new Map<HTMLElement, ThemeItem>();
  const solidRoots: (() => void)[] = [];
  let lastOnFrameNo: ((frameNo: number) => void) | undefined;

  const getBaseTheme = (): BaseTheme['_'] =>
    props.baseTheme?.() ?? themeController.getBaseThemeForName(themeController.getTheme().name);

  // Picks the wallpaper container for the currently-active base theme, with a
  // night fallback so themes that ship only Classic/Night look right when shown
  // on Tinted as well. Also re-scopes the tile's CSS variables to *its own*
  // theme so the .theme-bubble pill paints in the theme's accent colour
  // (purple / green / blue / pink) instead of the globally-applied accent —
  // without this, every tile reads the global `--primary-color` and ends up
  // looking the same.
  //
  // We don't pass any "isNight override" to `applyTheme` — modifying the
  // controller's signature would risk breaking the global theme-switch View
  // Transition. Instead we build a *virtual* theme: clone item.theme, pin its
  // `name` to the theme-name that maps back to the active base (see
  // BASE_THEME_TO_THEME_NAME — so applyTheme's internal `getThemeSettings` /
  // `isNightThemeName` / `baseColors` lookups all land on the picker-local
  // base), and trim `settings[]` to the single entry for that base. applyTheme
  // then resolves back to that entry through its normal path and applies base
  // colors reflecting the picker's local brightness, not the global theme.
  const applyThemeOnItem = (item: ThemeItem) => {
    const base = getBaseTheme();
    const isNight = base === 'baseThemeNight' || base === 'baseThemeTinted';
    const entry = item.theme.settings?.find((s) => s.base_theme._ === base) ??
      item.theme.settings?.find((s) => s.base_theme._ === (isNight ? 'baseThemeNight' : 'baseThemeClassic')) ??
      item.theme.settings?.[0];
    // Pin the name to the one matching the entry's ACTUAL base (it may differ
    // from the requested `base` when we fell back above), so applyTheme resolves
    // back to this entry. See BASE_THEME_TO_THEME_NAME.
    const effectiveBase = entry?.base_theme._ ?? base;
    const virtualTheme = {
      ...item.theme,
      name: BASE_THEME_TO_THEME_NAME[effectiveBase] ?? (isNight ? 'night' : 'day'),
      settings: entry ? [entry] : item.theme.settings
    } as unknown as Theme;
    themeController.applyTheme(virtualTheme, item.container);

    // Force `.theme-bubble.is-out` to the theme's raw message_colors (bottom→top
    // linear, or freeform image for animated themes like Gaming). applyTheme
    // already scopes the CSS var onto the container; this paints the pill itself
    // so previews don't fall back to a blended --light-filled-* colour.
    const messageColorHexes = (entry?.message_colors ?? []).map((color) =>
      rgbaToHexa(getRgbColorFromTelegramColor(color))
    );
    paintThemeOutBubble(
      item.container.querySelector<HTMLElement>('.theme-bubble.is-out'),
      {
        hexColors: messageColorHexes,
        // Freeform only when TL flags.2 message_colors_animated is set.
        animated: !!(
          entry?.pFlags?.message_colors_animated ||
          ((entry?.flags ?? 0) & (1 << 2))
        ),
        host: item.container
      }
    );

    const previous = item.container.querySelector('.background-item');
    previous?.remove();

    const wallPaperContainer = item.wallPaperContainers[base] ??
      item.wallPaperContainers[isNight ? 'baseThemeNight' : 'baseThemeClassic'];
    if(wallPaperContainer) {
      item.container.prepend(wallPaperContainer);
    }
  };

  const scrollable = new ScrollableX(null);
  scrollable.container.classList.add('themes-container');
  // A toolbar, so a screen reader announces the strip as one stop that is walked with the arrows.
  scrollable.container.setAttribute('role', 'toolbar');
  scrollable.container.setAttribute('aria-label', I18n.format('ColorTheme', true));
  // The tiles are plain <div>s picked by the delegated click below: the shared picker grid gives
  // them a role, a name, a single tab stop with arrow keys, and Enter / Space as a click.
  const detachPickerGrid = attachPickerGrid(scrollable.container, '.theme-container', (item) => {
    const theme = themesMap.get(item)?.theme;
    return theme?.title || theme?.emoticon || I18n.format('ThemeDay', true);
  });

  const setActive = (container: HTMLElement, active: boolean) => {
    container.classList.toggle('active', active);
    container.setAttribute('aria-pressed', String(active));
  };
  // Soft fade-in once the first tiles are in the DOM (not after every wallpaper
  // / sticker finishes — that made the strip feel seconds late).
  scrollable.container.style.opacity = '0';
  scrollable.container.style.transition = 'opacity .15s ease';

  const [themesPromise] = createResource(() => rootScope.managers.appThemesManager.getThemes());

  const buildThemes = async() => {
    const managers = bindManagersToSession(rootScope.managers);
    const themes = themesPromise();
    if(!themes) return;

    // Stickers can load in parallel with tile construction. The animated-emoji
    // set must exist before wrapStickerEmoji, but we don't need to block wallpaper
    // + bubble paint on it — kick it off and await only when wrapping.
    const stickerSetReady = managers.appStickersManager.getAnimatedEmojiStickerSet();

    const defaultThemes = themes.filter((theme) => theme.pFlags.default);
    defaultThemes.unshift(DEFAULT_THEME);

    // Build shells synchronously so .theme-bubble.is-out exists *before*
    // paintThemeOutBubble runs. Previously applyThemeOnItem ran first, queried
    // a missing bubble, and left every out-pill on the CSS fallback until click.
    const containers: HTMLElement[] = [];
    for(const theme of defaultThemes) {
      const container = document.createElement('div');
      container.classList.add('theme-container');
      const k: ThemeItem = {container, theme, wallPaperContainers: {}};

      const themeId = String(theme.id ?? '');
      const isCurated = themeId === '' || themeId.startsWith('preset:');

      const results = theme.settings
      .filter((themeSettings) => AVAILABLE_BASE_THEMES.has(themeSettings.base_theme._))
      .map((themeSettings) => {
        const shouldBlend = themeSettings.base_theme._ === 'baseThemeTinted' && !isCurated && themeSettings.wallpaper;
        const wp = shouldBlend ? blendWallpaperForTinted(themeSettings.wallpaper, themeSettings.accent_color) : themeSettings.wallpaper;
        const result = AppBackgroundTab.addWallPaper(wp, undefined, themeSettings.base_theme._);
        if(!result) return undefined;
        k.wallPaperContainers[themeSettings.base_theme._] = result.container;
        solidRoots.push(result.dispose);
        return result;
      })
      .filter(Boolean);

      if(!k.wallPaperContainers['baseThemeTinted'] && !isCurated) {
        const nightEntry = theme.settings.find((s) => s.base_theme._ === 'baseThemeNight');
        if(nightEntry?.wallpaper) {
          const blendedWp = blendWallpaperForTinted(nightEntry.wallpaper, nightEntry.accent_color);
          const result = AppBackgroundTab.addWallPaper(blendedWp, undefined, 'baseThemeTinted');
          if(result) {
            k.wallPaperContainers['baseThemeTinted'] = result.container;
            solidRoots.push(result.dispose);
            results.push(result);
          }
        }
      }

      const bubble = document.createElement('div');
      bubble.classList.add('theme-bubble', 'is-out');
      const bubbleIn = document.createElement('div');
      bubbleIn.classList.add('theme-bubble', 'is-in');

      const emoticonContainer = theme.emoticon ? document.createElement('div') : undefined;
      if(emoticonContainer) {
        emoticonContainer.classList.add('theme-emoticon');
        container.append(emoticonContainer);
      }
      container.append(bubbleIn, bubble);

      themesMap.set(container, k);
      // Bubbles are children now — applyTheme + paintThemeOutBubble hit the out pill.
      applyThemeOnItem(k);
      setActive(container, String(theme.id ?? '') === props.selectedId());

      containers.push(container);

      // Stickers + wallpaper bitmaps fill in without blocking the strip reveal.
      if(emoticonContainer && theme.emoticon) {
        const loadPromises: Promise<any>[] = [];
        stickerSetReady.then(() => {
          if(!middleware()) return;
          const size = 28 * 1.75;
          return wrapStickerEmoji({
            div: emoticonContainer,
            width: size,
            height: size,
            emoji: theme.emoticon,
            managers,
            loadPromises,
            middleware,
            play: false,
            group: 'none'
          }).then(({render}) => render).then((player) => {
            k.player = player as LottiePlayer;
          });
        }).catch(() => {});
      }
      // Warm wallpaper loads in the background (DOM already has the containers).
      void Promise.all(results.map((result) => result.loadPromise)).catch(() => {});
    }

    if(!middleware()) return;
    scrollable.append(...containers);
    requestAnimationFrame(() => {
      scrollable.container.style.opacity = '1';
    });

    props.onReady?.();
  };

  createEffect(on(themesPromise, (themes) => {
    if(themes) {
      buildThemes();
    }
  }));

  // Reactively re-stripe `.active` when the external selectedId changes.
  createEffect(() => {
    const id = props.selectedId();
    themesMap.forEach((item) => setActive(item.container, String(item.theme.id ?? '') === id));
  });

  // Reactively re-paint thumbnails when the base theme changes (e.g. user
  // toggles night-mode inside the popup without touching the global theme).
  createEffect(on(
    () => props.baseTheme?.(),
    () => {
      themesMap.forEach((item) => applyThemeOnItem(item));
      // Restore the legacy "scroll active tile to centre on variant change"
      // (General Settings only — see recenterOnBaseChange).
      if(props.recenterOnBaseChange) {
        const active = scrollable.container.querySelector('.active') as HTMLElement | null;
        if(active) scrollable.scrollIntoViewNew({element: active, position: 'center', axis: 'x'});
      }
    },
    {defer: true}
  ));

  const listenerSetter = new ListenerSetter();
  attachClickEvent(scrollable.container, async(e) => {
    const container = findUpClassName(e.target, 'theme-container');
    if(!container) return;

    const item = themesMap.get(container);
    if(!item) return;

    props.onSelect(item.theme);
    lastOnFrameNo?.(-1);

    if(!item.player || !liteMode.isAvailable('motion')) return;

    if(IS_SAFARI) {
      if(item.player.paused) item.player.restart();
      return;
    }

    if(item.player.paused) item.player.stop(true);
    item.player.el[0].style.transform = 'scale(2)';

    const onFrameNo = lastOnFrameNo = (frameNo) => {
      if(item.player.maxFrame === frameNo || frameNo === -1) {
        item.player.el[0].style.transform = '';
        item.player.removeEventListener('enterFrame', onFrameNo);
        if(lastOnFrameNo === onFrameNo) lastOnFrameNo = undefined;
      }
    };

    setTimeout(() => {
      if(lastOnFrameNo !== onFrameNo) return;
      item.player.play();
      item.player.addEventListener('enterFrame', onFrameNo);
    }, 250);
  }, {listenerSetter});

  onCleanup(() => {
    detachPickerGrid();
    listenerSetter.removeAll();
    solidRoots.forEach((d) => d());
  });

  return (
    <div
      class={props.class}
      ref={(el) => {
        el.append(scrollable.container);
        const ref = props.ref;
        if(typeof ref === 'function') (ref as (el: HTMLDivElement) => void)(el);
      }}
    />
  );
}
