import {createSignal} from 'solid-js';

import themeController from '@helpers/themeController';
import anchorCallback from '@helpers/dom/anchorCallback';
import {subscribeOn} from '@helpers/solid/subscribeOn';
import {StateSettings} from '@config/state';
import {BaseTheme} from '@layer';
import {i18n} from '@lib/langPack';
import rootScope from '@lib/rootScope';
import {useAppSettings} from '@stores/appSettings';
import {useHotReloadGuard} from '@lib/solidjs/hotReloadGuard';

import ChatThemesPicker from '@components/chatThemesPicker';
import {AppGeneralSettingsTab} from '@components/solidJsTabs/tabs';

import TipCard, {openSettingsTab, TipCardButton, useTipReady} from '@components/chatTips/tipCard';
import styles from '@components/chatTips/chatTips.module.scss';

/**
 * Appearance tip — macOS' `WidgetAppearanceController`: System / Dark / Light in the button row,
 * live theme thumbnails as the content, and a line pointing at the full Appearance screen.
 *
 * macOS fills the content with its Minimalism/Colorful chat-mode previews; tweb has no
 * non-bubbled mode, so the equivalent "pick how the chat looks, from thumbnails" control here is
 * the cloud-theme strip — the same `<ChatThemesPicker>` General Settings and the My QR popup use.
 */
export default function AppearanceTipCard() {
  const {appSidebarLeft} = useHotReloadGuard();
  const [appSettings] = useAppSettings();
  const markReady = useTipReady();

  // Live (id, name) of the global theme: `id` stripes the picker's active tile, `name` drives the
  // brightness its thumbnails render at. Every theme apply dispatches `theme_changed`.
  const readTheme = () => {
    const theme = themeController.getTheme();
    return {id: String(theme.id ?? ''), name: theme.name};
  };
  const [themeState, setThemeState] = createSignal(readTheme(), {
    equals: (a, b) => a.id === b.id && a.name === b.name
  });
  subscribeOn(rootScope)('theme_changed', () => setThemeState(readTheme()));

  // Which of the three buttons reads as active. Mirrors macOS: System wins outright, otherwise
  // it is whatever the applied theme actually resolves to. `settings.theme` is reactive through
  // the store; the resolved brightness only moves on `theme_changed`.
  const [isNight, setIsNight] = createSignal(themeController.isNight());
  subscribeOn(rootScope)('theme_changed', () => setIsNight(themeController.isNight()));

  const isSystem = () => appSettings.theme === 'system';
  const isDark = () => !isSystem() && isNight();

  // Go through `switchTheme` so a side lands on the variant the user last picked there — Dark on
  // Night or Dark, Light on Classic or Day — falling back to the night/day defaults exactly like
  // the burger menu's Dark Mode toggle. Applying a fixed 'tinted'/'light' here would instead
  // overwrite the user's pick with one arbitrary variant. The coordinates give the same circular
  // reveal the menu toggle animates from.
  const apply = (name: StateSettings['theme'], e: MouseEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    themeController.switchTheme(name, {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2
    });
  };

  const buttons = (): TipCardButton[] => [{
    icon: 'sputnik_filled',
    text: i18n('ChatTips.Appearance.System'),
    selected: isSystem(),
    onClick: (e) => apply('system', e)
  }, {
    icon: 'darkmode_filled',
    text: i18n('ChatTips.Appearance.Dark'),
    selected: isDark(),
    onClick: (e) => apply(appSettings.lastThemeNames?.dark ?? 'night', e)
  }, {
    icon: 'brightness',
    text: i18n('ChatTips.Appearance.Light'),
    selected: !isSystem() && !isDark(),
    onClick: (e) => apply(appSettings.lastThemeNames?.light ?? 'day', e)
  }];

  return (
    <TipCard
      title={i18n('ChatTips.Appearance')}
      buttons={buttons()}
      contentTitle={i18n('ColorTheme')}
      description={i18n('ChatTips.Appearance.Description', [
        anchorCallback(() => openSettingsTab(appSidebarLeft, AppGeneralSettingsTab))
      ])}
    >
      <ChatThemesPicker
        class={styles.themes}
        selectedId={() => themeState().id}
        baseTheme={(): BaseTheme['_'] => themeController.getBaseThemeForName(themeState().name)}
        onSelect={(theme) => themeController.applyNewTheme(theme)}
        onReady={markReady}
      />
    </TipCard>
  );
}
