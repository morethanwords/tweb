/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {createEffect, createResource, createSignal, For, on, onCleanup, onMount, Show} from 'solid-js';
import {GrowHeightReveal} from '@helpers/solid/animations';
import Section from '@components/section';
import Row from '@components/rowTsx';
import RangeSettingSelector from '@components/rangeSettingSelector';
import Button from '@components/buttonTsx';
import RadioField from '@components/radioField';
import {i18n, LangPackKey} from '@lib/langPack';
import I18n from '@lib/langPack';
import rootScope from '@lib/rootScope';
import {useAppSettings} from '@stores/appSettings';
import {useSuperTab} from '@components/solidJsTabs/superTabProvider';
import {subscribeOn} from '@helpers/solid/subscribeOn';
import IS_GEOLOCATION_SUPPORTED from '@environment/geolocationSupport';
import {DEFAULT_THEME, StateSettings} from '@config/state';
import {AccentPreset, blendWallpaperForTinted, getAccentPresetsForBase, presetThemeId} from '@config/themePresets';
import {BaseTheme, Theme} from '@layer';
import {IS_SAFARI} from '@environment/userAgent';
import {ScrollableX} from '@components/scrollable';
import Scrollable from '@components/scrollable2';
import wrapStickerEmoji from '@components/wrappers/stickerEmoji';
import findUpClassName from '@helpers/dom/findUpClassName';
import RLottiePlayer from '@lib/rlottie/rlottiePlayer';
import themeController from '@helpers/themeController';
import liteMode from '@helpers/liteMode';
import {joinDeepPath} from '@helpers/object/setDeepProperty';
import eachMinute from '@helpers/eachMinute';
import {AppBackgroundTab} from '@components/sidebarLeft/tabs/background';
import {AppChatBackgroundTab} from '@components/solidJsTabs/tabs';
import AppPowerSavingTab from '@components/sidebarLeft/tabs/powerSaving';
import {attachClickEvent} from '@helpers/dom/clickEvent';
import ListenerSetter from '@helpers/listenerSetter';
import createMiddleware from '@helpers/solid/createMiddleware';
import fastSmoothScroll from '@helpers/fastSmoothScroll';

// ─────────────────────────────────────────────────────────────────────────────
// Section 1 — text size, chat background, animations toggle, lite mode entry
// ─────────────────────────────────────────────────────────────────────────────

const SettingsSection = () => {
  const [tab] = useSuperTab();
  const [appSettings, setAppSettings] = useAppSettings();

  const liteModeStatus = (): LangPackKey =>
    appSettings.liteMode.all ? 'Checkbox.Enabled' : 'Checkbox.Disabled';

  const liteModeStatusEl = new I18n.IntlElement();

  const onUpdate = () => {
    liteModeStatusEl.compareAndUpdate({key: liteModeStatus()});
  };

  onMount(onUpdate);
  subscribeOn(rootScope)('settings_updated', onUpdate);

  return (
    <Section name="Settings">
      <RangeSettingSelector
        textLeft={i18n('TextSize')}
        textRight={(value) => '' + value}
        step={1}
        value={appSettings.messagesTextSize}
        minValue={12}
        maxValue={20}
        onChange={(value) => setAppSettings('messagesTextSize', value)}
      />
      <Button
        class="btn-primary btn-transparent"
        icon="image"
        text="ChatBackground"
        onClick={() => {
          tab.slider.createTab(AppChatBackgroundTab).open();
        }}
      />
      {/* <Row
        clickable={() => {
          if(liteMode.isEnabled()) {
            toastNew({langPackKey: 'LiteMode.DisableAlert'});
          }
        }}
        disabled={liteMode.isEnabled()}
      >
        <Row.CheckboxField>
          <CheckboxFieldTsx
            checked={!appSettings.liteMode.animations}
            onChange={(value) => setAppSettings('liteMode', 'animations', !value)}
          />
        </Row.CheckboxField>
        <Row.Title>{i18n('EnableAnimations')}</Row.Title>
      </Row> */}
      <Row clickable={() => tab.slider.createTab(AppPowerSavingTab).open()}>
        <Row.Icon icon="animations" />
        <Row.Title titleRight={liteModeStatusEl.element} titleRightSecondary>
          {i18n('LiteMode.EnableText')}
        </Row.Title>
      </Row>
    </Section>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Section 2 — color theme picker (horizontal scroller + variant radios)
// ─────────────────────────────────────────────────────────────────────────────

type ThemeItem = {
  container: HTMLElement,
  theme: Theme,
  player?: RLottiePlayer,
  wallPaperContainers: {[key in BaseTheme['_']]?: HTMLElement}
};

const AVAILABLE_BASE_THEMES: Set<BaseTheme['_']> = new Set([
  'baseThemeClassic',
  'baseThemeNight',
  'baseThemeDay',
  'baseThemeTinted'
]);

const THEME_VARIANTS: [StateSettings['theme'], LangPackKey][] = [
  ['day', 'ThemeDay'],
  ['night', 'ThemeNight'],
  ['light', 'ThemeLight'],
  ['tinted', 'ThemeTinted'],
  ['system', 'AutoNightSystemDefault']
];

const ThemeSection = () => {
  const middleware = createMiddleware().get();
  const stateKey = joinDeepPath('settings', 'theme');

  const themesMap = new Map<HTMLElement, ThemeItem>();
  // Each theme thumbnail mounts a `<ChatBackground>` Solid root via AppBackgroundTab.addWallPaper.
  // Track the dispose handles so we tear them down (and their gradient/pattern renderers) on unmount.
  const solidRoots: (() => void)[] = [];
  let currentTheme = themeController.getTheme();
  let isNight = themeController.isNight();
  let currentThemeName = currentTheme.name;
  let lastOnFrameNo: ((frameNo: number) => void) | undefined;

  const getCurrentBaseTheme = (): BaseTheme['_'] => themeController.getBaseThemeForName(currentThemeName);

  const applyThemeOnItem = (item: ThemeItem) => {
    themeController.applyTheme(item.theme, item.container);

    const previous = item.container.querySelector('.background-item');
    previous?.remove();

    const baseTheme = getCurrentBaseTheme();
    const wallPaperContainer = item.wallPaperContainers[baseTheme] ??
      item.wallPaperContainers[isNight ? 'baseThemeNight' : 'baseThemeClassic'];
    if(wallPaperContainer) {
      item.container.prepend(wallPaperContainer);
    }
  };

  // Theme list is fetched in the background — the tab opens immediately and
  // thumbnails fill in once the request resolves. Layout is preserved by the
  // fixed `height: 6.5rem` on `.themes-container` (see _themes.scss).
  const [themesPromise] = createResource(() => rootScope.managers.appThemesManager.getThemes());

  // Build the scrollable themes list. Wrapped in `ScrollableX` (imperative) and
  // mounted once on first render.
  const scrollable = new ScrollableX(null);
  scrollable.container.classList.add('themes-container');

  const buildThemes = async() => {
    const themes = themesPromise();
    if(!themes) return;

    const defaultThemes = themes.filter((theme) => theme.pFlags.default);
    defaultThemes.unshift(DEFAULT_THEME);

    const containers = await Promise.all(defaultThemes.map(async(theme) => {
      const container = document.createElement('div');
      const k: ThemeItem = {container, theme, wallPaperContainers: {}};

      // Mirror themeController.applyNewTheme's `isCurated` check: cloud themes (numeric id) get
      // their wallpaper navy-blended for the tinted thumbnail; DEFAULT_THEME (id='') and accent
      // presets ('preset:N') skip the blend so their curated dark gradients land verbatim.
      const themeId = String(theme.id ?? '');
      const isCurated = themeId === '' || themeId.startsWith('preset:');

      const results = theme.settings
      .filter((themeSettings) => AVAILABLE_BASE_THEMES.has(themeSettings.base_theme._))
      .map((themeSettings) => {
        // Pre-blend the wallpaper for the tinted preview when the theme isn't curated, matching
        // applyNewTheme. Non-tinted entries pass through verbatim.
        const shouldBlend = themeSettings.base_theme._ === 'baseThemeTinted' && !isCurated && themeSettings.wallpaper;
        const wp = shouldBlend ? blendWallpaperForTinted(themeSettings.wallpaper, themeSettings.accent_color) : themeSettings.wallpaper;
        const result = AppBackgroundTab.addWallPaper(wp, undefined, themeSettings.base_theme._);
        k.wallPaperContainers[themeSettings.base_theme._] = result.container;
        solidRoots.push(result.dispose);
        return result;
      });

      // Themes that ship only baseThemeClassic / baseThemeNight entries fall back to night when
      // displayed on tinted. Synthesize a blended tinted container from the night entry so the
      // tinted-display preview matches what applyNewTheme produces (which also blends on
      // fallback). Skip curated themes — applyNewTheme skips the blend for them.
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

      if(theme.id === currentTheme.id) {
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
  };

  createEffect(on(themesPromise, (themes) => {
    if(themes) {
      buildThemes();
    }
  }));

  // Click-to-select on themes container (delegated).
  const listenerSetter = new ListenerSetter();
  attachClickEvent(scrollable.container, async(e) => {
    const container = findUpClassName(e.target, 'theme-container');
    if(!container) return;

    const lastActive = scrollable.container.querySelector('.active');
    lastActive?.classList.remove('active');

    const item = themesMap.get(container);
    container.classList.add('active');

    await themeController.applyNewTheme(item.theme);
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

  // Theme variant changes flow through the radio's `stateKey`. Bridge the
  // resulting `settings_updated` to a `theme_change` dispatch (preserved from
  // the legacy tab — this is what reapplies the picked theme everywhere).
  subscribeOn(rootScope)('settings_updated', ({key}) => {
    if(key === stateKey) {
      rootScope.dispatchEvent('theme_change');
    }
  });

  // Re-style the theme thumbnails when the active theme changes elsewhere
  // (e.g. via auto-night) and scroll the active one into view.
  subscribeOn(rootScope)('theme_changed', () => {
    currentTheme = themeController.getTheme();
    const newIsNight = themeController.isNight();
    const newThemeName = currentTheme.name;
    const variantChanged = currentThemeName !== newThemeName;

    isNight = newIsNight;
    currentThemeName = newThemeName;

    // Active marker always tracks the live theme.id — when the user picks an accent preset the
    // variant name stays the same but theme.id flips to 'preset:N', which no thumbnail matches,
    // so the previously-active thumbnail must clear (theme-container and accent-circle are
    // mutually exclusive selection surfaces).
    const lastActive = scrollable.container.querySelector('.active');
    lastActive?.classList.remove('active');

    let active: HTMLElement | undefined;
    themesMap.forEach((item) => {
      if(variantChanged) applyThemeOnItem(item);
      if(item.theme.id === currentTheme.id) {
        item.container.classList.add('active');
        active = item.container;
      }
    });

    if(active && variantChanged) {
      scrollable.scrollIntoViewNew({
        element: active,
        position: 'center',
        axis: 'x'
      });
    }
  });

  onCleanup(() => {
    listenerSetter.removeAll();
    solidRoots.forEach((d) => d());
  });

  // Theme variant rows (day / night / light / tinted / system) — imperative
  // RadioFields with stateKey for two-way state binding. They share `name`
  // which radio-groups them in the DOM.
  const radios = THEME_VARIANTS.map(([value, langKey]) =>
    new RadioField({langKey, name: 'theme', value, stateKey})
  );

  // Accent-color picker is Dark-only: only `baseThemeTinted` has the per-base wallpaper map and
  // surface-derivation formulas wired up (see themeController + themePresets). For day/night/light
  // the picker would render but selections wouldn't visually behave — hide and grow-height-reveal
  // when the user actually lands on Dark.
  const [isDark, setIsDark] = createSignal(themeController.getResolvedThemeName() === 'tinted');
  subscribeOn(rootScope)('theme_changed', () => setIsDark(themeController.getResolvedThemeName() === 'tinted'));

  return (
    <Section name="ColorTheme">
      <div ref={(el) => el.append(scrollable.container)} />
      <form style={{'margin-top': '.5rem'}}>
        {radios.map((radio) => (
          <Row>
            <Row.RadioField>{radio.label}</Row.RadioField>
          </Row>
        ))}
      </form>
      <GrowHeightReveal when={isDark()} appear={false} class="accent-picker-frame">
        <AccentPickerRow />
      </GrowHeightReveal>
    </Section>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Accent-color picker row — ported from iOS' ThemePickerController. Shows a
// "default" swatch + the per-base presets defined in @config/themePresets.
// Tapping a circle routes through themeController.applyAccentPreset so the
// existing applyNewTheme array-preserving codepath is reused; tapping
// "default" calls resetActiveTheme to restore the bundled SETTINGS_INIT entry
// for the current base (so the user can always get back to factory day/night).
// On tinted ("Dark") we skip the default swatch — the factory entry uses the
// blue base-color preset's values, so the blue circle covers both roles.
// ─────────────────────────────────────────────────────────────────────────────

const hexFromInt = (n: number) => '#' + n.toString(16).padStart(6, '0');

const AccentPickerRow = () => {
  let scrollableEl: HTMLDivElement;

  const computeState = () => {
    const theme = themeController.getTheme();
    const base = themeController.getBaseThemeForName(theme.name);
    const presets = getAccentPresetsForBase(base);
    const isTinted = base === 'baseThemeTinted';
    let activeId = String(theme.id ?? '');
    // Tinted factory state has theme.id === '' but the same accent/bubble values as the blue
    // base preset — surface that to the picker so blue reads as active right after install/reset.
    if(isTinted && activeId === '' && presets.length) {
      activeId = presetThemeId(presets[0]);
    }
    return {presets, activeId, showDefault: !isTinted};
  };

  const [state, setState] = createSignal(computeState());

  // Center the active circle horizontally — mirrors the .themes-container behavior where the
  // active thumbnail is auto-scrolled into view after a theme_changed (see ThemeSection).
  const scrollActiveIntoView = () => {
    const active = scrollableEl?.querySelector<HTMLElement>('.accent-circle--active');
    if(!active) return;
    fastSmoothScroll({
      element: active,
      container: scrollableEl,
      axis: 'x',
      position: 'center'
    });
  };

  subscribeOn(rootScope)('theme_changed', () => {
    setState(computeState());
    queueMicrotask(scrollActiveIntoView);
  });

  const onDefault = () => themeController.resetActiveTheme();
  const onPreset = (preset: AccentPreset) => themeController.applyAccentPreset(preset);

  return (
    <Scrollable axis="x" class="accent-picker" ref={(el) => (scrollableEl = el)}>
      <Show when={state().showDefault}>
        <div
          class="accent-circle accent-circle--default"
          classList={{'accent-circle--active': state().activeId === ''}}
          onClick={onDefault}
          title="Default"
        >
          <div class="accent-circle__inner" />
        </div>
      </Show>
      <For each={state().presets}>{(preset) => {
        const accent = hexFromInt(preset.accent_color);
        const fill1 = hexFromInt(preset.message_colors[0] ?? preset.accent_color);
        const fill2 = preset.message_colors[1] !== undefined ? hexFromInt(preset.message_colors[1]) : fill1;
        return (
          <div
            class="accent-circle"
            classList={{'accent-circle--active': state().activeId === presetThemeId(preset)}}
            style={{
              '--accent-circle-ring': accent,
              '--accent-circle-fill-1': fill1,
              '--accent-circle-fill-2': fill2
            }}
            onClick={() => onPreset(preset)}
          >
            <div class="accent-circle__inner" />
          </div>
        );
      }}</For>
    </Scrollable>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Section 3 — distance units (geolocation only)
// ─────────────────────────────────────────────────────────────────────────────

const DistanceUnitsSection = () => {
  const stateKey = joinDeepPath('settings', 'distanceUnit');
  const radios: [StateSettings['distanceUnit'], LangPackKey][] = [
    ['kilometers', 'DistanceUnitsKilometers'],
    ['miles', 'DistanceUnitsMiles']
  ];

  return (
    <Section name="DistanceUnitsTitle">
      <form>
        {radios.map(([value, langKey]) => {
          const field = new RadioField({langKey, name: 'distance-unit', value, stateKey});
          return <Row><Row.RadioField>{field.label}</Row.RadioField></Row>;
        })}
      </form>
    </Section>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Section 4 — time format (h12 / h23) with a live "current time" subtitle
// ─────────────────────────────────────────────────────────────────────────────

const TimeFormatSection = () => {
  const stateKey = joinDeepPath('settings', 'timeFormat');
  const formats: [StateSettings['timeFormat'], LangPackKey][] = [
    ['h12', 'General.TimeFormat.h12'],
    ['h23', 'General.TimeFormat.h23']
  ];

  // Pre-create radios so the same instances drive both DOM and subtitle refs.
  const items = formats.map(([format, langKey]) => {
    const radio = new RadioField({langKey, name: 'time-format', value: format, stateKey});
    const [subtitle, setSubtitle] = createSignal<string>('');
    return {format, langKey, radio, subtitle, setSubtitle};
  });

  const updateAll = () => {
    const date = new Date();
    items.forEach(({format, setSubtitle}) => {
      const str = date.toLocaleTimeString('en-us-u-hc-' + format, {
        hour: '2-digit',
        minute: '2-digit'
      });
      setSubtitle(str);
    });
  };

  updateAll();
  const cancel = eachMinute(updateAll);
  onCleanup(cancel);

  return (
    <Section name="General.TimeFormat">
      <form>
        {items.map(({radio, subtitle}) => (
          <Row>
            <Row.RadioField>{radio.label}</Row.RadioField>
            <Row.Subtitle>{subtitle()}</Row.Subtitle>
          </Row>
        ))}
      </form>
    </Section>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Tab root
// ─────────────────────────────────────────────────────────────────────────────

const GeneralSettings = () => {
  return (
    <>
      <SettingsSection />
      <ThemeSection />
      {IS_GEOLOCATION_SUPPORTED && <DistanceUnitsSection />}
      <TimeFormatSection />
    </>
  );
};

export default GeneralSettings;
