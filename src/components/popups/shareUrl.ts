import rootScope from '@lib/rootScope';
import {LangPackKey} from '@lib/langPack';
import {copyTextToClipboard} from '@helpers/clipboard';
import {toastNew} from '@components/toast';
import wrapPeerTitle from '@components/wrappers/peerTitle';
import PaidMessagesInterceptor, {ConfirmedPaymentResult, PAYMENT_REJECTED} from '@components/chat/paidMessagesInterceptor';
import {createCopyLinkFooter, PopupPickUserOptions, showSharingPickerPopup} from '@components/popups/pickUser';
import {hotReloadGuard} from '@lib/solidjs/hotReloadGuardProvider';
import {bindManagersToSession} from '@lib/accounts/bindManagersToAccount';
import type {AppManagers} from '@lib/managers';

// Shared "send something via the standard sharing picker" helper. Subsumes the
// near-identical onSelect handlers in giftLink.tsx, appMediaViewerRtmp.ts
// (forward), sharedFolder.ts, and call/settingsPopup.tsx — each used to
// open the picker, prep stars-payment for the single chosen peer, fire
// `sendText`, and (sometimes) toast/open-chat. Now one helper does it all
// and adds multi-select for free.
//
// Per-peer steps run sequentially: each `prepareStarsForPayment` may surface
// its own confirmation flow, and concurrent prompts would stomp on each
// other. A rejected payment skips that peer instead of aborting the whole
// batch (matches the legacy single-peer behavior, which threw — effectively
// the same: no message sent — but cleaner when multiple peers are queued).
export type ShareUrlOptions = {
  url: string,
  // Allow picking multiple recipients. Defaults to single-select.
  multiSelect?: boolean,
  // Single-recipient only: open the chat after sending. Ignored for multi.
  openAfter?: boolean,
  // Toast lang key when the URL went to one non-self peer. `%s` ← peer name.
  // Falsy ⇒ no toast.
  toastKey?: LangPackKey,
  // Toast lang key when the recipient is the current user (Saved Messages).
  // Falls back to `toastKey` if omitted.
  toastKeyForSelf?: LangPackKey,
  // Toast lang key when shared to multiple peers. `%d` ← count.
  // Falls back to `toastKey` if omitted (count goes to the same slot).
  toastKeyForMany?: LangPackKey
};

export type ShareTarget = {peerId: PeerId, threadId?: number, monoforumThreadId?: PeerId};

export type ShareToPeersOptions = Omit<ShareUrlOptions, 'url'> & Pick<PopupPickUserOptions, 'footer' | 'onChange'> & {
  // Sends to one chosen chat, its stars paid for when it asks for them.
  send: (managers: AppManagers, target: ShareTarget, confirmedPaymentResult: ConfirmedPaymentResult) => void,
  // What the chats must let the user send — plain text when omitted.
  chatRightsActions?: PopupPickUserOptions['chatRightsActions']
};

export function shareToPeers(options: ShareToPeersOptions) {
  return showSharingPickerPopup({
    multiSelect: options.multiSelect,
    chatRightsActions: options.chatRightsActions,
    footer: options.footer,
    onChange: options.onChange,
    onSelect: async(chosen) => {
      const managers = bindManagersToSession(rootScope.managers);
      let sent = 0;
      for(const target of chosen) {
        const preparedPayment = await PaidMessagesInterceptor.prepareStarsForPayment({
          messageCount: 1,
          peerId: target.peerId
        });
        if(preparedPayment === PAYMENT_REJECTED) continue;

        options.send(managers, target, preparedPayment);

        ++sent;
      }

      if(!sent) return;

      const isMulti = chosen.length > 1;
      const single = chosen[0];

      if(!isMulti && options.openAfter) {
        hotReloadGuard.appImManager.setInnerPeer({peerId: single.peerId});
        return;
      }

      if(isMulti) {
        const key = options.toastKeyForMany || options.toastKey;
        if(key) {
          toastNew({langPackKey: key, langPackArguments: [sent]});
        }
      } else if(options.toastKey || options.toastKeyForSelf) {
        const isSelf = single.peerId === rootScope.myId;
        const key = isSelf ? (options.toastKeyForSelf || options.toastKey) : options.toastKey;
        if(key) {
          toastNew({
            langPackKey: key,
            langPackArguments: [await wrapPeerTitle({peerId: single.peerId})]
          });
        }
      }
    }
  });
}

export default function shareUrlToPeers(options: ShareUrlOptions): void {
  // Only in multi-select: a single-select picker sends on the row click and has
  // no footer of its own to take over.
  const copyFooter = options.multiSelect && createCopyLinkFooter({
    confirmLangKey: 'Send',
    copy: () => {
      copyTextToClipboard(options.url);
      toastNew({langPackKey: 'LinkCopied'});
    },
    confirm: () => popup.finalize()
  });

  const popup = shareToPeers({
    ...options,
    ...(copyFooter || {}),
    send: (managers, {peerId, threadId, monoforumThreadId}, confirmedPaymentResult) => {
      managers.appMessagesManager.sendText({
        peerId,
        threadId,
        text: options.url,
        replyToMonoforumPeerId: monoforumThreadId,
        confirmedPaymentResult
      });
    }
  });
}
