import {Accessor, createEffect, createResource, on, onCleanup, Ref} from 'solid-js';
import {ScrollableX} from '@components/scrollable';
import {AppBackgroundTab} from '@components/sidebarLeft/tabs/background';
import {attachClickEvent} from '@helpers/dom/clickEvent';
import {attachPickerGrid} from '@helpers/dom/attachListNavigation';
import findUpClassName from '@helpers/dom/findUpClassName';
import ListenerSetter from '@helpers/listenerSetter';
import createMiddleware from '@helpers/solid/createMiddleware';
import {IS_SAFARI} from '@environment/userAgent';
import {DEFAULT_THEME} from '@config/state';
import {blendWallpaperForTinted, getCloudThemeWallpaper} from '@config/themePresets';
import {BaseTheme, Theme} from '@layer';
import rootScope from '@lib/rootScope';
import I18n, {i18n, LangPackKey} from '@lib/langPack';
import themeController from '@helpers/themeController';
import liteMode from '@helpers/liteMode';
import LottiePlayer from '@lib/lottie/lottiePlayer';
import wrapStickerEmoji from '@components/wrappers/stickerEmoji';
import {bindManagersToSession} from '@lib/accounts/bindManagersToAccount';
import wrapEmojiText from '@lib/richTextProcessor/wrapEmojiText';
import wrapSticker from '@components/wrappers/sticker';
import {MyDocument} from '@appManagers/appDocsManager';
import {avatarNew} from '@components/avatarNew';
import Icon from '@components/icon';
import getPeerTitle from '@components/wrappers/getPeerTitle';
import noop from '@helpers/noop';
import createSerializedQueue from '@helpers/createSerializedQueue';
import isDocumentRTL from '@helpers/dom/isDocumentRTL';
import useBaseTheme from '@hooks/useBaseTheme';

/** One tile of the strip. */
export type ChatThemesPickerItem = {
  /** Compared with `selectedId`. */
  id: string,
  /** Left out for a tile that stands for no theme at all. */
  theme?: Theme,
  /** Drawn at the bottom instead of the theme's emoticon — a gift's model. */
  sticker?: MyDocument,
  /** Drawn at the bottom when the theme has no emoticon of its own. */
  emoticon?: string,
  /** The text of a tile without a theme. */
  label?: LangPackKey,
  /** The chat a gift is the theme of already. */
  takenBy?: PeerId
};

type ThemeItem = {
  container: HTMLElement;
  item: ChatThemesPickerItem;
  player?: LottiePlayer;
  wallPaperContainers: {[key in BaseTheme['_']]?: HTMLElement};
  disposers: (() => void)[];
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

const EMOTICON_SIZE = 28 * 1.75;

/**
 * A cloud theme as it looks on `base`, whatever the app's own theme is: its settings for that base
 * (or the night / classic ones), and the name `themeController.applyTheme` lands back on them by.
 */
export function pinThemeToBase(theme: Theme, base: BaseTheme['_']): Theme {
  const isNight = base === 'baseThemeNight' || base === 'baseThemeTinted';
  const entry = theme.settings?.find((s) => s.base_theme._ === base) ??
    theme.settings?.find((s) => s.base_theme._ === (isNight ? 'baseThemeNight' : 'baseThemeClassic')) ??
    theme.settings?.[0];
  // Pin the name to the one matching the entry's ACTUAL base (it may differ
  // from the requested `base` when we fell back above), so applyTheme resolves
  // back to this entry. See BASE_THEME_TO_THEME_NAME.
  const effectiveBase = entry?.base_theme._ ?? base;
  return {
    ...theme,
    name: BASE_THEME_TO_THEME_NAME[effectiveBase] ?? (isNight ? 'night' : 'day'),
    settings: entry ? [entry] : theme.settings
  } as unknown as Theme;
}

export type ChatThemesPickerProps = {
  /** Reactive id of the currently selected tile. Empty string = DEFAULT_THEME. */
  selectedId: () => string;
  /** Called when the user picks a tile. */
  onSelect: (theme: Theme, item: ChatThemesPickerItem) => void;
  /**
   * The tiles, in order. Defaults to the cloud themes behind the "no custom theme" one. New tiles
   * are built and slotted in as the list grows; the ones already built stay as they are.
   */
  items?: Accessor<ChatThemesPickerItem[]>;
  /**
   * Whether the tinted base shows a theme's wallpaper blended into the tinted palette, the way
   * `themeController.applyNewTheme` applies it to the app. A chat's own theme is never blended.
   */
  blendTinted?: boolean;
  /** Asked for more once the tile with the `loadMoreAfter()` id is about to come into view. */
  loadMoreAfter?: () => string | undefined;
  onLoadMore?: () => void;
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
  /** Fires once the first tiles are built and in the DOM. */
  onReady?: () => void;
  /** The host shows the strip only once it is ready (`onReady`): the tiles do not fade in on it */
  shownWhenReady?: boolean;
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
 *
 * A chat's theme picker passes its own `items` instead: a tile for no theme, the gifts that can
 * be a theme (their model in place of the emoticon) and the emoticon themes.
 */
export default function ChatThemesPicker(props: ChatThemesPickerProps) {
  const middleware = createMiddleware().get();
  const managers = bindManagersToSession(rootScope.managers);

  const themesMap = new Map<HTMLElement, ThemeItem>();
  const tilesById = new Map<string, ThemeItem>();
  let lastOnFrameNo: ((frameNo: number) => void) | undefined;

  // * the app's own when the host gives none, followed as it changes
  const appBaseTheme = useBaseTheme();
  const getBaseTheme = (): BaseTheme['_'] => props.baseTheme?.() ?? appBaseTheme();

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
  // Transition. Instead we build a *virtual* theme: clone the item's theme, pin its
  // `name` to the theme-name that maps back to the active base (see
  // BASE_THEME_TO_THEME_NAME — so applyTheme's internal `getThemeSettings` /
  // `isNightThemeName` / `baseColors` lookups all land on the picker-local
  // base), and trim `settings[]` to the single entry for that base. applyTheme
  // then resolves back to that entry through its normal path and applies base
  // colors reflecting the picker's local brightness, not the global theme.
  const applyThemeOnItem = (themeItem: ThemeItem) => {
    const theme = themeItem.item.theme;
    if(!theme) {
      return;
    }

    const base = getBaseTheme();
    const isNight = base === 'baseThemeNight' || base === 'baseThemeTinted';
    themeController.applyTheme(pinThemeToBase(theme, base), themeItem.container);

    const previous = themeItem.container.querySelector('.background-item');
    previous?.remove();

    const wallPaperContainer = themeItem.wallPaperContainers[base] ??
      themeItem.wallPaperContainers[isNight ? 'baseThemeNight' : 'baseThemeClassic'];
    if(wallPaperContainer) {
      themeItem.container.prepend(wallPaperContainer);
    }
  };

  const scrollable = new ScrollableX(null);
  scrollable.container.classList.add('themes-container');
  // A toolbar, so a screen reader announces the strip as one stop that is walked with the arrows.
  scrollable.container.setAttribute('role', 'toolbar');
  scrollable.container.setAttribute('aria-label', I18n.format('ColorTheme', true));
  // The tiles are plain <div>s picked by the delegated click below: the shared picker grid gives
  // them a role, a name, a single tab stop with arrow keys, and Enter / Space as a click.
  // * a chat theme goes by its emoticon: its title names nothing ("0" on the test servers)
  const detachPickerGrid = attachPickerGrid(scrollable.container, '.theme-container', (container) => {
    const item = themesMap.get(container)?.item;
    if(item?.label) return I18n.format(item.label, true);
    return item?.theme?.emoticon || item?.theme?.title || I18n.format('ThemeDay', true);
  });

  const setActive = (container: HTMLElement, active: boolean) => {
    container.classList.toggle('active', active);
    container.setAttribute('aria-pressed', String(active));
  };
  // Start hidden so the tiles don't pop in for one frame after the async
  // `getThemes()` resolves. We flip opacity to 1 once the first tiles are
  // mounted, letting the CSS transition fade them in.
  if(!props.shownWhenReady) {
    scrollable.container.style.opacity = '0';
    scrollable.container.style.transition = 'opacity .2s ease';
  }

  const [themesPromise] = createResource(() => props.items ? undefined : managers.appThemesManager.getThemes());
  const items = (): ChatThemesPickerItem[] => {
    if(props.items) {
      return props.items();
    }

    const themes = themesPromise();
    if(!themes) {
      return;
    }

    const defaultThemes = themes.filter((theme) => theme.pFlags.default);
    defaultThemes.unshift(DEFAULT_THEME);
    return defaultThemes.map((theme) => ({id: String(theme.id ?? ''), theme}));
  };

  const buildTile = async(item: ChatThemesPickerItem) => {
    const container = document.createElement('div');
    const themeItem: ThemeItem = {container, item, wallPaperContainers: {}, disposers: []};
    const {theme} = item;
    // * known right away, so a change of base or selection reaches it while it is still loading
    themesMap.set(container, themeItem);
    tilesById.set(item.id, themeItem);

    // Cloud themes (numeric id) get their tinted wallpaper navy-blended;
    // DEFAULT_THEME (id='') and accent presets keep their curated gradients.
    const themeId = String(theme?.id ?? '');
    const isCurated = themeId === '' || themeId.startsWith('preset:');
    const blend = props.blendTinted !== false && !isCurated;

    // * a tile does not wait for its wallpaper: the colours show at once, and a pattern comes over them once it is
    // * downloaded (`addWallPaper`) - right after signing in, the strip waited seconds for the patterns
    theme?.settings
    .filter((themeSettings) => AVAILABLE_BASE_THEMES.has(themeSettings.base_theme._))
    .forEach((themeSettings) => {
      const shouldBlend = themeSettings.base_theme._ === 'baseThemeTinted' && blend && themeSettings.wallpaper;
      const wp = shouldBlend ? blendWallpaperForTinted(themeSettings.wallpaper, themeSettings.accent_color) : getCloudThemeWallpaper(theme, themeSettings);
      const result = AppBackgroundTab.addWallPaper(wp, undefined, themeSettings.base_theme._);
      // addWallPaper returns undefined for a pattern wallpaper with no colors —
      // skip rather than deref (matches the tinted-fallback guard below).
      if(!result) return;
      themeItem.wallPaperContainers[themeSettings.base_theme._] = result.container;
      themeItem.disposers.push(result.dispose);
    });

    // Synthesize a tinted preview from the night entry when the theme ships
    // only Classic/Night, matching applyNewTheme's blend-on-fallback.
    if(theme && !themeItem.wallPaperContainers['baseThemeTinted'] && blend) {
      const nightEntry = theme.settings.find((s) => s.base_theme._ === 'baseThemeNight');
      if(nightEntry?.wallpaper) {
        const blendedWp = blendWallpaperForTinted(nightEntry.wallpaper, nightEntry.accent_color);
        const result = AppBackgroundTab.addWallPaper(blendedWp, undefined, 'baseThemeTinted');
        if(result) {
          themeItem.wallPaperContainers['baseThemeTinted'] = result.container;
          themeItem.disposers.push(result.dispose);
        }
      }
    }

    applyThemeOnItem(themeItem);

    setActive(container, item.id === props.selectedId());

    const loadPromises: Promise<any>[] = [];
    let emoticonContainer: HTMLElement;
    const emoticon = item.emoticon ?? theme?.emoticon;
    if(item.sticker || emoticon) {
      emoticonContainer = document.createElement('div');
      emoticonContainer.classList.add('theme-emoticon');
      const setPlayer = (player: unknown) => {
        themeItem.player = player as LottiePlayer;
      };

      if(item.sticker) {
        wrapSticker({
          doc: item.sticker,
          div: emoticonContainer,
          width: EMOTICON_SIZE,
          height: EMOTICON_SIZE,
          middleware,
          loadPromises,
          play: false,
          loop: false,
          group: 'none'
        }).then(({render}) => render).then(setPlayer, noop);
      } else {
        wrapStickerEmoji({
          div: emoticonContainer,
          width: EMOTICON_SIZE,
          height: EMOTICON_SIZE,
          emoji: emoticon,
          managers,
          loadPromises,
          middleware,
          play: false,
          group: 'none'
        }).then(({render}) => render).then(setPlayer, () => {
          // * no animated sticker for it: the emoji itself, as tdesktop draws them
          emoticonContainer.classList.add('is-static');
          emoticonContainer.replaceChildren(wrapEmojiText(emoticon));
        });
      }
    }

    container.classList.add('theme-container');

    // * a tile whose sticker failed still shows
    await Promise.all(loadPromises).catch(noop);

    if(item.label) {
      container.classList.add('is-empty');
      const label = i18n(item.label);
      label.classList.add('theme-label');
      container.append(label);
    }

    if(emoticonContainer) container.append(emoticonContainer);

    if(theme) {
      const bubble = document.createElement('div');
      bubble.classList.add('theme-bubble');
      const bubbleIn = bubble.cloneNode() as HTMLElement;
      bubbleIn.classList.add('is-in');
      bubble.classList.add('is-out');

      // * a gift in use in another chat: who has it, the way tdesktop marks it — and in words for
      // * a screen reader, which names the tile by its theme only
      if(item.takenBy) {
        const avatar = avatarNew({
          middleware,
          peerId: item.takenBy,
          size: 16,
          isDialog: false
        });
        avatar.render();
        avatar.node.classList.add('theme-bubble-avatar');
        bubbleIn.classList.add('is-taken');
        bubbleIn.append(avatar.node, Icon('forward', 'theme-bubble-icon'));
        getPeerTitle({peerId: item.takenBy, plainText: true}).then((title) => {
          container.setAttribute('aria-description', title);
        });
      }

      container.append(bubbleIn, bubble);
    }

    return themeItem;
  };

  const disposeTile = (themeItem: ThemeItem) => {
    themeItem.container.remove();
    themeItem.disposers.forEach((dispose) => dispose());
    tilesById.delete(themeItem.item.id);
    themesMap.delete(themeItem.container);
  };

  const checkLoadMore = () => {
    const id = props.loadMoreAfter?.();
    const container = id !== undefined && tilesById.get(id)?.container;
    if(!container?.isConnected) {
      return;
    }

    // * how far past the strip's visible end the tile starts, along the line: leftward in RTL
    const tile = container.getBoundingClientRect();
    const strip = scrollable.container.getBoundingClientRect();
    const ahead = isDocumentRTL() ? strip.left - tile.right : tile.left - strip.right;
    if(ahead < strip.width) {
      props.onLoadMore?.();
    }
  };

  let revealed = false;
  const syncTiles = async(list: ChatThemesPickerItem[]) => {
    // The tiles' emoticons come out of the animated-emoji set, which the stickers manager only
    // fetches a second after start-up. Wrapping one before then throws "no sticker" and leaves the
    // slot permanently blank — there is no retry — so wait for the set first. It is cached, so this
    // is free on every build after the first. Hit by the empty-column tip cards, which mount as
    // soon as the IM page does.
    await managers.appStickersManager.getAnimatedEmojiStickerSet().catch(noop);
    if(!middleware()) return;

    await Promise.all(list.filter((item) => !tilesById.has(item.id)).map(buildTile));
    if(!middleware()) return;

    // * slot the new tiles in place, leaving the built ones where they are so the strip keeps its scroll
    const parent = scrollable.container;
    const ids = new Set(list.map((item) => item.id));
    tilesById.forEach((themeItem, id) => {
      if(!ids.has(id)) {
        disposeTile(themeItem);
      }
    });

    let previous: Element;
    for(const item of list) {
      const {container} = tilesById.get(item.id);
      const next = previous ? previous.nextElementSibling : parent.firstElementChild;
      if(next !== container) {
        parent.insertBefore(container, next);
      }

      previous = container;
    }

    if(!revealed) {
      revealed = true;
      // Reveal in the next frame so the appended DOM has settled (layout +
      // background-item paints are flushed) before the opacity transition runs.
      if(!props.shownWhenReady) requestAnimationFrame(() => {
        scrollable.container.style.opacity = '1';
      });

      props.onReady?.();
    }

    checkLoadMore();
  };

  // * one sync at a time, in order: one gone wrong does not stop the ones after it
  const syncs = createSerializedQueue();
  createEffect(on(items, (list) => {
    if(list) {
      syncs.enqueue(() => syncTiles(list)).catch(noop);
    }
  }));

  if(props.onLoadMore) {
    scrollable.onAdditionalScroll = checkLoadMore;
    scrollable.setListeners();
  }

  // Reactively re-stripe `.active` when the external selectedId changes.
  createEffect(() => {
    const id = props.selectedId();
    themesMap.forEach((themeItem) => setActive(themeItem.container, themeItem.item.id === id));
  });

  // Reactively re-paint thumbnails when the base theme changes (e.g. user
  // toggles night-mode inside the popup without touching the global theme).
  createEffect(on(
    getBaseTheme,
    () => {
      themesMap.forEach((themeItem) => applyThemeOnItem(themeItem));
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

    const themeItem = themesMap.get(container);
    if(!themeItem) return;

    props.onSelect(themeItem.item.theme, themeItem.item);
    lastOnFrameNo?.(-1);

    const {player} = themeItem;
    if(!player || !liteMode.isAvailable('motion')) return;

    if(IS_SAFARI) {
      if(player.paused) player.restart();
      return;
    }

    if(player.paused) player.stop(true);
    player.el[0].style.transform = 'scale(2)';

    const onFrameNo = lastOnFrameNo = (frameNo) => {
      if(player.maxFrame === frameNo || frameNo === -1) {
        player.el[0].style.transform = '';
        player.removeEventListener('enterFrame', onFrameNo);
        if(lastOnFrameNo === onFrameNo) lastOnFrameNo = undefined;
      }
    };

    setTimeout(() => {
      if(lastOnFrameNo !== onFrameNo) return;
      player.play();
      player.addEventListener('enterFrame', onFrameNo);
    }, 250);
  }, {listenerSetter});

  onCleanup(() => {
    scrollable.removeListeners();
    detachPickerGrid();
    listenerSetter.removeAll();
    tilesById.forEach(disposeTile);
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
