import type {AppTheme, AppThemeSettings} from '@config/state';
import type {AccentPreset} from '@config/themePresets';
import type {BaseTheme, Theme, ThemeSettings} from '@layer';
import {blendWallpaperForTinted, presetThemeId, presetToThemeSettings} from '@config/themePresets';
import type {AppBackgroundTab} from '@components/sidebarLeft/tabs/background';
import type {AppChatBackground} from '@components/chat/bubbles/chatBackground';
import IS_TOUCH_SUPPORTED from '@environment/touchSupport';
import rootScope from '@lib/rootScope';
import {changeColorAccent, ColorRgb, getAccentColor, getAverageColor, getRgbColorFromTelegramColor, hexToRgb, hslaStringToHex, hslaStringToRgba, hslaToRgba, hsvToRgb, mixColors, rgbaToHexa, rgbaToHsla, rgbToHsv} from '@helpers/color';
import {SETTINGS_INIT} from '@config/state';
import {MOUNT_CLASS_TO} from '@config/debug';
import customProperties from '@helpers/dom/customProperties';
import {TelegramWebViewTheme} from '@types';
import windowSize from '@helpers/windowSize';
import liteMode from '@helpers/liteMode';
import {useAppSettings} from '@stores/appSettings';
import {joinDeepPath} from '@helpers/object/setDeepProperty';
import {logger} from '@lib/logger';
import pause from '@helpers/schedulers/pause';
import Transitions, {getTransition} from '@config/transitions';
import {dispatchHeavyAnimationEvent} from '@hooks/useHeavyAnimationCheck';
import noop from '@helpers/noop';

// Hard cap for the theme-switch view transition: how long heavy rendering (videos/stickers/
// lottie) stays paused, and the deadline after which a stalled transition is force-finished so
// the app can't stay frozen. Comfortably above the normal cost (≤500ms bg wait + ~600ms reveal).
const THEME_TRANSITION_TIMEOUT = 2000;

export type AppColorName = 'primary-color' | 'message-out-primary-color' |
  'surface-color' | 'danger-color' | 'primary-text-color' |
  'secondary-text-color' | 'message-out-background-color' |
  'saved-color' | 'message-background-color' | 'green-color' |
  'background-color' | 'body-background-color' | 'border-color' |
  'secondary-color' | 'link-color' | 'input-search-background-color';
type AppColor = {
  rgb?: boolean,
  light?: boolean,
  lightFilled?: boolean,
  dark?: boolean,
  darkRgb?: boolean,
  darkFilled?: boolean
};

const appColorMap: {[name in AppColorName]: AppColor} = {
  // 'background-color': {},
  'primary-color': {
    rgb: true,
    light: true,
    lightFilled: true,
    dark: true,
    darkRgb: true
  },
  'message-out-primary-color': {
    lightFilled: true,
    rgb: true
  },
  'surface-color': {
    rgb: true
  },
  'danger-color': {
    rgb: true,
    light: true,
    dark: true
  },
  'primary-text-color': {
    rgb: true
  },
  'secondary-text-color': {
    light: true,
    lightFilled: true,
    rgb: true
  },
  'message-background-color': {
    light: true,
    lightFilled: true,
    dark: true,
    darkFilled: true
  },
  'message-out-background-color': {
    light: true,
    lightFilled: true,
    dark: true,
    darkFilled: true,
    rgb: true
  },
  'saved-color': {
    lightFilled: true
  },
  'green-color': {
    rgb: true
  },
  'background-color': {
    rgb: true
  },
  'body-background-color': {
    rgb: true
  },
  'border-color': {},
  'secondary-color': {},
  'link-color': {},
  'input-search-background-color': {}
};

const colorMap: {
  [name in AppTheme['name']]?: {
    [name in AppColorName]?: string
  }
} = {
  day: {
    'primary-color': '#3390ec',
    'message-out-primary-color': '#5CA853',
    'message-background-color': '#ffffff',
    'surface-color': '#ffffff',
    'danger-color': '#df3f40',
    'primary-text-color': '#000000',
    'secondary-text-color': '#707579',
    'saved-color': '#359AD4',
    'green-color': '#70b768',
    // SCSS-side defaults migrated from base.scss :root
    'background-color': '#f4f4f5',
    'body-background-color': '#ffffff',
    'border-color': '#dfe1e5',
    'secondary-color': '#c4c9cc',
    'link-color': '#00488f',
    'input-search-background-color': '#ffffff'
  },
  night: {
    'primary-color': '#8774E1',
    'message-out-primary-color': '#8774E1',
    'message-background-color': '#212121',
    'surface-color': '#212121',
    'danger-color': '#ff595a',
    'primary-text-color': '#ffffff',
    'secondary-text-color': '#aaaaaa',
    'saved-color': '#8774E1',
    'green-color': '#5CC85E',
    // SCSS-side defaults migrated from base.scss .night
    'background-color': '#181818',
    'body-background-color': '#181818',
    'border-color': '#0f0f0f',
    'secondary-color': '#707579',
    'link-color': '#8774E1', // SCSS resolves to var(--primary-color)
    'input-search-background-color': '#181818'
  },
  tinted: {
    // base colors ported from Telegram-Android darkblue.attheme (Dark Blue / Tinted)
    // mapping: surface ← windowBackgroundWhite, message-bg ← chat_inBubble, primary-text ← windowBackgroundWhiteBlackText,
    // secondary-text ← windowBackgroundWhiteGrayText, green ← windowBackgroundWhiteGreenText2.
    // Accent #3685FA — Theme.java::loadDefaultThemes(): Dark Blue's "home" ThemeAccent ID 0
    // (sortAccents puts isHome first, isHome for Dark Blue = id 0; that accent is at array index 8 of Dark Blue's accentColor[]).
    'primary-color': '#3685FA',
    'message-out-primary-color': '#3685FA',
    'message-background-color': '#232E3B',
    'surface-color': '#1D2733',
    'danger-color': '#FF595A',
    'primary-text-color': '#FFFFFF',
    'secondary-text-color': '#7D8B99',
    'saved-color': '#3685FA',
    'green-color': '#61D36B',
    // background / body-bg ← windowBackgroundGray, border ← divider (alpha-stripped),
    // input-search-bg ← chat_messagePanelBackground, link ← windowBackgroundWhiteLinkText
    'background-color': '#151E27',
    'body-background-color': '#151E27',
    'border-color': '#0F151B',
    'secondary-color': '#7D8B99',
    'link-color': '#5EABE1',
    'input-search-background-color': '#212D3B'
  },
  light: {
    // base colors ported from Telegram-Android day.attheme (Android's "Day" / baseThemeDay)
    // Distinct from tweb's existing `day` theme (which maps to baseThemeClassic with green outgoing bubbles)
    // primary ← chat_outBubble (#2D7ED5 — signature Day blue, replaces day's green out-message).
    'primary-color': '#2D7ED5',
    'message-out-primary-color': '#2D7ED5',
    'message-background-color': '#F0F0F0', // chat_inBubble — light gray (vs day's pure white)
    'surface-color': '#FFFFFF',
    'danger-color': '#DF3F40',
    'primary-text-color': '#333333', // windowBackgroundWhiteBlackText
    'secondary-text-color': '#8C8E91', // windowBackgroundWhiteGrayText
    'saved-color': '#2D7ED5',
    'green-color': '#04AC35', // windowBackgroundWhiteGreenText2
    'background-color': '#F4F4F5',
    'body-background-color': '#FFFFFF',
    'border-color': '#DFE1E5',
    'secondary-color': '#C4C9CC',
    'link-color': '#238AE3', // windowBackgroundWhiteBlueText
    'input-search-background-color': '#FFFFFF'
  }
};

const themeNameToBaseTheme: {[name in Exclude<AppTheme['name'], 'system'>]: BaseTheme['_']} = {
  day: 'baseThemeClassic',
  night: 'baseThemeNight',
  light: 'baseThemeDay',
  tinted: 'baseThemeTinted'
};

const NIGHT_THEME_NAMES = new Set<AppTheme['name']>(['night', 'tinted']);

const log = logger('THEME');

export class ThemeController {
  private themeColor: string;
  private _themeColorElem: Element;
  private systemTheme: AppTheme['name'];
  private styleElement: HTMLStyleElement;
  public AppBackgroundTab: typeof AppBackgroundTab;
  // Injected by appImManager (avoids an import cycle, mirrors AppBackgroundTab). Used to await
  // the wallpaper re-render inside the theme-switch view transition so it's captured in sync.
  public appChatBackground: AppChatBackground;
  private applied: boolean;

  constructor() {
    rootScope.addEventListener('theme_change', (coordinates) => {
      this.setTheme(typeof(coordinates) === 'object' ? coordinates : undefined);
    });

    rootScope.addEventListener('theme_changed', () => {
      this.setWorkerThemeParams();
    });

    // Track the last variant the user explicitly picked on each "side" (dark vs light) so the
    // burger-menu Dark-Mode toggle can restore the user's last choice instead of always flipping
    // to the legacy night/day pair. Stored in `settings.lastThemeNames` for persistence; updated
    // here whenever `settings.theme` changes (radio in General Settings, switchTheme calls).
    const themeKey = joinDeepPath('settings', 'theme');
    rootScope.addEventListener('settings_updated', ({key, value}) => {
      if(key !== themeKey) return;
      const [, setAppSettings] = useAppSettings();
      if(value === 'night' || value === 'tinted') {
        setAppSettings('lastThemeNames', 'dark', value);
      } else if(value === 'day' || value === 'light') {
        setAppSettings('lastThemeNames', 'light', value);
      }
      // 'system' — don't update either side; burger-menu toggle still falls back to the
      // most recently picked dark/light variant from before.
    });
  }

  private setWorkerThemeParams() {
    rootScope.managers.apiManager.setThemeParams({
      _: 'dataJSON',
      data: JSON.stringify(this.getThemeParamsForWebView())
    });
  }

  private get themeColorElem() {
    if(this._themeColorElem !== undefined) {
      return this._themeColorElem;
    }

    return this._themeColorElem = document.head.querySelector('[name="theme-color"]') as Element || null;
  }

  public setThemeColor(color = this.themeColor) {
    if(!color) {
      const themeName = this.getResolvedThemeName();
      color = colorMap[themeName]?.['surface-color'] || (this.isNight() ? '#212121' : '#ffffff');
    }

    const themeColorElem = this.themeColorElem;
    if(themeColorElem) {
      themeColorElem.setAttribute('content', color);
    }
  }

  public setThemeListener() {
    try {
      const darkModeMediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      const checkDarkMode = () => {
        // const theme = this.getTheme();
        this.systemTheme = darkModeMediaQuery.matches ? 'night' : 'day';
        // const newTheme = this.getTheme();

        if(rootScope.myId) {
          rootScope.dispatchEvent('theme_change');
        } else {
          this.setTheme();
        }
      };

      if('addEventListener' in darkModeMediaQuery) {
        darkModeMediaQuery.addEventListener('change', checkDarkMode);
      } else if('addListener' in darkModeMediaQuery) {
        (darkModeMediaQuery as any).addListener(checkDarkMode);
      }

      checkDarkMode();
    } catch(err) {

    }
  }

  public applyHighlightingColor({
    hsla,
    element = document.documentElement
  }: {
    hsla?: string,
    element?: HTMLElement
  } = {}) {
    if(!hsla) {
      hsla = 'hsla(85.5319, 36.9171%, 40.402%, .4)';
      const theme = this.getTheme();
      const themeSettings = this.getThemeSettings(theme);
      if(themeSettings?.highlightingColor) {
        hsla = themeSettings.highlightingColor;
      }
    }

    const highlightingRgba = hslaStringToRgba(hsla);
    element.style.setProperty('--message-highlighting-color', hsla);
    element.style.setProperty('--message-highlighting-color-rgb', highlightingRgba.slice(0, 3).join(','));
    element.style.setProperty('--message-highlighting-alpha', '' + highlightingRgba[3] / 255);

    if(!IS_TOUCH_SUPPORTED && hsla) {
      this.themeColor = hslaStringToHex(hsla);
    }
  }

  public _setTheme(silent?: boolean) {
    const _log = log.bindPrefix('setTheme');
    _log(`set colors, silent=${silent}`);
    const isNight = this.isNight();
    const colorScheme = document.head.querySelector('[name="color-scheme"]');
    colorScheme?.setAttribute('content', isNight ? 'dark' : 'light');

    document.documentElement.classList.toggle('night', isNight);
    this.setThemeColor();
    const theme = this.getTheme();
    this.applyTheme(theme);

    let style = this.styleElement;
    if(!style) {
      style = this.styleElement = document.createElement('style');
      document.head.append(style);
    }

    const e = document.createElement('div');
    // Mirror the active theme into .night when current is already dark (night/tinted) so menus
    // that opt into `.night` match the active palette instead of the static 'night' base.
    this.applyTheme(isNight ? theme : this.getTheme('night'), e, true);
    style.textContent = `.night {${e.style.cssText}}`;

    this.applyHighlightingColor();
    !silent && rootScope.dispatchEventSingle('theme_changed');
    _log('end');
  }

  public setTheme(coordinates?: {x: number, y: number}) {
    const _log = log.bindPrefix('setTheme');
    const fast = !('startViewTransition' in document) || !this.applied;
    const animationsAvailable = liteMode.isAvailable('animations');
    _log(`start, fast=${fast}, coordinates=${JSON.stringify(coordinates)}, animations=${animationsAvailable}`);

    if(fast) {
      const silent = !this.applied;
      const wasApplied = this.applied;
      this.applied = true;

      this._setTheme(silent);
      if(!wasApplied) {
        this.setWorkerThemeParams();
      }

      return;
    }

    if(!animationsAvailable) {
      coordinates = undefined;
    }

    const reverse = !this.isNight();
    if(coordinates) {
      document.documentElement.classList.add('no-view-transition');
      document.documentElement.classList.toggle('reverse', reverse);
      void document.documentElement.offsetLeft; // reflow
    }

    const transition = document.startViewTransition(async() => {
      _log('view transition started');
      this._setTheme();
      // `_setTheme` dispatched 'theme_changed', whose listeners re-render the chat wallpaper
      // asynchronously (image decode) and `instant`. Wait for that to land BEFORE the view
      // transition snapshots the new state, so the new wallpaper is captured and revealed
      // together with the new colors. Without this a slow wallpaper — notably a static image —
      // swaps in AFTER the circular reveal, visibly desynced. Capped so a slow/uncached image
      // can't freeze the whole theme switch (it just falls back to the old pop-in for that case).
      const bg = this.appChatBackground;
      if(bg) await Promise.race([bg.getReadyPromise(), pause(500)]);
    });

    // Pause heavy rendering (videos, stickers, lottie) while the reveal plays so it stays
    // smooth; the timeout guarantees rendering resumes even if the transition never settles.
    // `.catch(noop)` so a rejected `finished` (thrown callback) can't deadlock the heavy-anim
    // race before the timeout — it would otherwise leave rendering paused forever.
    dispatchHeavyAnimationEvent(transition.finished.catch(noop), THEME_TRANSITION_TIMEOUT);

    // Safety net for a hard freeze: the View Transitions API can occasionally get stuck (a
    // stalled update callback, an overlapping transition, a browser hiccup), leaving the page
    // locked on the frozen snapshot. Force-finish it after the same cap so the app always
    // recovers — `skipTransition()` is a no-op once the transition has already settled.
    const safetyTimeout = setTimeout(() => {
      _log('view transition safety timeout — forcing skip');
      transition.skipTransition?.();
    }, THEME_TRANSITION_TIMEOUT);
    transition.finished.catch(noop).then(() => clearTimeout(safetyTimeout));

    if(!coordinates) {
      _log('view transition is not needed');
      return;
    }

    const {x, y} = coordinates;
    // Get the distance to the furthest corner
    const endRadius = Math.hypot(
      Math.max(x, windowSize.width - x),
      Math.max(y, windowSize.height - y)
    );

    transition.ready.then(() => {
      _log('view transition ready');

      const {easing, duration, keyframes} = getTransition(
        'standard',
        !reverse,
        [
          {clipPath: `circle(0 at ${x}px ${y}px)`},
          {clipPath: `circle(${endRadius}px at ${x}px ${y}px)`}
        ]
      );

      document.documentElement.animate(keyframes, {
        duration: duration * 2,
        easing,
        pseudoElement: `::view-transition-${reverse ? 'old' : 'new'}(root)`,
        fill: 'forwards' // * without this rule animation will flick at the end
      });
    }).catch(noop); // `ready` rejects when the transition is skipped (safety timeout / overlap / hidden tab)

    transition.finished.catch(noop).finally(() => {
      _log('view transition end');
      document.documentElement.classList.remove('no-view-transition', 'reverse');
    });
  }

  public async switchTheme(
    name?: AppTheme['name'],
    coordinates?: {x: number, y: number}
  ) {
    const [appSettings, setAppSettings] = useAppSettings();
    if(name === undefined) {
      // Burger-menu Dark-Mode toggle. Resolve to the user's last explicitly-picked variant on the
      // opposite side so e.g. tinted → classic instead of tinted → day, and back tinted again
      // instead of falling to night. Defensive: appSettings.lastThemeNames can be missing during
      // early bootstrap; fall back to the legacy night/day pair in that case.
      const last = appSettings.lastThemeNames;
      name = this.isNight() ?
        (last?.light ?? 'day') :
        (last?.dark ?? 'night');
    }
    await setAppSettings('theme', name);
    rootScope.dispatchEvent('theme_change', coordinates);
  }

  public isNight() {
    return this.isNightThemeName(this.getTheme()?.name);
  }

  public isNightThemeName(name: AppTheme['name']) {
    return NIGHT_THEME_NAMES.has(name);
  }

  public getResolvedThemeName(): AppTheme['name'] {
    const [appSettings] = useAppSettings();
    const setting = appSettings.theme;
    return setting === 'system' ? this.systemTheme : setting;
  }

  public getTheme(name: AppTheme['name'] = this.getResolvedThemeName()) {
    const [appSettings] = useAppSettings();
    return appSettings.themes.find((t) => t.name === name) ??
      SETTINGS_INIT.themes.find((t) => t.name === name);
  }

  private getThemeName(theme: Theme | AppTheme): AppTheme['name'] {
    const appTheme = theme as AppTheme;
    if(appTheme?.name && appTheme.name !== 'system') return appTheme.name;
    return this.getResolvedThemeName();
  }

  public getBaseThemeForName(name: AppTheme['name']): BaseTheme['_'] {
    return themeNameToBaseTheme[name as Exclude<AppTheme['name'], 'system'>] ??
      (this.isNightThemeName(name) ? 'baseThemeNight' : 'baseThemeClassic');
  }

  // theme applier
  private bindColorApplier(
    options: Pick<Parameters<ThemeController['applyAppColor']>[0], 'element' | 'isNight' | 'themeName' | 'saveToCache'>,
    // Effective surface for this theme apply pass. When themeName === 'tinted', `applyTheme`
    // pre-computes the iOS-derived surface and forwards it here so every light-filled-* mix uses
    // the same surface that --surface-color ends up with — otherwise mixColor falls back to the
    // *static* `colorMap[name]['surface-color']` and produces visibly off shades for things like
    // --light-filled-secondary-text-color, where the iOS-derived surface differs from the baseline.
    defaultMixColor?: ColorRgb
  ) {
    const appliedColors: Set<AppColorName> = new Set();
    const fallbackName: AppTheme['name'] = options.themeName ?? (options.isNight ? 'night' : 'day');
    return {
      applyAppColor: (_options: Omit<Parameters<ThemeController['applyAppColor']>[0], keyof typeof options>) => {
        appliedColors.add(_options.name);
        return this.applyAppColor({mixColor: defaultMixColor, ..._options, ...options});
      },
      finalize: () => {
        for(const name in appColorMap) {
          if(!appliedColors.has(name as AppColorName)) {
            this.applyAppColor({
              name: name as AppColorName,
              hex: colorMap[fallbackName][name as AppColorName],
              mixColor: defaultMixColor,
              ...options
            });
          }
        }
      }
    };
  };

  public applyAppColor({
    name,
    hex,
    element,
    lightenAlpha = 0.08,
    darkenAlpha = lightenAlpha,
    mixColor,
    isNight = this.isNight(),
    themeName,
    saveToCache
  }: {
    name: AppColorName,
    hex: string,
    element: HTMLElement,
    lightenAlpha?: number
    darkenAlpha?: number,
    mixColor?: ColorRgb,
    isNight?: boolean,
    themeName?: AppTheme['name'],
    saveToCache?: boolean
  }) {
    const appColor = appColorMap[name];
    const rgb = hexToRgb(hex);
    const hsla = rgbaToHsla(...rgb);

    const resolvedName: AppTheme['name'] = themeName ?? (isNight ? 'night' : 'day');
    mixColor ??= hexToRgb(colorMap[resolvedName]['surface-color']);
    const lightenedRgb = mixColors(rgb, mixColor, lightenAlpha);

    const darkenedHsla: typeof hsla = {
      ...hsla,
      l: hsla.l - darkenAlpha * 100
    };

    const properties: [string, string][] = [
      [name, hex],
      appColor.rgb && [name + '-rgb', rgb.join(',')],
      appColor.light && ['light-' + name, `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${lightenAlpha})`],
      appColor.lightFilled && ['light-filled-' + name, rgbaToHexa(lightenedRgb)],
      appColor.dark && ['dark-' + name, `hsl(${darkenedHsla.h}, ${darkenedHsla.s}%, ${darkenedHsla.l}%)`]
      // appColor.darkFilled && ['dark-' + name, `hsl(${darkenedHsla.h}, ${darkenedHsla.s}%, ${darkenedHsla.l}%)`]
    ];

    saveToCache ??= element === document.documentElement;
    properties.filter(Boolean).forEach(([name, value]) => {
      element.style.setProperty('--' + name, value);

      if(saveToCache) {
        customProperties.setPropertyCache(name as AppColorName, value, isNight);
      }
    });
  }

  // Apply one of the iOS-style accent presets (see src/config/themePresets.ts).
  // Builds a synthetic Theme that wraps the preset for the current base, then routes
  // through applyNewTheme so the multi-base settings array, tinted blending, and
  // background-document download all reuse the cloud-theme codepath.
  public applyAccentPreset(preset: AccentPreset) {
    const currentTheme = this.getTheme();
    const baseTheme = this.getBaseThemeForName(currentTheme.name);
    const settings = presetToThemeSettings(preset, baseTheme);
    // iOS dayColorPresets have `wallpaper: nil` — those presets only swap accent + bubbles
    // and keep the current wallpaper. Mirror that here: setBackgroundDocument requires a
    // WallPaper, so fall back to the current AppTheme's wallpaper when the preset omits one.
    if(!settings.wallpaper) {
      settings.wallpaper = this.getThemeSettings(currentTheme)?.wallpaper;
    }
    const synthetic: Theme = {
      _: 'theme',
      id: presetThemeId(preset),
      access_hash: '',
      slug: '',
      title: '',
      pFlags: {},
      settings: [settings]
    };
    return this.applyNewTheme(synthetic);
  }

  // Reset the active AppTheme to its factory defaults (the entry from SETTINGS_INIT).
  // Used as the "no preset" choice in the accent picker — gets the user back to the
  // bundled day/night/light/tinted look without nuking unrelated state.
  public resetActiveTheme() {
    const currentTheme = this.getTheme();
    const defaultTheme = SETTINGS_INIT.themes.find((t) => t.name === currentTheme.name);
    if(!defaultTheme) return Promise.resolve();
    return this.applyNewTheme({...defaultTheme, settings: defaultTheme.settings});
  }

  public async applyNewTheme(theme: Theme) {
    const currentTheme = this.getTheme();
    const themeName = currentTheme.name;
    const isNight = this.isNightThemeName(themeName);
    const baseTheme = this.getBaseThemeForName(themeName);
    const [appSettings] = useAppSettings();
    const themes = appSettings.themes.slice();
    const themeSettings = theme.settings.find((s) => s.base_theme._ === baseTheme) ??
      theme.settings.find((s) => s.base_theme._ === (isNight ? 'baseThemeNight' : 'baseThemeClassic'));
    // Wallpaper handling on tinted (Dark Blue):
    // - Curated sources (factory reset DEFAULT_THEME, accent-color picker presets) ship pre-dark
    //   gradients designed for the tinted palette — pass through verbatim.
    // - Any other source (cloud themes picked from the carousel, in particular) is blended with
    //   the default tinted gradient + accent hint so the chat reads as Dark Blue regardless of the
    //   cloud theme's wallpaper colors. Even cloud themes that ship a baseThemeTinted entry get
    //   blended — Telegram's official tinted entries are still designed for native pattern
    //   rendering, which tweb's overlay-render branch doesn't dim aggressively enough.
    //   Strictly not iOS data behavior (iOS uses `forcedWallpaper` verbatim and relies on
    //   MotionBackgroundDrawable to darken), but matches the perceived iOS visual on tweb.
    // Curated sources are recognised by their synthetic id: empty (factory reset) or 'preset:*'
    // (accent preset). Server cloud themes carry numeric/hash ids.
    const themeId = String(theme.id ?? '');
    const isCurated = themeId === '' || themeId.startsWith('preset:');
    let effectiveWallpaper = themeSettings.wallpaper;
    if(themeName === 'tinted' && !isCurated && effectiveWallpaper) {
      effectiveWallpaper = blendWallpaperForTinted(effectiveWallpaper, themeSettings.accent_color);
    }

    // Preserve every base entry from the cloud theme (mirrors iOS' `[TelegramThemeSettings]`).
    // Only the entry matching the current base gets the (optionally tinted-blended) wallpaper.
    // The matching entry is the same object that setBackgroundDocument will mutate to fill in
    // `highlightingColor` once the wallpaper's average color is computed.
    const newSettings: AppTheme['settings'] = theme.settings.map((s) => ({
      ...s,
      wallpaper: s.base_theme._ === themeSettings.base_theme._ ? effectiveWallpaper : s.wallpaper,
      highlightingColor: ''
    }));
    const targetSettings = newSettings.find((s) => s.base_theme._ === themeSettings.base_theme._);

    const newAppTheme: AppTheme = {
      ...theme,
      name: themeName,
      settings: newSettings
    };

    await this.AppBackgroundTab.setBackgroundDocument(effectiveWallpaper, targetSettings);
    let idx = themes.indexOf(currentTheme);
    if(idx < 0) idx = themes.findIndex((t) => t.name === themeName);
    if(idx < 0) {
      themes.push(newAppTheme);
    } else {
      themes[idx] = newAppTheme;
    }
    const [, setAppSettings] = useAppSettings();
    await setAppSettings('themes', themes);
    // Don't dispatch 'theme_change' here. setBackgroundDocument's onReady chain already invokes
    // appImManager.applyCurrentTheme(), which calls themeController.setTheme() — the very thing
    // the 'theme_change' listener would re-trigger. Re-dispatching ran setTheme() (and therefore
    // a full view-transition snapshot) twice per accent-preset / cloud-theme apply, which on tweb
    // surfaced as a multi-second hang on click. The post-event 'theme_changed' is fired inside
    // _setTheme() so all subscribers (worker theme params, tab pickers, etc.) still get notified.
  }

  private isNightTheme(theme: Theme | AppTheme) {
    return this.isNightThemeName(this.getThemeName(theme));
  }

  public getThemeSettings(theme: AppTheme, isNight?: boolean): AppThemeSettings;
  public getThemeSettings(theme: Theme, isNight?: boolean): ThemeSettings;
  public getThemeSettings(theme: Theme | AppTheme, isNight?: boolean): ThemeSettings | AppThemeSettings;
  public getThemeSettings(theme: Theme | AppTheme, isNight?: boolean): ThemeSettings | AppThemeSettings {
    if(!theme?.settings) return undefined;
    // Legacy state may have stored a single ThemeSettings object instead of an array;
    // pass it through unchanged so reads keep working until the next save migrates it.
    if(!Array.isArray(theme.settings)) return theme.settings as any;
    const themeName = this.getThemeName(theme);
    const baseTheme = this.getBaseThemeForName(themeName);
    return theme.settings.find((s) => s.base_theme._ === baseTheme) ??
      theme.settings.find((s) => s.base_theme._ === ((isNight ?? this.isNightThemeName(themeName)) ? 'baseThemeNight' : 'baseThemeClassic'));
  }

  // Persist a wallpaper pick (Chat Wallpaper tab grid click / upload) onto the *current*
  // AppTheme's matching base-theme settings entry. Must go through the appSettings store
  // setter: the object returned by getThemeSettings() is a readonly Solid store node, so a
  // direct `themeSettings.wallpaper = ...` assignment is silently dropped ("Cannot mutate a
  // Store directly") — which is why tab picks weren't applying. Mirrors applyNewTheme's
  // persistence (slice themes, rebuild the entry as plain objects, setAppSettings('themes')).
  // Updates the store synchronously, so a getThemeSettings() read right after sees the pick.
  public setWallpaperForCurrentTheme(wallpaper: AppThemeSettings['wallpaper'], highlightingColor: string) {
    const theme = this.getTheme();
    const [appSettings, setAppSettings] = useAppSettings();
    const themes = appSettings.themes.slice();
    let idx = themes.indexOf(theme);
    if(idx < 0) idx = themes.findIndex((t) => t.name === theme.name);
    if(idx < 0) return Promise.resolve();

    const t = themes[idx];
    let settings: AppTheme['settings'];
    if(Array.isArray(t.settings)) {
      const themeName = this.getThemeName(t);
      const baseTheme = this.getBaseThemeForName(themeName);
      let sIdx = t.settings.findIndex((s) => s.base_theme._ === baseTheme);
      if(sIdx < 0) sIdx = t.settings.findIndex((s) => s.base_theme._ === (this.isNightThemeName(themeName) ? 'baseThemeNight' : 'baseThemeClassic'));
      if(sIdx < 0) sIdx = 0;
      settings = t.settings.map((s, i) => i === sIdx ? {...s, wallpaper, highlightingColor} : s);
    } else {
      // Legacy single-object settings: keep the single-object shape (getThemeSettings reads it
      // directly via `as any` — line ~656 — and would mismatch if migrated to an array).
      settings = {...(t.settings as any), wallpaper, highlightingColor} as any;
    }
    themes[idx] = {...t, settings};
    return setAppSettings('themes', themes);
  }

  public applyTheme(theme: Theme | AppTheme, element = document.documentElement, saveToCache?: boolean) {
    const themeName = this.getThemeName(theme);
    const isNight = this.isNightThemeName(themeName);
    const themeSettings = this.getThemeSettings(theme, isNight);
    const baseColors = colorMap[themeName] || colorMap[isNight ? 'night' : 'day'];

    let hsvTemp1 = rgbToHsv(...hexToRgb(baseColors['primary-color'])); // primary base
    let hsvTemp2 = rgbToHsv(...getRgbColorFromTelegramColor(themeSettings.accent_color)); // new primary

    // For 'tinted' (Dark Blue / iOS nightAccent) the surface palette is *fully* derived from the
    // accent via iOS `UIColor.withMultiplied(hue:, saturation:, brightness:)` — see
    // submodules/TelegramPresentationData/Sources/DefaultDarkTintedPresentationTheme.swift, lines
    // 94–114 (customizeDefaultDarkTintedPresentationTheme). Each multiplier is reproduced verbatim.
    // Computed up front because the resulting surface is also used as the `defaultMixColor` for
    // every light-filled-* mix below (so e.g. --light-filled-secondary-text-color blends against
    // the iOS-derived navy, not the static colorMap entry).
    let tintedSurfaceRgb: ColorRgb | undefined;
    let tintedAccentRgb: ColorRgb | undefined;
    let mainBackgroundColor: string | undefined;
    let additionalBackgroundColor: string | undefined;
    let inputBackgroundColor: string | undefined;
    let mainSeparatorColor: string | undefined;
    let mainSecondaryColor: string | undefined;
    let mainSecondaryTextColor: string | undefined;
    if(themeName === 'tinted') {
      // iOS reassigns the accent before deriving surfaces (line 94-96):
      //   let hsb = initialAccentColor.hsb
      //   accentColor = UIColor(hue: hsb.0, saturation: hsb.1, brightness: max(hsb.2, 0.18))
      // i.e. the *raw* user-picked accent with its brightness clamped to ≥0.18 so very dark
      // accents don't collapse the whole palette to black. We don't pipe through tweb's
      // `changeColorAccent` here — that's a tweb-only adapter for the global --primary-color and
      // would leave surfaces drifting away from the iOS-derived values.
      const rawAccentRgb = getRgbColorFromTelegramColor(themeSettings.accent_color);
      const accHsv = rgbToHsv(...rawAccentRgb);
      const clampedV = Math.max(accHsv[2], 0.18);
      tintedAccentRgb = hsvToRgb(accHsv[0], accHsv[1], clampedV);
      const withMul = (h: number, s: number, b: number) => rgbaToHexa(hsvToRgb(
        (accHsv[0] * h) % 360,
        Math.min(1, accHsv[1] * s),
        Math.min(1, clampedV * b)
      ));
      mainBackgroundColor       = withMul(1.024, 0.585, 0.25);
      additionalBackgroundColor = withMul(1.024, 0.573, 0.18);
      inputBackgroundColor      = withMul(1.02,  0.609, 0.15);
      mainSeparatorColor        = withMul(1.033, 0.426, 0.34);
      mainSecondaryColor        = withMul(1.019, 0.109, 0.59);
      mainSecondaryTextColor    = withMul(0.956, 0.17,  1.0);
      tintedSurfaceRgb          = hexToRgb(mainBackgroundColor);
    }

    // For tinted use the iOS-style accent (raw, brightness-clamped) for --primary-color directly —
    // bypasses tweb's `changeColorAccent` HSV adapter, which would shift e.g. cyan #00c2ed into
    // #00b2da. iOS `customizePresentationTheme` for nightAccent uses the clamped accent verbatim.
    const newAccentRgb = tintedAccentRgb ?? changeColorAccent(
      hsvTemp1,
      hsvTemp2,
      hexToRgb(baseColors['primary-color']),
      !isNight
    );
    const newAccentHex = rgbaToHexa(newAccentRgb);

    // Default mixColor for every light-filled-* in this pass. For tinted use the iOS-derived
    // surface so panels, secondary text, primary buttons all share a consistent fill.
    const defaultMixColor = tintedSurfaceRgb;
    const {applyAppColor, finalize} = this.bindColorApplier({element, isNight, themeName, saveToCache}, defaultMixColor);

    applyAppColor({
      name: 'primary-color',
      hex: newAccentHex,
      darkenAlpha: 0.04
    });

    applyAppColor({
      name: 'saved-color',
      hex: newAccentHex,
      lightenAlpha: 0.64,
      mixColor: [255, 255, 255]
    });

    if(themeName === 'tinted') {
      // iOS → tweb CSS var mapping. mainBackgroundColor is the chat-list/settings panel surface;
      // additionalBackgroundColor is the page/list backdrop; inputBackgroundColor is the search
      // input chrome. mainBackgroundColor doubles for the incoming-bubble fill (matches iOS
      // chat.message.incoming.bubble.fill which uses the same derived background color).
      applyAppColor({name: 'surface-color', hex: mainBackgroundColor!});
      applyAppColor({name: 'background-color', hex: additionalBackgroundColor!});
      applyAppColor({name: 'body-background-color', hex: additionalBackgroundColor!});
      applyAppColor({name: 'message-background-color', hex: mainBackgroundColor!});
      applyAppColor({name: 'input-search-background-color', hex: inputBackgroundColor!});
      applyAppColor({name: 'border-color', hex: mainSeparatorColor!});
      applyAppColor({name: 'secondary-color', hex: mainSecondaryColor!});
      applyAppColor({name: 'secondary-text-color', hex: mainSecondaryTextColor!});
    }

    if(!themeSettings.message_colors?.length) {
      return;
    }

    const messageLightenAlpha = isNight ? 1 : 0.12;
    const baseMessageColor = hexToRgb(baseColors['message-out-primary-color']);
    hsvTemp1 = rgbToHsv(...baseMessageColor);
    // Use the iOS-derived surface for tinted so message-out-background-color and downstream
    // computations sit on the same surface as the chat panels.
    const surfaceForMessage = tintedSurfaceRgb ?? hexToRgb(baseColors['surface-color']);
    const baseMessageOutBackgroundColor = mixColors(baseMessageColor, surfaceForMessage, messageLightenAlpha);

    const firstColor = getRgbColorFromTelegramColor(themeSettings.message_colors[0]);

    let myMessagesAccent = firstColor;
    if(themeSettings.message_colors.length > 1) {
      // const w = getAccentColor(hsvTemp1, baseMessageOutBackgroundColor, myMessagesAccent);

      themeSettings.message_colors.slice(1).forEach((nextColor) => {
        myMessagesAccent = getAverageColor(myMessagesAccent, getRgbColorFromTelegramColor(nextColor));
      });

      myMessagesAccent = getAccentColor(hsvTemp1, baseMessageOutBackgroundColor, myMessagesAccent);

      // console.log('www', rgbaToHexa(w), rgbaToHexa(myMessagesAccent));
    }

    const o = myMessagesAccent;
    hsvTemp2 = rgbToHsv(...o);

    // const c = changeColorAccent(
    //   hsvTemp1,
    //   hsvTemp2,
    //   baseMessageOutBackgroundColor
    // );

    // console.log(o, c, rgbaToHexa(o), rgbaToHexa(c));

    const accentColor2 = themeSettings.outbox_accent_color !== undefined && rgbToHsv(...getRgbColorFromTelegramColor(themeSettings.outbox_accent_color));

    let newMessageOutBackgroundColor = mixColors(myMessagesAccent, surfaceForMessage, messageLightenAlpha);

    if(!isNight/*  || true */) {
      const messageOutBackgroundColorHsl = rgbaToHsla(...newMessageOutBackgroundColor);
      messageOutBackgroundColorHsl.s = Math.min(messageOutBackgroundColorHsl.s + (isNight ? 8 : 63), 100);
      newMessageOutBackgroundColor = hslaToRgba(messageOutBackgroundColorHsl.h, messageOutBackgroundColorHsl.s, messageOutBackgroundColorHsl.l, messageOutBackgroundColorHsl.a).slice(0, 3) as ColorRgb;
    }

    applyAppColor({
      name: 'message-out-background-color',
      hex: rgbaToHexa(newMessageOutBackgroundColor),
      lightenAlpha: messageLightenAlpha
    });

    applyAppColor({
      name: 'message-out-primary-color',
      hex: isNight ? '#ffffff' : rgbaToHexa(accentColor2 ? hsvToRgb(...accentColor2) : myMessagesAccent),
      mixColor: newMessageOutBackgroundColor
    });

    // if(accentColor2) {
    //   console.log(rgbaToHexa(myMessagesAccent), rgbaToHexa(hsvToRgb(...accentColor2)));
    // }

    finalize();
  }

  public getThemeParamsForWebView() {
    const themePropertiesMap: {[key in keyof TelegramWebViewTheme]: string} = {
      bg_color: 'surface-color',
      button_color: 'primary-color',
      button_text_color: '#ffffff',
      hint_color: 'secondary-text-color',
      link_color: 'link-color',
      secondary_bg_color: 'background-color',
      text_color: 'primary-text-color',
      header_bg_color: 'surface-color',
      accent_text_color: 'primary-color',
      section_bg_color: 'surface-color',
      section_header_text_color: 'primary-color',
      subtitle_text_color: 'secondary-text-color',
      destructive_text_color: 'danger-color'
    };

    const themeParams: TelegramWebViewTheme = {} as any;
    for(const key in themePropertiesMap) {
      const value = themePropertiesMap[key as keyof TelegramWebViewTheme];
      themeParams[key as keyof TelegramWebViewTheme] = value[0] === '#' ? value : customProperties.getProperty(value as AppColorName);
    }

    return themeParams;
  }
}

const themeController = new ThemeController();
MOUNT_CLASS_TO && (MOUNT_CLASS_TO.themeController = themeController);
export default themeController;
