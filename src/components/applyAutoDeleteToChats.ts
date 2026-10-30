import showPickUserPopup from '@components/popups/pickUser';
import {findExistingOrCreateCustomOption} from '@components/sidebarLeft/tabs/autoDeleteMessages/options';
import {toast} from '@components/toast';
import getAutoDeleteUnavailablePeerIds from '@appManagers/utils/peers/getAutoDeleteUnavailablePeerIds';
import {i18n} from '@lib/langPack';
import type {AppManagers} from '@lib/managers';

/**
 * tdesktop's `BuildApplyToExisting`: the chats picked here take the default auto-delete period
 * (`period` in seconds, 0 turns it off) as well — those it can be set in, which is every private chat
 * and every group or channel whose info the user may change.
 */
export default function applyAutoDeleteToChats(managers: AppManagers, period: number) {
  showPickUserPopup({
    titleLangKey: 'SelectChats',
    placeholder: 'Search',
    peerType: ['dialogs'],
    multiSelect: true,
    exceptSelf: true,
    excludeMonoforums: true,
    excludePeerIds: new Set(getAutoDeleteUnavailablePeerIds()),
    chatRightsActions: ['change_info'],
    footerButtonProps: {langKey: 'Apply'},
    onSelect: (chosen) => {
      if(!chosen.length) {
        return;
      }

      // * every chat on its own, the way tdesktop sends them; one refused leaves the rest set. The picker
      // * closes at once, the toast follows the answers
      Promise.allSettled(chosen.map(({peerId}) => {
        return managers.appPrivacyManager.setAutoDeletePeriodFor(peerId, period);
      })).then((results) => {
        const succeeded = results.filter((result) => result.status === 'fulfilled').length;
        toast(wrapAppliedToChats(period, succeeded, chosen.length - succeeded));
      });
    }
  });
}

/** The chats the server took, and an error for the rest: in one toast, which shows one at a time */
function wrapAppliedToChats(period: number, succeeded: number, failed: number) {
  const content = document.createDocumentFragment();
  if(succeeded) {
    const chats = i18n('Chats', [succeeded]);
    content.append(period ?
      i18n('AutodeleteTimerEnabledForChats', [findExistingOrCreateCustomOption(period).label(), chats]) :
      i18n('AutodeleteTimerDisabledForChats', [chats]));
  }

  if(failed) {
    if(succeeded) content.append(' ');
    content.append(i18n('Error.AnError'));
  }

  return content;
}
