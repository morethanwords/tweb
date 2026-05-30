import {createEffect, createResource, on, onCleanup, Ref} from 'solid-js';
import {ScrollableX} from '@components/scrollable';
import {AppBackgroundTab} from '@components/sidebarLeft/tabs/background';
import {attachClickEvent} from '@helpers/dom/clickEvent';
import findUpClassName from '@helpers/dom/findUpClassName';
import ListenerSetter from '@helpers/listenerSetter';
import createMiddleware from '@helpers/solid/createMiddleware';
import {IS_SAFARI} from '@environment/userAgent';
import {DEFAULT_THEME} from '@config/state';
import {blendWallpaperForTinted} from '@config/themePresets';
import {BaseTheme, Theme} from '@layer';
import rootScope from '@lib/rootScope';
import themeController from '@helpers/themeController';
import liteMode from '@helpers/liteMode';
import RLottiePlayer from '@lib/rlottie/rlottiePlayer';
import wrapStickerEmoji from '@components/wrappers/stickerEmoji';

type ThemeItem = {
  container: HTMLElement;
  theme: Theme;
  player?: RLottiePlayer;
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
  // Start hidden so the tiles don't pop in for one frame after the async
  // `getThemes()` resolves. We flip opacity to 1 once `buildThemes` has
  // finished mounting the containers, letting the CSS transition fade them in.
  scrollable.container.style.opacity = '0';
  scrollable.container.style.transition = 'opacity .2s ease';

  const [themesPromise] = createResource(() => rootScope.managers.appThemesManager.getThemes());

  const buildThemes = async() => {
    const themes = themesPromise();
    if(!themes) return;

    const defaultThemes = themes.filter((theme) => theme.pFlags.default);
    defaultThemes.unshift(DEFAULT_THEME);

    const containers = await Promise.all(defaultThemes.map(async(theme) => {
      const container = document.createElement('div');
      const k: ThemeItem = {container, theme, wallPaperContainers: {}};

      // Cloud themes (numeric id) get their tinted wallpaper navy-blended;
      // DEFAULT_THEME (id='') and accent presets keep their curated gradients.
      const themeId = String(theme.id ?? '');
      const isCurated = themeId === '' || themeId.startsWith('preset:');

      const results = theme.settings
      .filter((themeSettings) => AVAILABLE_BASE_THEMES.has(themeSettings.base_theme._))
      .map((themeSettings) => {
        const shouldBlend = themeSettings.base_theme._ === 'baseThemeTinted' && !isCurated && themeSettings.wallpaper;
        const wp = shouldBlend ? blendWallpaperForTinted(themeSettings.wallpaper, themeSettings.accent_color) : themeSettings.wallpaper;
        const result = AppBackgroundTab.addWallPaper(wp, undefined, themeSettings.base_theme._);
        // addWallPaper returns undefined for a pattern wallpaper with no colors —
        // skip rather than deref (matches the tinted-fallback guard below).
        if(!result) return undefined;
        k.wallPaperContainers[themeSettings.base_theme._] = result.container;
        solidRoots.push(result.dispose);
        return result;
      })
      .filter(Boolean);

      // Synthesize a tinted preview from the night entry when the theme ships
      // only Classic/Night, matching applyNewTheme's blend-on-fallback.
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

      themesMap.set(container, k);
      applyThemeOnItem(k);

      if(String(theme.id ?? '') === props.selectedId()) {
        container.classList.add('active');
      }

      const loadPromises: Promise<any>[] = [];
      let emoticonContainer: HTMLElement;
      if(theme.emoticon) {
        emoticonContainer = document.createElement('div');
        emoticonContainer.classList.add('theme-emoticon');
        const size = 28 * 1.75;
        wrapStickerEmoji({
          div: emoticonContainer,
          width: size,
          height: size,
          emoji: theme.emoticon,
          managers: rootScope.managers,
          loadPromises,
          middleware,
          play: false,
          group: 'none'
        }).then(({render}) => render).then((player) => {
          k.player = player as RLottiePlayer;
        });
      }

      const bubble = document.createElement('div');
      bubble.classList.add('theme-bubble');
      const bubbleIn = bubble.cloneNode() as HTMLElement;
      bubbleIn.classList.add('is-in');
      bubble.classList.add('is-out');

      loadPromises.push(...results.map((result) => result.loadPromise));
      container.classList.add('theme-container');

      await Promise.all(loadPromises);

      if(emoticonContainer) container.append(emoticonContainer);
      container.append(bubbleIn, bubble);

      return container;
    }));

    if(!middleware()) return;
    scrollable.append(...containers);
    // Reveal in the next frame so the appended DOM has settled (layout +
    // background-item paints are flushed) before the opacity transition runs.
    requestAnimationFrame(() => {
      scrollable.container.style.opacity = '1';
    });
  };

  createEffect(on(themesPromise, (themes) => {
    if(themes) {
      buildThemes();
    }
  }));

  // Reactively re-stripe `.active` when the external selectedId changes.
  createEffect(() => {
    const id = props.selectedId();
    const lastActive = scrollable.container.querySelector('.active');
    lastActive?.classList.remove('active');
    themesMap.forEach((item) => {
      if(String(item.theme.id ?? '') === id) {
        item.container.classList.add('active');
      }
    });
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

    if(!item.player || !liteMode.isAvailable('animations')) return;

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
