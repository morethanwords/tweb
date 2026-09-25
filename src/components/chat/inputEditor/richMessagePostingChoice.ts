import type {AppManagers} from '@lib/managers';
import confirmationPopup, {
  PopupConfirmationOptions
} from '@components/confirmationPopup';
import showPremiumPopup from '@components/popups/premium';
import {toastNew} from '@components/toast';

export type RichMessagePostingChoice = 'rich' | 'plain' | 'cancel';

type RichMessagePostingChoiceDependencies = {
  confirm: typeof confirmationPopup,
  showError: () => void,
  showPremium: () => void,
  showUnavailable: () => void
};

const DEFAULT_DEPENDENCIES: RichMessagePostingChoiceDependencies = {
  confirm: confirmationPopup,
  showError: () => toastNew({langPackKey: 'Error.AnError'}),
  showPremium: () => showPremiumPopup(),
  showUnavailable: () => toastNew({langPackKey: 'RichMessage.Error.UnsupportedContent'})
};

export function createRichMessagePremiumConfirmation(
  showPremium: () => void
): PopupConfirmationOptions {
  const sendWithoutFormattingButton: PopupConfirmationOptions['button'] = {
    langKey: 'RichMessage.SendWithoutFormatting'
  };
  return {
    titleLangKey: 'RichMessage.PremiumRequired.Title',
    descriptionLangKey: 'RichMessage.PremiumRequired.Text',
    closable: true,
    button: sendWithoutFormattingButton,
    cancelButton: {
      langKey: 'RichMessage.SubscribeToPremium',
      callback: showPremium
    }
  };
}

export default async function getRichMessagePostingChoice(
  managers: AppManagers,
  allowPlainFallback = true,
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
  if(!allowPlainFallback) {
    if(state.mode === 'premium') dependencies.showPremium();
    else dependencies.showUnavailable();
    return 'cancel';
  }

  try {
    await dependencies.confirm(state.mode === 'premium' ?
      createRichMessagePremiumConfirmation(dependencies.showPremium) :
      {
        titleLangKey: 'RichMessage.Unavailable.Title',
        descriptionLangKey: 'RichMessage.Unavailable.Text',
        button: {langKey: 'RichMessage.SendWithoutFormatting'}
      });
    return 'plain';
  } catch{
    return 'cancel';
  }
}
