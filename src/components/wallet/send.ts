/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import bigInt from 'big-integer';
import rootScope from '@lib/rootScope';
import type {FormatterArguments, LangPackKey} from '@lib/langPack';
import type {InputCheckPasswordSRP, WalletNftItem} from '@layer';
import {toastNew} from '@components/toast';
import {NFT_TRANSFER_ATTACHED_NANOS, walletError, WalletNftSendParams, WalletSendOutcome} from '@lib/wallet/walletSession';
import type {WalletDeviceMode} from '@lib/wallet/walletSession';
import type {WalletSubmissionAnswer} from '@lib/wallet/engineHost';
import type {WalletPendingTransfer, WalletStore} from '@components/wallet/store';
import type {WalletContextValue} from '@components/wallet/context';
import {compareNanos, shortAddress, walletNftName} from '@components/wallet/format';
import pause from '@helpers/schedulers/pause';
import {hotReloadGuard} from '@lib/solidjs/hotReloadGuardProvider';

/**
 * The send path that screens share: who receives, how much, and the steps around the engine — getting a key onto
 * the device first when it has none, choosing the fee-free delivery when Telegram pays, and showing the
 * transfer as "Sending" until the server finds it.
 */

export type WalletRecipient = {
  /** as it is shown and sent: user-friendly */
  address: string,
  /** a wallet contract is sent to non-bounceable, an unknown contract bounceable */
  bounce: boolean,
  userId?: UserId,
  /** the recipient's wallet key, for an encrypted comment */
  publicKey?: Uint8Array,
  /** the .ton name it was resolved from */
  domain?: string
};

export type WalletSendDraft = {
  recipient: WalletRecipient,
  nanograms: string,
  comment?: string,
  /** private (encrypted) comment */
  encryptComment?: boolean,
  /** a link's own message body (BOC, base64), sent when no comment is written */
  payload?: string,
  /** a link's deadline, unix seconds */
  expiresAt?: number,
  /** Telegram pays the fee, as the screen that showed it decided; left out, the send decides */
  gasless?: boolean,
  /** `nanograms` is the whole balance: everything goes, the network fee taken out of it (iOS) */
  sendAll?: boolean,
  /** the fee quoted for the draft: what a whole-balance transfer delivers is the balance less this */
  fee?: string
};

/** a comment's limit in UTF-8 bytes, private or public (tdesktop kSendCommentMaxBytes, Android) */
export const COMMENT_MAX_BYTES = 960;
/** the field counts down this close to the limit: almost no comment ever shows it (tdesktop kSendCommentWarnBytes) */
export const COMMENT_WARN_BYTES = 50;

export function commentBytes(comment: string) {
  return new TextEncoder().encode(comment).length;
}

/** what is left of the limit for `comment`, below zero past it */
export function commentBytesLeft(comment: string) {
  return COMMENT_MAX_BYTES - commentBytes(comment.trim());
}

/** What a draft hands the recipient: everything but the fee when it sends the whole balance. */
export function getDeliveredNanos(draft: Pick<WalletSendDraft, 'nanograms' | 'sendAll' | 'fee'>) {
  if(!draft.sendAll || !draft.fee) {
    return draft.nanograms;
  }

  const rest = bigInt(draft.nanograms).subtract(bigInt(draft.fee));
  return rest.isNegative() ? '0' : rest.toString();
}

/**
 * Whether `recipient` can read a private comment (tdesktop: private by default, public where no key can be found).
 * A check that could not be made (the chain did not answer) says yes: the engine looks the key up again when it
 * encrypts, and a comment it cannot encrypt is refused, never sent unreadable
 */
export function canEncryptCommentTo(store: WalletStore, recipient: WalletRecipient): Promise<boolean> {
  return store.session.canEncryptCommentFor(store.status(), recipient.address, recipient.publicKey).catch(() => true);
}

/** a send waits this long at most for whether the recipient can read a private comment */
export const COMMENT_PRIVACY_TIMEOUT = 10e3;

/**
 * What a send with a comment meant to be private waits for while `check` (canEncryptCommentTo) is out: a check that
 * hangs is one that could not be made — private, the engine looks the key up itself
 */
export function waitForCommentPrivacy(check: Promise<boolean>): Promise<boolean> {
  return Promise.race([check, pause(COMMENT_PRIVACY_TIMEOUT).then(() => true)]);
}

/** The longest start of `text` that fits `bytes` of UTF-8. */
export function truncateToBytes(text: string, bytes: number) {
  let out = '';
  for(const char of text) {
    if(commentBytes(out + char) > bytes) break;
    out += char;
  }

  return out;
}

/**
 * The wallet's 2FA prompt (iOS: performWalletAuthorizedOperation): a wrong password shakes the field, any other
 * failure closes the prompt for the caller to tell, and a password removed meanwhile is not asked for again
 */
const WALLET_PASSWORD_PROMPT = {shakeOnWrongPassword: true, rejectOtherErrors: true, retryWithoutPassword: true};

/**
 * Makes sure this device can sign. A device that only views the wallet restores the phrase from Telegram's
 * backup (asking for the 2FA password); one that has no backup to restore from cannot, the caller sends the user
 * to type the phrase.
 */
/**
 * `stillWanted`: asked right before the password prompt — a window closing meanwhile (its hide has begun) gets none
 */
export async function ensureWalletKey(
  store: WalletStore,
  passwordDescription: LangPackKey = 'Wallet.Restore.BackupText',
  stillWanted: () => boolean = store.isOpen
): Promise<void> {
  const status = store.status();
  const session = store.session;
  // * the key of an old wallet on this device comes first, as in tdesktop's ladder: its phrase is saved and the
  // * key dropped, then the same action climbs again into whatever the served wallet needs
  const parked = await store.refreshParked();
  if(parked.wallets.length) {
    if(!session.ui?.resolveConflict) {
      throw walletError('WALLET_CONFLICT');
    }

    await session.ui.resolveConflict();
    return ensureWalletKey(store, passwordDescription, stillWanted);
  }

  let mode = await session.getDeviceMode(status);
  if(mode === 'full') {
    return;
  }

  if(mode === 'notRestorable') {
    throw walletError('WALLET_KEY_MISSING');
  }

  if(mode !== 'restorable') {
    throw walletError('WALLET_NOT_READY');
  }

  const {passwordPopup} = await import('@components/popups/password');
  const words = await session.fetchPhraseFromBackup((exportWith) => !stillWanted() ? Promise.reject('closed') : passwordPopup({
    titleLangKey: 'Wallet.Phrase.PasswordTitle',
    descriptionLangKey: passwordDescription,
    button: {langKey: 'Wallet.Continue'},
    callback: exportWith,
    ...WALLET_PASSWORD_PROMPT
  }));

  // * the words leave memory whether the restore took them or not
  try {
    await session.restoreFromWords(words, status);
  } finally {
    words.fill('');
  }

  mode = await store.refreshDeviceMode();
  if(mode !== 'full') {
    throw walletError('WALLET_KEY_MISSING');
  }
}

/**
 * The key comes onto the device before a send is set up, not once it is typed (iOS WalletScreen.openSend, Android
 * makeSureSecretPhraseBackedUpLocally): a device that only views the wallet restores it from Telegram's backup, the
 * 2FA password asked for; one with no backup to restore from goes to typing the phrase. True when the send may go
 * on; a device whose state is not known yet goes on too, and the send finds out itself.
 */
export async function prepareWalletSendKey(wallet: WalletContextValue): Promise<boolean> {
  const store = wallet.store;
  if(await store.refreshDeviceMode().catch((): WalletDeviceMode => 'unknown') === 'full') {
    return true;
  }

  // * asked as the window opens: one closed meanwhile asks nothing
  const stillWanted = () => wallet.shown() && store.isOpen();
  if(!stillWanted()) {
    return false;
  }

  try {
    await ensureWalletKey(store, undefined, stillWanted);
    return true;
  } catch(err) {
    const type = (err as any)?.type;
    if(type === 'WALLET_NOT_READY') return true;
    if(type === 'WALLET_KEY_MISSING') {
      wallet.router.push('restore');
    } else if(!isUserCancel(err)) {
      // * what the restore says when it fails, iOS's alert (finishResolvingSigningAccess)
      import('@components/wallet/alerts').then(({showWalletError}) => showWalletError(err, 'Wallet.Restore.ErrorTitle'));
    }

    return false;
  }
}

/**
 * A send a link or a profile started ends in the recipient's chat: the window closes and the chat opens at its end,
 * where the transfer just went (iOS OpenResolvedUrl sendGrams `completed`: scrollToEndOfHistory; Android returnToChat)
 */
export async function openWalletRecipientChat(wallet: WalletContextValue, peerId: PeerId) {
  wallet.close();
  const appImManager = hotReloadGuard.appImManager;
  await appImManager.setInnerPeer({peerId});
  const chat = appImManager.chat;
  if(chat?.peerId !== peerId) return;
  await chat.setPeerPromise?.catch(() => {});
  // * past the unread ones too, as the button down there goes
  if(appImManager.chat === chat) chat.bubbles.onGoDownClick();
}

/**
 * Runs an action that the server guards with the 2FA password when the account has one
 */
export async function withWalletPassword<T>(description: LangPackKey, action: (password?: InputCheckPasswordSRP) => Promise<T>): Promise<T> {
  const state = await rootScope.managers.passwordManager.getState();
  if(!state.pFlags.has_password) {
    return action();
  }

  const {passwordPopup} = await import('@components/popups/password');
  return passwordPopup({
    titleLangKey: 'Wallet.Phrase.PasswordTitle',
    descriptionLangKey: description,
    button: {langKey: 'Wallet.Continue'},
    callback: action,
    ...WALLET_PASSWORD_PROMPT
  });
}

/**
 * Telegram pays the fee of a transfer that is big enough, while today's free transfers last
 */
export async function isGaslessEligible(store: WalletStore, draft: WalletSendDraft) {
  return (await loadGaslessRule(store, draft.recipient))(draft.nanograms);
}

/**
 * The same, as a rule for any amount to `recipient`: a screen asks once and then knows it as the amount is typed (iOS
 * keeps the gasless info at hand the same way)
 */
export async function loadGaslessRule(store: WalletStore, recipient: WalletRecipient): Promise<(nanograms: string) => boolean> {
  const never = () => false;
  try {
    const info = await rootScope.managers.appWalletManager.getGaslessInfo();
    if(!info?.available || info.left <= 0 || !+info.min_amount || !info.relayer_address) {
      return never;
    }

    const config = store.config();
    let min = config.minNanos;
    for(const value of [config.gaslessMinNanos, String(info.min_amount)]) {
      if(compareNanos(value, min) > 0) min = value;
    }

    // * one's own address pays its fee
    const own = store.status().state?.address;
    if(own && await store.session.isSameAddress(own, recipient.address)) {
      return never;
    }

    return (nanograms) => compareNanos(nanograms, min) >= 0;
  } catch(err) {
    return never;
  }
}

export async function quoteFee(store: WalletStore, draft: WalletSendDraft) {
  const status = store.status();
  // * the engine runs one preview at a time: a stale one (an earlier keystroke, another screen) goes first
  await store.session.cancelPreview(status);
  const preview = await store.session.previewSend(status, {
    destination: draft.recipient.address,
    bounce: draft.recipient.bounce,
    nanograms: draft.nanograms,
    // * the whole balance plus a fee is more than there is: it is emulated the way it goes, the fee out of it
    sendAll: draft.sendAll,
    comment: draft.comment,
    encryptComment: draft.encryptComment,
    payload: draft.payload,
    expiresAt: draft.expiresAt
  });

  return preview.emulation.walletFeesNanograms;
}

/**
 * A refusal, or a send that never left, throws; a transfer the server took, or may have taken, gives its answer. One
 * whose outcome is unknown (`submissionUnknown`) is no error: it shows as sending until the engine's journal settles
 * it, and nothing invites a resend meanwhile.
 */
function settleSendOutcome(outcome: WalletSendOutcome) {
  const answer = outcome.answer;
  if(answer?.outcome === 'rejected') {
    throw walletError(answer.error);
  }

  // * once the server took it the transfer is out, whatever phase the engine ended in
  const phase = outcome.result.phase;
  if(answer?.outcome !== 'accepted' && (phase === 'failed' || phase === 'cancelled' || phase === 'expired')) {
    throw walletError('WALLET_TRANSFER_SEND_FAILED');
  }

  return answer;
}

/**
 * Signs and submits. Resolves with the pending entry shown in the history once the server took the transfer;
 * rejects with the reason when it was refused.
 */
/**
 * The "Sending" row a transfer gets in the history. The server's answer may come after the engine stopped waiting:
 * `onAnswer` settles the row then, or, before the row exists, keeps the answer for `add`.
 */
function createPendingRow(store: WalletStore) {
  let pending: WalletPendingTransfer, lateAnswer: WalletSubmissionAnswer;
  return {
    onAnswer: (answer: WalletSubmissionAnswer) => {
      if(!pending) {
        lateAnswer = answer;
        return;
      }

      if(answer.outcome === 'accepted') store.pending.update(pending.id, {msgHash: answer.sent.msgHash});
      else if(answer.outcome === 'rejected') store.pending.update(pending.id, {failed: true});
    },
    add: (
      outcome: WalletSendOutcome,
      answer: WalletSubmissionAnswer,
      fields: Pick<WalletPendingTransfer, 'nanograms' | 'userId' | 'address' | 'comment' | 'gasless' | 'sendAll' | 'nft'>
    ) => {
      const settled = answer || lateAnswer;
      store.pending.add(pending = {
        ...fields,
        id: outcome.result.operationId,
        date: Date.now(),
        // * an uncertain submission has no receipt yet: it stays "Sending" until the late answer, the engine's
        // * journal or the timeout settles it
        msgHash: settled?.outcome === 'accepted' ? settled.sent.msgHash : undefined,
        failed: settled?.outcome === 'rejected' || undefined,
        draftRandomId: outcome.draftRandomId
      });
      return {pending, accepted: settled?.outcome === 'accepted'};
    }
  };
}

export async function submitWalletTransfer(store: WalletStore, draft: WalletSendDraft): Promise<WalletPendingTransfer> {
  // * a comment has its limit, private or public (tdesktop SendCommentFits): it is said before anything is asked
  // * for, no key or password for a send that cannot go
  if(draft.comment && commentBytesLeft(draft.comment) < 0) {
    throw walletError(draft.encryptComment ? 'WALLET_COMMENT_TOO_LONG' : 'WALLET_PUBLIC_COMMENT_TOO_LONG');
  }

  await ensureWalletKey(store);
  const status = store.status();
  // * "all" takes whatever is there by now: a balance that changed meanwhile is not what the screen offered to send
  if(draft.sendAll && compareNanos(status.state?.balance ?? '0', draft.nanograms) !== 0) {
    throw walletError('WALLET_TRANSFER_SEND_FAILED');
  }

  // * "all" pays its fee out of the balance, so it is never fee-free; a whole balance Telegram pays the fee of is
  // * no "all" but an exact amount, the amount screen decides which (iOS WalletOperations prepareTransfer, tdesktop)
  const gasless = !draft.sendAll && (draft.gasless ?? await isGaslessEligible(store, draft));
  const nanograms = getDeliveredNanos(draft);
  const row = createPendingRow(store);
  const outcome = await store.session.send(status, {
    destination: draft.recipient.address,
    bounce: draft.recipient.bounce,
    nanograms,
    sendAll: draft.sendAll,
    comment: draft.comment,
    encryptComment: draft.encryptComment,
    payload: draft.payload,
    expiresAt: draft.expiresAt,
    recipientPublicKey: draft.recipient.publicKey,
    userId: draft.recipient.userId,
    gasless,
    onAnswer: row.onAnswer
  });

  const answer = settleSendOutcome(outcome);
  const {pending} = row.add(outcome, answer, {
    nanograms,
    userId: draft.recipient.userId,
    address: draft.recipient.address,
    comment: draft.comment,
    gasless: gasless || undefined,
    // * what it delivers is the balance less the fee the chain takes: a row with no receipt settles within that fee
    sendAll: draft.sendAll || undefined
  });

  if(answer?.outcome === 'accepted') {
    toastNew({langPackKey: 'Wallet.Sent', langPackArguments: [shortAddress(draft.recipient.address)]});
  } else if(!answer && outcome.result.phase === 'submissionUnknown') {
    // * it may be out already: the row stays "Sending" until the chain says, and nothing invites a second try (iOS)
    showTransferAlert('Wallet.Transfer.PendingTitle', 'Wallet.Transfer.PendingText');
  }

  return pending;
}

// MARK: Collectibles

export type WalletNftDraft = {
  recipient: WalletRecipient,
  nft: WalletNftItem,
  /** public: a collectible's comment is never encrypted */
  comment?: string
};

function nftSendParams(draft: WalletNftDraft, operationId: string): WalletNftSendParams {
  return {
    operationId,
    nftAddress: draft.nft.address,
    destination: draft.recipient.address,
    bounce: draft.recipient.bounce,
    comment: draft.comment,
    userId: draft.recipient.userId
  };
}

/**
 * The network fee of a collectible's transfer, from a fresh emulation that also checks the wallet still owns it.
 * The send goes with the same `operationId`.
 */
export async function quoteNftFee(store: WalletStore, draft: WalletNftDraft, operationId: string) {
  const status = store.status();
  await store.session.cancelPreview(status);
  const preview = await store.session.previewNftTransfer(status, nftSendParams(draft, operationId));
  return preview.emulation.traceFeesNanograms;
}

/**
 * Signs and submits a collectible's transfer. As in tdesktop it gets a "Sending" row in the history but no local
 * chat message; once the server took it the collectible leaves the grid. Resolves with the row; rejects with the
 * reason when the transfer was refused.
 */
export async function submitNftTransfer(store: WalletStore, draft: WalletNftDraft, operationId: string): Promise<WalletPendingTransfer> {
  await ensureWalletKey(store);
  const row = createPendingRow(store);
  let returned = false, accepted = false;
  const onAccepted = () => {
    if(accepted) return;
    accepted = true;
    store.nfts.remove(draft.nft.address);
    store.history.refreshHead();
    toastNew({
      langPackKey: 'Wallet.Collectible.Sent',
      langPackArguments: [walletNftName(draft.nft), draft.recipient.domain || shortAddress(draft.recipient.address)]
    });
  };

  const outcome = await store.session.sendNft(store.status(), {
    ...nftSendParams(draft, operationId),
    // * an answer after the engine stopped waiting still settles it
    onAnswer: (answer) => {
      row.onAnswer(answer);
      if(returned && answer.outcome === 'accepted') onAccepted();
    }
  });

  returned = true;
  // * the history shows it "Sending" like a Gram transfer, the collectible in place of the amount (tdesktop)
  const {pending, accepted: settled} = row.add(outcome, settleSendOutcome(outcome), {
    nanograms: NFT_TRANSFER_ATTACHED_NANOS,
    userId: draft.recipient.userId,
    address: draft.recipient.address,
    comment: draft.comment,
    nft: draft.nft
  });

  if(settled) {
    onAccepted();
  }

  return pending;
}

/**
 * The text of a send failure, for a toast or a field error
 */
export function getWalletErrorLangKey(error: any) {
  let type = getCommentErrorType(error) || error?.type || error?.message || '';
  // * the engine's own refusals come as its error text
  if(/insufficient wallet balance/i.test(type)) type = 'WALLET_INSUFFICIENT';
  // * a transfer whose outcome is not known yet may still go out: never a "try again"
  else if(/previous submission outcome is unresolved|submission outcome is unknown|already in progress/i.test(type)) type = 'WALLET_SEND_IN_PROGRESS';
  // * the engine says "unavailable" also when the provider did not answer: only that one is worth another try
  else if(/NFT transfer is unavailable/i.test(type) && !/failed to load fresh NFT state/i.test(type)) type = 'WALLET_NFT_UNAVAILABLE';
  else if(/NFT transfer emulation was rejected/i.test(type)) type = 'WALLET_TRANSFER_SEND_FAILED';
  switch(type) {
    case 'WALLET_NFT_UNAVAILABLE': return 'Wallet.Collectible.NotOwned';
    case 'WALLET_NFT_OWN_WALLET': return 'Wallet.Collectible.OwnWallet';
    case 'WALLET_CONFLICT': return 'Wallet.Conflict.Bar';
    case 'WALLET_SEND_IN_PROGRESS': return 'Wallet.Error.InProgress';
    case 'WALLET_INSUFFICIENT': return 'Wallet.Error.Insufficient';
    case 'WALLET_KEY_MISMATCH': return 'Wallet.Error.KeyChanged';
    // * a key update is on its way, or the server has not seen the confirmed one yet
    case 'ROTATION_PENDING':
    case 'WALLET_ROTATION_NOT_FOUND': return 'Wallet.Backup.KeyChanging';
    case 'WALLET_PHRASE_OUTDATED': return 'Wallet.Restore.Outdated';
    case 'WALLET_PHRASE_OTHER_WALLET': return 'Wallet.Restore.OtherWallet';
    case 'WALLET_PHRASE_FOREIGN': return 'Wallet.Restore.Foreign';
    case 'WALLET_PHRASE_INVALID': return 'Wallet.Restore.Invalid';
    case 'WALLET_USER_UNAVAILABLE': return 'Wallet.Error.UserUnavailable';
    case 'WALLET_NAME_NOT_FOUND': return 'Wallet.Error.NameNotFound';
    case 'WALLET_LINK_EXPIRED': return 'Wallet.Error.LinkExpired';
    case 'WALLET_LINK_INVALID': return 'Link.Invalid';
    case 'WALLET_ADDRESS_INVALID':
    case 'WALLET_LINK_UNSUPPORTED': return 'Wallet.Error.InvalidAddress';
    case 'WALLET_TRANSFER_SEND_FAILED':
    case 'WALLET_TRANSFER_DATA_INVALID': return 'Wallet.Error.SendFailed';
    case 'WALLET_COMMENT_TOO_LONG': return 'Wallet.Transfer.CommentTooLongText';
    case 'WALLET_PUBLIC_COMMENT_TOO_LONG': return 'Wallet.Transfer.PublicCommentTooLongText';
    case 'WALLET_COMMENT_UNAVAILABLE': return 'Wallet.Transfer.CommentEncryptionUnavailable';
    case 'WALLET_COMMENT_ENCRYPTION_FAILED': return 'Wallet.Transfer.CommentEncryptionErrorText';
    default: return 'Wallet.Error.Generic';
  }
}

/**
 * A comment that could not go the way it was asked to: too long (960 bytes, private or public, checked before the
 * send; the engine's own limit on the encrypted body), a recipient whose wallet cannot take an encrypted one, or an
 * encryption that failed
 */
function getCommentErrorType(error: any) {
  const type: string = error?.type || error?.message || '';
  if(type === 'WALLET_COMMENT_TOO_LONG' || /encrypted comment exceeds/i.test(type)) return 'WALLET_COMMENT_TOO_LONG';
  if(type === 'WALLET_PUBLIC_COMMENT_TOO_LONG') return type;
  if(/^encrypted comment is unavailable/i.test(type)) return 'WALLET_COMMENT_UNAVAILABLE';
  if(/encrypted comment|recipient public key|peer Ed25519 public key/i.test(type)) return 'WALLET_COMMENT_ENCRYPTION_FAILED';
}

/** An alert with an OK, as iOS says what went wrong with a transfer */
function showTransferAlert(title: LangPackKey, text: LangPackKey) {
  import('@components/wallet/alerts').then(({showWalletAlert}) => showWalletAlert({title, text}));
}

/**
 * Shows why a transfer did not go: what is wrong with its comment in an alert of its own (iOS), the rest as a toast
 */
export function showWalletSendError(error: any) {
  switch(getCommentErrorType(error)) {
    case 'WALLET_COMMENT_TOO_LONG':
      showTransferAlert('Wallet.Transfer.CommentTooLongTitle', 'Wallet.Transfer.CommentTooLongText');
      return;
    case 'WALLET_PUBLIC_COMMENT_TOO_LONG':
      showTransferAlert('Wallet.Transfer.CommentTooLongTitle', 'Wallet.Transfer.PublicCommentTooLongText');
      return;
    case 'WALLET_COMMENT_UNAVAILABLE':
      showTransferAlert('Wallet.Transfer.CommentEncryptionErrorTitle', 'Wallet.Transfer.CommentEncryptionUnavailable');
      return;
    case 'WALLET_COMMENT_ENCRYPTION_FAILED':
      showTransferAlert('Wallet.Transfer.CommentEncryptionErrorTitle', 'Wallet.Transfer.CommentEncryptionErrorText');
      return;
  }

  toastWalletError(error);
}

const TOO_FRESH_REGEXP = /^(?:PASSWORD|SESSION)_TOO_FRESH_(\d+)$/;

/**
 * A password or a session too new to export the phrase: the server says how long until it may. Resolves, once the
 * duration's formatters are in, with what turns such an error into its text (and any other into nothing).
 */
async function loadTooFreshText() {
  const [{default: formatDuration}, {wrapFormattedDuration}] = await Promise.all([
    import('@helpers/formatDuration'),
    import('@components/wrappers/wrapDuration')
  ]);

  return (error: any): [LangPackKey, FormatterArguments] | undefined => {
    const match = String(error?.type || '').match(TOO_FRESH_REGEXP);
    return match ? ['Wallet.Error.TooFresh', [wrapFormattedDuration(formatDuration(+match[1]), true)]] : undefined;
  };
}

/**
 * Shows a wallet failure. A password or a session too new to export the phrase says for how long.
 */
export async function toastWalletError(error: any) {
  if(TOO_FRESH_REGEXP.test(String(error?.type || ''))) {
    const [langPackKey, langPackArguments] = (await loadTooFreshText())(error);
    toastNew({langPackKey, langPackArguments});
    return;
  }

  toastNew({langPackKey: getWalletErrorLangKey(error)});
}

export function isUserCancel(error: any) {
  return !error || error === 'canceled' || error === 'closed' || error?.message === 'WALLET_VAULT_LOCKED';
}

