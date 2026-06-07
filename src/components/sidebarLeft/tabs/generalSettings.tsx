import {createSignal, For, onCleanup, onMount, Show} from 'solid-js';
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
import {StateSettings} from '@config/state';
import {AccentPreset, getAccentPresetsForBase, presetThemeId} from '@config/themePresets';
import {BaseTheme} from '@layer';
import Scrollable from '@components/scrollable2';
import themeController from '@helpers/themeController';
import liteMode from '@helpers/liteMode';
import {joinDeepPath} from '@helpers/object/setDeepProperty';
import eachMinute from '@helpers/eachMinute';
import {AppChatBackgroundTab, AppPowerSavingTab} from '@components/solidJsTabs/tabs';
import fastSmoothScroll from '@helpers/fastSmoothScroll';
import ChatThemesPicker from '@components/chatThemesPicker';
import ChatBackgroundStore from '@lib/chatBackgroundStore';
import appDownloadManager from '@lib/appDownloadManager';

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

  onMount(() => {
    onUpdate();
    // Warm the Chat Wallpaper picker (one tap away via the button below) so it opens instantly
    // instead of fetching the list + downloading thumbnails only once it's already on screen.
    ChatBackgroundStore.preloadWallPapers(rootScope.managers, appDownloadManager);
  });
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

const THEME_VARIANTS: [StateSettings['theme'], LangPackKey][] = [
  ['day', 'ThemeDay'],
  ['night', 'ThemeNight'],
  ['light', 'ThemeLight'],
  ['tinted', 'ThemeTinted'],
  ['system', 'AutoNightSystemDefault']
];

const ThemeSection = () => {
  const stateKey = joinDeepPath('settings', 'theme');

  // Live (id, name) of the global theme. `id` drives the shared picker's
  // selection ring (empty string = the DEFAULT_THEME tile; 'preset:N' from the
  // accent picker matches no tile, so the ring clears — same as the legacy tab);
  // `name` drives the brightness its thumbnails render at (via base theme).
  // Tracked as primitives with a custom equality so we only re-notify the picker
  // when a relevant field actually changes. Every theme apply (tile pick, radio,
  // accent preset, auto-night) dispatches `theme_changed`.
  const readThemeState = () => {
    const theme = themeController.getTheme();
    return {id: String(theme.id ?? ''), name: theme.name};
  };
  const [themeState, setThemeState] = createSignal(readThemeState(), {
    equals: (a, b) => a.id === b.id && a.name === b.name
  });
  subscribeOn(rootScope)('theme_changed', () => setThemeState(readThemeState()));

  const selectedThemeId = () => themeState().id;
  const pickerBaseTheme = (): BaseTheme['_'] => themeController.getBaseThemeForName(themeState().name);

  // Theme variant changes flow through the radio's `stateKey`. Bridge the
  // resulting `settings_updated` to a `theme_change` dispatch (preserved from
  // the legacy tab — this is what reapplies the picked theme everywhere).
  subscribeOn(rootScope)('settings_updated', ({key}) => {
    if(key === stateKey) {
      rootScope.dispatchEvent('theme_change');
    }
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
      {/* Shared with the My QR popup (chatThemesPicker.tsx). Pure-UI: selection
          state is owned here. onSelect → applyNewTheme themes the whole app and
          dispatches theme_changed, which feeds selectedThemeId back to re-stripe
          the active tile. baseTheme repaints thumbnails on day/night/tinted switch. */}
      <ChatThemesPicker
        selectedId={selectedThemeId}
        baseTheme={pickerBaseTheme}
        onSelect={(theme) => themeController.applyNewTheme(theme)}
        recenterOnBaseChange
      />
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
