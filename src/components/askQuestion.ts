import confirmationPopup from '@components/confirmationPopup';
import {toastNew} from '@components/toast';
import safeWindowOpen from '@helpers/dom/safeWindowOpen';
import type {AppManagers} from '@lib/managers';
import I18n from '@lib/langPack';
import {hotReloadGuard} from '@lib/solidjs/hotReloadGuardProvider';

/** tdesktop's `OpenFaq`. */
export function openTelegramFaq() {
  safeWindowOpen(I18n.format('TelegramFaqUrl', true));
}

/**
 * tdesktop's `OpenAskQuestionConfirm`: the volunteers are asked only past a reminder that the FAQ may
 * already have the answer, and the other button of that reminder opens it. Confirmed, `help.getSupport`
 * names the volunteer whose chat opens.
 */
export default async function askQuestion(managers: AppManagers) {
  try {
    await confirmationPopup({
      titleLangKey: 'AskAQuestion',
      descriptionLangKey: 'AskAQuestionInfo',
      button: {langKey: 'AskButton'},
      cancelButton: {langKey: 'TelegramFaq', callback: openTelegramFaq}
    });
  } catch{
    return;
  }

  try {
    const userId = await managers.appUsersManager.getSupportUserId();
    hotReloadGuard.appImManager.setInnerPeer({peerId: userId.toPeerId(false)});
  } catch{
    toastNew({langPackKey: 'Error.AnError'});
  }
}
