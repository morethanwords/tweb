import type {PopupPeerCheckboxOptions} from '@components/popups/peer';
import confirmationPopup from '@components/confirmationPopup';
import PeerTitle from '@components/peerTitle';
import {toastNew} from '@components/toast';
import rootScope from '@lib/rootScope';
import {bindManagersToSession} from '@lib/accounts/bindManagersToAccount';

/**
 * Blocks a user once the confirmation is accepted, optionally reporting the chat as spam and
 * deleting it as well (the checkboxes the confirmation offers). `onConfirmed` gets the requests.
 */
export default async function blockUserWithConfirmation(options: {
  peerId: PeerId,
  showReport?: boolean,
  showDelete?: boolean,
  onConfirmed?: (promise: Promise<any>) => void
}) {
  const {peerId, showReport, showDelete, onConfirmed} = options;
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
    }
  ];

  const checked = await confirmationPopup({
    peerId,
    titleLangKey: 'BlockUser',
    descriptionLangKey: 'AreYouSureBlockContact2',
    descriptionLangArgs: [new PeerTitle({peerId}).element],
    button: {
      langKey: 'BlockUser',
      isDanger: true
    },
    checkboxes: checkboxes.filter(Boolean)
  });

  const [reportSpam, deleteChat] = Array.isArray(checked) ? checked : [];

  const promise = Promise.all([
    reportSpam && managers.appMessagesManager.reportSpam(peerId),
    deleteChat && managers.appMessagesManager.flushHistory({peerId, justClear: false, revoke: true}),
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
