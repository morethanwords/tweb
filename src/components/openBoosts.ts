import type SidebarSlider from '@components/slider';
import type {AppSidebarRight} from '@components/sidebarRight';
import {FormatterArguments, LangPackKey} from '@lib/langPack';
import rootScope from '@lib/rootScope';
import type {AppManagers, TabManagers} from '@lib/managers';

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

/** A channel's custom emoji reactions: each one takes a level of boosts */
export function getCustomReactionsBoostReason(customCount: number): BoostReason {
  return {
    titleLangKey: 'ReactionCustomReactions',
    descriptionLangKey: 'ReactionReachLvlForReactionShort',
    descriptionArgs: [customCount, customCount]
  };
}

/**
 * Sends an admin to the Boosts tab — level progress plus the levers to raise it (boost link,
 * boosts via gifts) — and everyone else to the member-facing "give your boost" popup.
 * Every entry into boosting goes through here: the chat topbar's menu item, and the level
 * gates that offer boosting as the way past them.
 */
export default async function openBoosts({peerId, slider, reason, managers = rootScope.managers, onClose, isAlive}: {
  peerId: PeerId,
  slider: SidebarSlider,
  reason?: BoostReason,
  // * the opener's, bound to its account session: what a switch of account interrupts does not open
  managers?: AppManagers | TabManagers,
  // * once the popup has closed; a tab opened instead has nothing to wait for
  onClose?: () => void,
  // * the opener's lifetime: false once it is gone, and nothing is opened over what came after it
  isAlive?: () => boolean
}) {
  const isAdmin = await managers.appProfileManager.canViewStatistics(peerId);
  if(isAlive && !isAlive()) {
    return;
  }

  if(isAdmin) {
    const {default: AppBoostsTab} = await import('@components/sidebarRight/tabs/boosts');
    if(isAlive && !isAlive()) {
      return;
    }
    // whatever sent the user here stays reachable with the tab open, so repeated taps must
    // not stack copies of it
    const current = slider.getHistory().slice(-1)[0];
    if(!(current instanceof AppBoostsTab && current.peerId === peerId)) {
      slider.createTab(AppBoostsTab).open(peerId);
    }

    // the entry may sit outside the sidebar — the chat topbar's does — so it has to be
    // revealed; the left sidebar is where the user already is and has nothing to toggle
    (slider as AppSidebarRight).toggleSidebar?.(true);
    onClose?.();
    return;
  }

  const {default: showBoostPopup} = await import('@components/popups/boost');
  if(isAlive && !isAlive()) {
    return;
  }

  return showBoostPopup(peerId, {reason, managers, onClose});
}
