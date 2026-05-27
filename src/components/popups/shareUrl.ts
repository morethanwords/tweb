import rootScope from '@lib/rootScope';
import {LangPackKey} from '@lib/langPack';
import {toastNew} from '@components/toast';
import wrapPeerTitle from '@components/wrappers/peerTitle';
import appImManager from '@lib/appImManager';
import PaidMessagesInterceptor, {PAYMENT_REJECTED} from '@components/chat/paidMessagesInterceptor';
import {showSharingPickerPopup} from '@components/popups/pickUser';

// Shared "send a URL via the standard sharing picker" helper. Subsumes the
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

export default function shareUrlToPeers(options: ShareUrlOptions): void {
  showSharingPickerPopup({
    multiSelect: options.multiSelect,
    onSelect: async(chosen) => {
      let sent = 0;
      for(const {peerId, threadId, monoforumThreadId} of chosen) {
        const preparedPayment = await PaidMessagesInterceptor.prepareStarsForPayment({
          messageCount: 1,
          peerId
        });
        if(preparedPayment === PAYMENT_REJECTED) continue;

        rootScope.managers.appMessagesManager.sendText({
          peerId,
          threadId,
          text: options.url,
          replyToMonoforumPeerId: monoforumThreadId,
          confirmedPaymentResult: preparedPayment
        });

        ++sent;
      }

      if(!sent) return;

      const isMulti = chosen.length > 1;
      const single = chosen[0];

      if(!isMulti && options.openAfter) {
        appImManager.setInnerPeer({peerId: single.peerId});
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
