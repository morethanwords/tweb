import type {PopupPeerCheckboxOptions} from '@components/popups/peer';
import confirmationPopup from '@components/confirmationPopup';
import PeerTitle from '@components/peerTitle';
import {toastNew} from '@components/toast';
import rootScope from '@lib/rootScope';
import {bindManagersToSession} from '@lib/accounts/bindManagersToAccount';

/**
 * Blocks a user once the confirmation is accepted, optionally reporting the chat as spam and
 * deleting it as well (the checkboxes the confirmation offers). `onConfirmed` gets the requests.
 *
 * With `fromRepliesMid`, the one who replied with that message of the Replies chat: the checkboxes
 * report them and delete this reply and all of theirs, all in one request (desktop's
 * `BlockSenderFromRepliesBox`).
 */
export default async function blockUserWithConfirmation(options: {
  peerId: PeerId,
  showReport?: boolean,
  showDelete?: boolean,
  fromRepliesMid?: number,
  onConfirmed?: (promise: Promise<any>) => void
}) {
  const {peerId, showDelete, fromRepliesMid, onConfirmed} = options;
  const fromReplies = fromRepliesMid !== undefined;
  const showReport = options.showReport || fromReplies;
  // * the account the user is blocked on, whichever the tab shows once the confirmation is answered
  const managers = bindManagersToSession(rootScope.managers);
  const checkboxes: PopupPeerCheckboxOptions[] = [
    showReport && {
      text: 'DeleteReportSpam',
      checked: true
    },
    showDelete && {
      text: 'DeleteThisChat',
      checked: true
    },
    fromReplies && {
      text: 'BlockUser.DeleteReply',
      checked: true
    },
    fromReplies && {
      text: 'BlockUser.DeleteAllReplies',
      textArgs: [new PeerTitle({peerId}).element],
      checked: true
    }
  ];
  const shown = checkboxes.filter(Boolean);

  const checked = await confirmationPopup({
    peerId,
    titleLangKey: 'BlockUser',
    descriptionLangKey: 'AreYouSureBlockContact2',
    descriptionLangArgs: [new PeerTitle({peerId}).element],
    button: {
      langKey: 'BlockUser',
      isDanger: true
    },
    checkboxes: shown
  });

  // * by its text: which of them were offered depends on the options
  const isChecked = (text: PopupPeerCheckboxOptions['text']) => Array.isArray(checked) && !!checked[shown.findIndex((checkbox) => checkbox.text === text)];
  const reportSpam = isChecked('DeleteReportSpam');

  const promise = fromReplies ? managers.appUsersManager.blockFromReplies(peerId, fromRepliesMid, {
    deleteMessage: isChecked('BlockUser.DeleteReply'),
    deleteHistory: isChecked('BlockUser.DeleteAllReplies'),
    reportSpam
  }) : Promise.all([
    reportSpam && managers.appMessagesManager.reportSpam(peerId),
    isChecked('DeleteThisChat') && managers.appMessagesManager.flushHistory({peerId, justClear: false, revoke: true}),
    managers.appUsersManager.toggleBlock(peerId, true)
  ]);

  onConfirmed?.(promise);

  await promise;

  toastNew({langPackKey: 'UserBlocked'});
}

export function unblockUser(peerId: PeerId) {
  return rootScope.managers.appUsersManager.toggleBlock(peerId, false).then(() => {
    toastNew({langPackKey: 'UserUnblocked'});
  });
}
