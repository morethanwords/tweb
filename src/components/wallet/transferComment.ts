/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import type {Message, MessageAction, MessageEntity, WalletTransaction} from '@layer';
import rootScope from '@lib/rootScope';
import wrapRichText from '@lib/richTextProcessor/wrapRichText';
import base64ToBytes from '@helpers/string/base64ToBytes';
import Modes from '@config/modes';

type GramTransfer = MessageAction.messageActionGramTransfer;

const COVER_PAYLOAD_OVERHEAD = 64;
const COVER_MIN = 8;
const COVER_MAX = 128;

/**
 * How many letters cover an encrypted comment: about as many as its payload may hold
 */
export function encryptedCommentCoverLength(payload: string) {
  let size = 0;
  try {
    size = base64ToBytes(payload).length;
  } catch(err) {}
  return Math.min(COVER_MAX, Math.max(COVER_MIN, size - COVER_PAYLOAD_OVERHEAD));
}

/**
 * A comment under its spoiler: the text itself, or as many hidden letters as an encrypted one may hold
 */
export function wrapCommentCover(text: string, textColor?: string) {
  const entities: MessageEntity[] = [{_: 'messageEntitySpoiler', offset: 0, length: text.length}];
  return wrapRichText(text, {entities, noTextFormat: true, textColor});
}

/**
 * An encrypted comment just opened in `container` (focusable with the a11y layer): its cover's button went with
 * the cover, so a keyboard's focus left on nothing — or on the cover still fading out — moves to the comment
 */
export function keepCommentFocus(container: HTMLElement) {
  if(!Modes.a11y) return;
  const doc = container.ownerDocument, active = doc.activeElement;
  if(active === doc.body || (active !== container && container.contains(active))) {
    container.focus();
  }
}

/**
 * The wallet's key could not be had for a comment (restoring it failed), as opposed to the comment not decrypting
 */
export class WalletCommentKeyError {
  constructor(public error: any) {}
}

/**
 * Why a comment did not open, in the app's alert (iOS): the key that could not be restored, with another try, or the
 * comment itself
 */
export async function showCommentDecryptError(error: any, retry: () => void) {
  const [{showWalletAlert}, {getWalletErrorLangKey}] = await Promise.all([
    import('@components/wallet/alerts'),
    import('@components/wallet/send')
  ]);

  if(error instanceof WalletCommentKeyError) {
    showWalletAlert({title: 'Wallet.Details.RestoreErrorTitle', text: getWalletErrorLangKey(error.error)}, {
      actions: [{langKey: 'Wallet.Retry', callback: retry}]
    });
  } else {
    showWalletAlert({title: 'Wallet.Details.DecryptErrorTitle', text: 'Wallet.Details.DecryptErrorText'});
  }
}

/**
 * Decrypts the comment of a chat's transfer with the wallet's key. When this device has no key, the wallet window
 * opens on the transfer instead, restores the key there and shows the comment: nothing comes back then.
 */
export async function decryptTransferComment(message: Message.messageService, out: boolean): Promise<string> {
  const transfer = message.action as GramTransfer;
  const [{default: WalletSession}, {default: createWalletSessionUi}, status] = await Promise.all([
    import('@lib/wallet/walletSession'),
    import('@components/wallet/vaultPrompts'),
    rootScope.managers.appWalletManager.getStatus()
  ]);

  const session = WalletSession.get();
  if(status.presence !== 'ready' || (await session.getDeviceMode(status)) !== 'full') {
    const {default: showWalletPopup} = await import('@components/wallet');
    showWalletPopup(transfer.transaction_id ? {transactionId: transfer.transaction_id} : {});
    return;
  }

  session.ui ??= createWalletSessionUi();
  const transaction = {
    _: 'walletTransaction',
    pFlags: {comment_encrypted: true, incoming: out ? undefined : true},
    comment: transfer.comment,
    peer: {_: 'walletTransactionPeerAddress', address: transfer.peer_address}
  } as any as WalletTransaction;
  return session.decryptComment(status, transaction, status.state.address);
}
