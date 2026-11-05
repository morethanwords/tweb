import type {AppManagers} from '@lib/managers';
import confirmationPopup from '@components/confirmationPopup';
import rootScope from '@lib/rootScope';
import {i18n} from '@lib/langPack';

/**
 * Asks the user whether to share their phone number with a chat (a bot's keyboard, a mini app) and, if they agree,
 * sends it there as their contact.
 *
 * `unblockBot`: a bot the user blocked is unblocked first, so that the contact can reach it — but only after the
 * user agreed: a cancel or a closed popup leaves the block as it was (as tdesktop, Android and Web A do). The
 * question then says the bot will be unblocked, as Android's does (BotWebViewContainer, `web_app_request_phone`).
 */
export default async function requestPhone({managers, unblockBot, ...options}: {
  managers: AppManagers,
  peerId: PeerId,
  threadId?: number,
  unblockBot?: boolean
}) {
  // * the user of the account that asked, even if the tab shows another one by the time they answer
  const contactPeerId = rootScope.myId;
  const isBlocked = unblockBot && await managers.appProfileManager.isUserBlocked(options.peerId.toUserId());

  let description: DocumentFragment;
  if(isBlocked) {
    description = document.createDocumentFragment();
    description.append(i18n('AreYouSureShareMyContactInfoBot'), '\n\n', i18n('AreYouSureShareMyContactInfoBotUnblock'));
  }

  await confirmationPopup({
    titleLangKey: 'ShareYouPhoneNumberTitle',
    button: {
      langKey: 'OK'
    },
    descriptionLangKey: description ? undefined : 'AreYouSureShareMyContactInfoBot',
    description
  });

  // * only the bot the question said would be unblocked is
  if(isBlocked) {
    await managers.appMessagesManager.unblockBot(options.peerId.toUserId());
  }

  return managers.appMessagesManager.sendContact({...options, contactPeerId});
}
