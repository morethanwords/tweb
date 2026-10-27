import type {AppManagers} from '@lib/managers';
import confirmationPopup, {
  PopupConfirmationOptions
} from '@components/confirmationPopup';
import {toastNew} from '@components/toast';
import {hotReloadGuard} from '@lib/solidjs/hotReloadGuardProvider';

/** `plain`: the sender chose to remove the rich formatting (`richMessageToPlainMessage`). */
export type RichMessagePostingChoice = 'rich' | 'plain' | 'cancel';

type RichMessagePostingChoiceDependencies = {
  confirm: typeof confirmationPopup,
  showError: () => void,
  showPremium: () => void
};

const DEFAULT_DEPENDENCIES: RichMessagePostingChoiceDependencies = {
  confirm: confirmationPopup,
  showError: () => toastNew({langPackKey: 'Error.AnError'}),
  showPremium: () => hotReloadGuard.showPremiumPopup()
};

export function createRichMessagePremiumConfirmation(
  showPremium: () => void
): PopupConfirmationOptions {
  // as Android has it: Premium is the offer, removing the formatting the way out
  const removeFormattingButton: PopupConfirmationOptions['button'] = {
    langKey: 'RichMessage.RemoveFormatting',
    isSecondary: true
  };
  return {
    titleLangKey: 'RichMessage.PremiumRequired.Title',
    descriptionLangKey: 'RichMessage.PremiumRequired.Text',
    closable: true,
    footer: true,
    button: removeFormattingButton,
    buttons: [{
      langKey: 'RichMessage.SubscribeToPremium',
      isCancel: true,
      callback: showPremium
    }, removeFormattingButton]
  };
}

export function createRichMessageUnavailableConfirmation(): PopupConfirmationOptions {
  return {
    titleLangKey: 'RichMessage.Unavailable.Title',
    descriptionLangKey: 'RichMessage.Unavailable.Text',
    footer: true,
    button: {langKey: 'RichMessage.RemoveFormatting'},
    cancelButton: {langKey: 'Cancel', isSecondary: true}
  };
}

export default async function getRichMessagePostingChoice(
  managers: AppManagers,
  dependencies = DEFAULT_DEPENDENCIES
): Promise<RichMessagePostingChoice> {
  let state: Awaited<ReturnType<AppManagers['appMessagesManager']['getRichMessagePostingState']>>;
  try {
    state = await managers.appMessagesManager.getRichMessagePostingState();
  } catch{
    dependencies.showError();
    return 'cancel';
  }
  if(state.allowed) return 'rich';

  try {
    await dependencies.confirm(state.mode === 'premium' ?
      createRichMessagePremiumConfirmation(dependencies.showPremium) :
      createRichMessageUnavailableConfirmation());
    return 'plain';
  } catch{
    return 'cancel';
  }
}
