import type SidebarSlider from '@components/slider';
import type SliderSuperTab from '@components/sliderTab';
import type {LangPackKey} from '@lib/langPack';
import {AppSettingsTab} from '@components/solidJsTabs/tabs';
import {highlightMenuControl, highlightSettingsEntry} from './highlight';
import {findSettingsLink} from './link';
import {openSectionTab} from './openers';
import {ROOT_SECTION_ID} from './registry';
import type {SettingsSearchItem} from './index';

/**
 * Opens the section itself, without the tabs above it: iOS pushes the target
 * controller (`present(.push, blockedPeersController(...))`), tdesktop switches
 * straight to the section and Android presents the fragment — the path is told
 * by the result's breadcrumbs, not by walking it. Back returns to Settings.
 */
export async function openSettingsSection(
  sectionId: string,
  anchorLangKey: LangPackKey,
  settingsTab: SliderSuperTab,
  /** The control is in the section's header menu, so the menu is opened for it. */
  inMenu?: boolean
) {
  const slider = settingsTab.slider;
  // A section behind a request (sessions, blocked users) can take a while, and
  // the settings it belongs to may be closed by then — opening it on top of a
  // stack that is gone would be a tab out of nowhere.
  const middleware = settingsTab.middlewareHelper.get();

  // Whatever was opened over the settings is not part of this navigation — and
  // it closes the way the back arrow closes it, so a tab holding unsaved changes
  // gets to ask. If the user says no, the navigation is off.
  if(!await slider.closeTabsUntilTab(settingsTab)) {
    return;
  }

  const tab = sectionId === ROOT_SECTION_ID ?
    settingsTab :
    await openSectionTab(sectionId, slider, settingsTab, middleware);

  if(!tab || !anchorLangKey) {
    return;
  }

  if(inMenu) {
    highlightMenuControl(tab.header.querySelector('.btn-menu-toggle'), anchorLangKey);
    return;
  }

  highlightSettingsEntry(tab, anchorLangKey);
}

export const openSettingsSearchItem = (item: SettingsSearchItem, settingsTab: SliderSuperTab) => {
  return openSettingsSection(item.sectionId, item.anchorLangKey, settingsTab, item.kind === 'menu');
};

/** Opens `tg://settings/<path>?highlight=<key>`; false when the path is unknown. */
export async function openSettingsDeepLink(path: string, highlight: string, slider: SidebarSlider) {
  const link = findSettingsLink(path);
  if(!link) {
    return false;
  }

  // Settings may be open somewhere under the current tab: come back to it rather
  // than opening a second copy — `open` would push the same tab onto the stack
  // again, and one back press would then leave the user in Settings still.
  const opened = slider.getTab(AppSettingsTab);
  if(opened && !await slider.closeTabsUntilTab(opened)) {
    return true; // handled: the user chose to stay where they were
  }

  const settingsTab = opened || slider.createTab(AppSettingsTab);
  await settingsTab.open();
  await openSettingsSection(link.sectionId, (highlight as LangPackKey) || link.highlight, settingsTab);
  return true;
}
