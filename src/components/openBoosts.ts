import type SidebarSlider from '@components/slider';
import type {AppSidebarRight} from '@components/sidebarRight';
import PopupElement from '@components/popups';
import {FormatterArguments, LangPackKey} from '@lib/langPack';
import rootScope from '@lib/rootScope';

/**
 * Why the user was sent to boosting — a feature is locked behind a level. Without it the
 * boost popup falls back to its generic "enable stories" copy, which is wrong wherever the
 * level is needed for something else.
 */
export type BoostReason = {
  titleLangKey: LangPackKey,
  descriptionLangKey: LangPackKey,
  descriptionArgs?: FormatterArguments
};

/**
 * Sends an admin to the Boosts tab — level progress plus the levers to raise it (boost link,
 * boosts via gifts) — and everyone else to the member-facing "give your boost" popup.
 * Every entry into boosting goes through here: the chat topbar's menu item, and the level
 * gates that offer boosting as the way past them.
 */
export default async function openBoosts({peerId, slider, reason}: {
  peerId: PeerId,
  slider: SidebarSlider,
  reason?: BoostReason
}) {
  if(await rootScope.managers.appProfileManager.canViewStatistics(peerId)) {
    const {default: AppBoostsTab} = await import('@components/sidebarRight/tabs/boosts');
    // whatever sent the user here stays reachable with the tab open, so repeated taps must
    // not stack copies of it
    const current = slider.getHistory().slice(-1)[0];
    if(!(current instanceof AppBoostsTab && current.peerId === peerId)) {
      slider.createTab(AppBoostsTab).open(peerId);
    }

    // the entry may sit outside the sidebar — the chat topbar's does — so it has to be
    // revealed; the left sidebar is where the user already is and has nothing to toggle
    (slider as AppSidebarRight).toggleSidebar?.(true);
    return;
  }

  const {default: PopupBoost} = await import('@components/popups/boost');
  PopupElement.createPopup(PopupBoost, peerId, reason);
}
