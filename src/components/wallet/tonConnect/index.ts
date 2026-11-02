/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {createSignal} from 'solid-js';
import type {TonConnectSession} from '@layer';
import type {WalletStatus, WalletTonConnectRequestAction} from '@appManagers/appWalletManager';
import type {LangPackKey} from '@lib/langPack';
import WalletSession from '@lib/wallet/walletSession';
import {
  answerTonConnectConnect,
  answerTonConnectRequest,
  checkTonConnectManifest,
  createTonConnectSession,
  disconnectTonConnectSessions,
  findTonConnectRequest,
  getStoredTonConnectReply,
  getTonConnectRequestKey,
  isTonConnectRequestSilent,
  isTonConnectSessionActive,
  openTonConnectRequest,
  previewTonConnectRequest,
  retryTonConnectReplies,
  tonConnectFailure,
  TonConnectLoadedRequest,
  TonConnectManifestInfo
} from '@lib/wallet/tonConnect';
import {parseTonConnectUrl, TonConnectErrorCode, TonConnectLink} from '@lib/wallet/tonConnectWire';
import createWalletSessionUi from '@components/wallet/vaultPrompts';
import {isUserCancel} from '@components/wallet/send';
import {toastWallet} from '@components/wallet/alerts';
import {toastNew} from '@components/toast';
import {getTonConnectFailureText, showTonConnectFailure} from '@components/wallet/tonConnect/parts';
import showTonConnectConnectPopup, {TonConnectConnectPhase} from '@components/wallet/tonConnect/connectPopup';
import showTonConnectRequestPopup from '@components/wallet/tonConnect/requestPopup';
import rootScope from '@lib/rootScope';
import wrapEmojiText from '@lib/richTextProcessor/wrapEmojiText';
import {bindActiveWindowListener, getAppWindow} from '@helpers/appWindow';
import {hotEffect, hotListen} from '@helpers/hotModule';

/**
 * TON Connect's entry points in the app: a dApp's link, a request arriving in the service chat (shown as it comes,
 * iOS and tdesktop — in a tab on screen, or once the tab is back), a click on its message, and the wallet window
 * opening. One interaction at a time in a tab (iOS): a link or a click while one is up is dropped, an arriving request
 * waits its turn.
 */

/** the manifest comes as an update a moment after the session; asked for again meanwhile, given up after 30 s */
const MANIFEST_POLL_INTERVAL = 1500;
const MANIFEST_TIMEOUT = 30e3;

let busy = false;
/** the request on screen, by its key */
let current: string;
/** requests that arrived while another one was up or the tab was away */
const queued: WalletTonConnectRequestAction[] = [];
/** sessions the server asked the wallet to close, waiting for its key */
const pendingDisconnects: Set<string> = new Set();

function setIdle() {
  busy = false;
  current = undefined;
  queueMicrotask(() => {
    showNextQueued();
    // * the server's closings that came while a sheet was up: done now, if the key is at hand
    finishPendingDisconnects().catch(() => {});
  });
}

/** now by the server's clock, which a request's times are in: a device's own may run ahead or behind */
function getServerTime() {
  return rootScope.managers.timeManager.getServerTime();
}

/** an arriving request: shown when nothing else is, a dApp's disconnect answered without asking (tdesktop) */
export async function queueTonConnectRequest(action: WalletTonConnectRequestAction) {
  if(action.accepted || action.declined || action.expires <= await getServerTime()) {
    return;
  }

  const key = getTonConnectRequestKey(action.sessionId, action.msgId);
  if(key === current || queued.some((item) => getTonConnectRequestKey(item.sessionId, item.msgId) === key)) {
    return;
  }

  if(action.topic === 'disconnect') {
    answerSilently(action);
    return;
  }

  queued.push(action);
  showNextQueued();
}

async function showNextQueued() {
  // * the app's window: the tab's, or the Document PiP one the app moved to
  const canShow = () => !busy && getAppWindow().document.visibilityState === 'visible';
  if(!queued.length || !canShow()) return;
  const now = await getServerTime();
  // * asked again: another request may have taken the tab meanwhile
  if(!canShow()) return;
  let next: WalletTonConnectRequestAction;
  while((next = queued.shift()) && next.expires <= now);
  if(next) {
    openRequest({sessionId: next.sessionId, msgId: next.msgId}, true);
  }
}

hotEffect(import.meta.hot, () => bindActiveWindowListener((win) => win.document, 'visibilitychange', showNextQueued));
hotListen(import.meta.hot, rootScope, 'wallet_tonconnect_request', (action) => {
  if(!action.accepted && !action.declined) return;
  const key = getTonConnectRequestKey(action.sessionId, action.msgId);
  const index = queued.findIndex((item) => getTonConnectRequestKey(item.sessionId, item.msgId) === key);
  if(index !== -1) queued.splice(index, 1);
});

/** what needs no question, done only with the key at hand already: nobody is asked for the passcode for it */
async function canSignSilently(session: WalletSession) {
  if(!session.vault.isUnlocked() && !(await session.vault.unlockSilently().catch(() => false))) {
    return;
  }

  const status = await session.managers.appWalletManager.getStatus();
  if(!status.state || await session.getDeviceMode(status).catch(() => 'unknown') !== 'full') {
    return;
  }

  return status;
}

async function answerSilently(action: WalletTonConnectRequestAction) {
  const wallet = WalletSession.get();
  try {
    const status = await canSignSilently(wallet);
    if(!status) return;
    const found = await findTonConnectRequest({sessionId: action.sessionId, msgId: action.msgId});
    if(!found || getStoredTonConnectReply(found.session.id, found.envelope.msg_id)) return;
    const loaded = await openTonConnectRequest(status, found.session, found.envelope);
    if(isTonConnectRequestSilent(loaded)) {
      await answerTonConnectRequest(status, loaded, true);
      refreshSessions(wallet);
    }
  } catch(err) {}
}

hotListen(import.meta.hot, rootScope, 'wallet_tonconnect_pending_disconnect', (ids) => {
  ids.forEach((id) => pendingDisconnects.add(id));
  finishPendingDisconnects();
});

/** the wallet as the server serves it, and whether this device holds its key; nothing when there is no wallet */
async function prepare(quiet?: boolean): Promise<{status: WalletStatus, canSign: boolean, wallet: WalletSession} | undefined> {
  const session = WalletSession.get();
  session.ui ??= createWalletSessionUi();
  const status = await session.managers.appWalletManager.getStatus();
  if(status.presence !== 'ready' || !status.state) {
    if(!quiet) toastNew({langPackKey: 'Wallet.Connect.Unavailable'});
    return;
  }

  const mode = await session.getDeviceMode(status).catch(() => 'unknown');
  return {status, canSign: mode === 'full', wallet: session};
}

function openRestore() {
  import('@components/wallet').then(({default: showWalletPopup}) => showWalletPopup({screen: 'restore', params: {}}));
}

/** the vault was closed by the user, or the passcode prompt left: nothing to say */
function isSilent(err: any) {
  return isUserCancel(err) || err?.name === 'WalletVaultLockedError';
}

function failureText(err: any): LangPackKey {
  const failure = tonConnectFailure(err);
  return failure ? getTonConnectFailureText(failure) : 'Wallet.Connect.Error';
}

// MARK: Links

/** a dApp's link: a connect request, or a wake-up for a request it just sent */
export async function openTonConnectLink(url: string) {
  const link = parseTonConnectUrl(url);
  if(!link) {
    toastNew({langPackKey: 'Wallet.Connect.InvalidLink'});
    return;
  }

  if(link.request) {
    return connect(link);
  }

  return openRequest({dappClientId: link.clientId, traceId: link.traceId});
}

async function connect(link: TonConnectLink) {
  if(busy) return;
  busy = true;
  let ready: Awaited<ReturnType<typeof prepare>>;
  try {
    ready = await prepare();
  } catch(err) {
    setIdle();
    toastNew({langPackKey: 'Wallet.Connect.Error'});
    return;
  }

  if(!ready) {
    setIdle();
    return;
  }

  const [phase, setPhase] = createSignal<TonConnectConnectPhase>(ready.canSign ? 'loading' : 'restore');
  const [info, setInfo] = createSignal<TonConnectManifestInfo>();
  const [notice, setNotice] = createSignal<LangPackKey>();
  const [error, setError] = createSignal<LangPackKey>();
  let session: TonConnectSession, connected = false, connecting = false, closed = false, manifestError: number, pollTimer: number;
  const proof = link.request.proofPayload !== undefined;
  const managers = ready.wallet.managers;
  // * known before the manifest is judged: a proof for its domain is never signed, and unknown means refused
  const ownershipDomain = proof ? managers.appWalletManager.getTonConnectOwnershipDomain().catch((): string => undefined) : undefined;

  const stop = () => {
    clearTimeout(pollTimer);
    rootScope.removeEventListener('wallet_tonconnect_session', onSession);
  };

  const showNotice = (key: LangPackKey) => {
    stop();
    setNotice(key);
    setPhase('notice');
  };

  const evaluate = async() => {
    if(closed || phase() !== 'loading') return;
    if(session.pFlags.closed || session.pFlags.closing) {
      showNotice('Wallet.Connect.Expired');
    } else if(isTonConnectSessionActive(session)) {
      showNotice('Wallet.Connect.HandledElsewhere');
    } else if(session.manifest_error) {
      manifestError = session.manifest_error === TonConnectErrorCode.MANIFEST_CONTENT ? TonConnectErrorCode.MANIFEST_CONTENT : TonConnectErrorCode.MANIFEST_NOT_FOUND;
      showNotice(manifestError === TonConnectErrorCode.MANIFEST_CONTENT ? 'Wallet.Connect.ManifestInvalid' : 'Wallet.Connect.ManifestMissing');
    } else if(session.manifest) {
      const domain = proof ? await ownershipDomain : undefined;
      if(closed || phase() !== 'loading') return;
      if(proof && domain === undefined) {
        showNotice('Wallet.Connect.Error');
        return;
      }

      try {
        setInfo(checkTonConnectManifest(session, link, domain));
        // * the session's updates are still heard: connected elsewhere, it ends the question
        clearTimeout(pollTimer);
        setPhase('confirm');
      } catch(err) {
        manifestError = TonConnectErrorCode.MANIFEST_CONTENT;
        showNotice(failureText(err));
      }
    }
  };

  const onSession = (value: TonConnectSession) => {
    if(!session || String(value.id) !== String(session.id)) return;
    session = value;
    // * connected or closed by another device while the sheet asked: it has nothing left to ask
    if(phase() === 'confirm' && !connecting && !connected && (isTonConnectSessionActive(value) || value.pFlags.closed || value.pFlags.closing)) {
      showNotice(isTonConnectSessionActive(value) ? 'Wallet.Connect.HandledElsewhere' : 'Wallet.Connect.Expired');
      return;
    }

    evaluate();
  };

  const startedAt = Date.now();
  const poll = () => {
    pollTimer = window.setTimeout(async() => {
      if(closed || phase() !== 'loading') return;
      if(Date.now() - startedAt > MANIFEST_TIMEOUT) {
        manifestError = TonConnectErrorCode.MANIFEST_NOT_FOUND;
        showNotice('Wallet.Connect.ManifestMissing');
        return;
      }

      try {
        const pending = await managers.appWalletManager.tonConnectGetPending({sessionId: session.id});
        onSession(pending.session);
      } catch(err) {}
      poll();
    }, MANIFEST_POLL_INTERVAL);
  };

  showTonConnectConnectPopup({
    phase,
    info,
    proof,
    notice,
    error,
    status: ready.status,
    onConnect: async() => {
      setError(undefined);
      connecting = true;
      try {
        await answerTonConnectConnect({status: ready.status, session, link, approve: true});
      } catch(err) {
        if(isSilent(err)) throw err;
        const failure = tonConnectFailure(err);
        if(failure === 'handledElsewhere' || failure === 'keyMismatch' || failure === 'expired' || failure === 'invalidManifest') {
          showNotice(failureText(err));
        } else {
          setError(failure ? failureText(err) : 'Wallet.Connect.Error');
        }

        throw err;
      } finally {
        connecting = false;
        // * the sheet was closed while the approval went: the tab is free once its outcome is known
        if(closed) setIdle();
      }

      connected = true;
      const name = info()?.name;
      // * the app's name reads in its own direction, apart from the words around it
      const nameText = document.createElement('span');
      nameText.dir = 'auto';
      if(name) nameText.append(wrapEmojiText(name));
      toastWallet('Wallet.Connect.SuccessTitle', 'Wallet.Connect.SuccessText', [name ? nameText : '']);
    },
    onRestore: openRestore,
    onClose: () => {
      closed = true;
      stop();
      // * an approval on its way is not answered against: it decides, and holds the tab until it did
      if(connecting) return;
      setIdle();
      // * declined after the key was at hand: the app hears of it; before that nothing is sent (iOS)
      if(session && !connected && (phase() === 'confirm' || manifestError) && WalletSession.get().vault.isUnlocked()) {
        answerTonConnectConnect({status: ready.status, session, link, approve: false, errorCode: manifestError}).catch(() => {});
      }
    }
  });

  if(!ready.canSign) {
    return;
  }

  try {
    session = await createTonConnectSession(link);
  } catch(err) {
    if(!closed) showNotice(failureText(err));
    return;
  }

  if(closed) return;
  rootScope.addEventListener('wallet_tonconnect_session', onSession);
  evaluate();
  poll();
}

// MARK: Requests

/** a click on a request's message in the service chat */
export async function openTonConnectRequestMessage(sessionId: string, msgId: number, expires: number) {
  if(expires <= await getServerTime()) {
    toastNew({langPackKey: 'Wallet.Request.Expired'});
    return;
  }

  return openRequest({sessionId, msgId});
}

/** `auto`: the request arrived by itself — nothing is said of what cannot be shown, the user did not ask */
async function openRequest(lookup: Parameters<typeof findTonConnectRequest>[0], auto?: boolean) {
  if(busy) return;
  busy = true;
  if('msgId' in lookup) current = getTonConnectRequestKey(lookup.sessionId, lookup.msgId);
  let shown = false;
  try {
    const ready = auto ? await prepare(true).catch((): undefined => undefined) : await prepare();
    if(!ready) return;
    if(!ready.canSign) {
      if(!auto) {
        toastNew({langPackKey: 'Wallet.Connect.Restore'});
        openRestore();
      }

      return;
    }

    await retryTonConnectReplies().catch(() => {});
    const found = await findTonConnectRequest(lookup);
    if(!found) {
      if(!auto) toastNew({langPackKey: 'Wallet.Connect.Unavailable'});
      return;
    }

    current = getTonConnectRequestKey(found.session.id, found.envelope.msg_id);
    // * this device answered it already: what is kept goes, or it may have gone (a transfer caught mid-way)
    const stored = getStoredTonConnectReply(found.session.id, found.envelope.msg_id);
    if(stored) {
      if(!auto) showTonConnectFailure(stored.phase !== 'executing' ? 'bridgeUnavailable' : 'outcomeUnknown');
      return;
    }

    const loaded = await openTonConnectRequest(ready.status, found.session, found.envelope);
    if(isTonConnectRequestSilent(loaded)) {
      // * nothing to ask: an invalid request or one of a session that is gone gets its error, a disconnect its answer
      await answerTonConnectRequest(ready.status, loaded, true);
      if(loaded.request.kind === 'disconnect') refreshSessions(ready.wallet);
      return;
    }

    const now = await getServerTime();
    shown = true;
    showRequest(ready.status, loaded, now);
  } catch(err) {
    if(!isSilent(err) && !auto) {
      const failure = tonConnectFailure(err);
      // * an expired request or one answered elsewhere says so; a failure to read it says it is unavailable
      toastNew({langPackKey: failure ? getTonConnectFailureText(failure) : 'Wallet.Connect.Unavailable'});
    }
  } finally {
    if(!shown) setIdle();
  }
}

/** `now`: the server's time, which the request's are in */
function showRequest(status: WalletStatus, loaded: TonConnectLoadedRequest, now: number) {
  const {session, envelope, request} = loaded;
  if(request.kind !== 'sendTransaction' && request.kind !== 'signData') {
    setIdle();
    return;
  }

  const key = getTonConnectRequestKey(session.id, envelope.msg_id);
  // * `answering`: this tab's own answer is on its way, and the server's edit of the message is its echo
  let answered = false, answering = false, closed = false;
  // * the sheet goes with the request: answered elsewhere, its session gone, or its time up
  const onRequest = (action: WalletTonConnectRequestAction) => {
    if(!answered && !answering && getTonConnectRequestKey(action.sessionId, action.msgId) === key && (action.accepted || action.declined)) {
      answered = true;
      toastNew({langPackKey: 'Wallet.Connect.HandledElsewhere'});
      popup.close();
    }
  };
  const onSession = (value: TonConnectSession) => {
    if(!answered && !answering && String(value.id) === String(session.id) && (value.pFlags.closed || value.pFlags.closing)) {
      answered = true;
      toastNew({langPackKey: 'Wallet.Connect.Unavailable'});
      popup.close();
    }
  };
  rootScope.addEventListener('wallet_tonconnect_request', onRequest);
  rootScope.addEventListener('wallet_tonconnect_session', onSession);

  const answer = async(approve: boolean) => {
    answering = true;
    try {
      const result = await answerTonConnectRequest(status, loaded, approve);
      answered = true;
      if(result.failure === 'failed' && request.kind === 'signData') {
        toastNew({langPackKey: 'Wallet.Connect.Failed'});
      } else if(result.failure) {
        showTonConnectFailure(result.failure);
      } else if(result.approved) {
        toastNew({langPackKey: request.kind === 'signData' ? 'Wallet.Sign.Done' : 'Wallet.Request.Sent'});
      }
    } catch(err) {
      if(isSilent(err)) throw err;
      const failure = tonConnectFailure(err);
      showTonConnectFailure(failure || 'unavailable');
      // * a request that is gone takes its sheet along; anything else may be tried again
      if(failure === 'handledElsewhere' || failure === 'expired' || failure === 'outcomeUnknown' || failure === 'bridgeUnavailable') {
        answered = true;
        return;
      }

      throw err;
    } finally {
      answering = false;
      // * the sheet was closed while the answer went: the next request waits for its outcome
      if(closed) setIdle();
    }
  };

  const closesAt = Math.min(envelope.expires, request.kind === 'sendTransaction' && request.validUntil || Infinity);
  const popup = showTonConnectRequestPopup({
    info: loaded.info,
    request,
    walletAddress: loaded.address,
    preview: request.kind === 'sendTransaction' ? previewTonConnectRequest(status, loaded) : undefined,
    // * by the server's clock, which the request's times are in
    closesAt: Date.now() + (closesAt - now) * 1000,
    onConfirm: () => answer(true),
    onDecline: () => answer(false),
    onExpired: () => {
      if(!answered) toastNew({langPackKey: 'Wallet.Request.Expired'});
      answered = true;
    },
    onClose: () => {
      closed = true;
      if(!answering) setIdle();
      rootScope.removeEventListener('wallet_tonconnect_request', onRequest);
      rootScope.removeEventListener('wallet_tonconnect_session', onSession);
      if(request.kind === 'sendTransaction') {
        WalletSession.get().cancelPreview(status);
      }
    }
  });
}

// MARK: Sessions

function refreshSessions(wallet: WalletSession) {
  return wallet.managers.appWalletManager.getTonConnectSessions(true).then((sessions) => sessions || [], (): TonConnectSession[] => []);
}

/**
 * Closes what the server asked the wallet to close — only with a key at hand already: nobody is asked for the
 * passcode for it. What is left waits for the next time the wallet is unlocked.
 */
async function finishPendingDisconnects() {
  if(!pendingDisconnects.size || busy) return;
  const wallet = WalletSession.get();
  const status = await canSignSilently(wallet);
  if(!status) {
    return;
  }

  const sessions = (await refreshSessions(wallet)).filter((item) => pendingDisconnects.has(String(item.id)));
  pendingDisconnects.clear();
  if(sessions.length) {
    await disconnectTonConnectSessions(status, sessions).catch(() => {});
  }
}

/**
 * Requests a connected app sent while nobody was looking — their message read elsewhere, or come when no tab was
 * open — wait their turn as arriving ones do (iOS refreshTonConnectPending). One session after another.
 */
async function queuePendingRequests(wallet: WalletSession, sessions: TonConnectSession[]) {
  for(const session of sessions) {
    if(session.pFlags.pending || session.pFlags.closing || session.pFlags.closed) continue;
    const pending = await wallet.managers.appWalletManager.tonConnectGetPending({sessionId: session.id}).catch((): undefined => undefined);
    for(const request of pending?.requests || []) {
      if(String(request.session_id) !== String(session.id)) continue;
      queueTonConnectRequest({
        sessionId: String(session.id),
        msgId: request.msg_id,
        expires: request.expires,
        topic: request.topic,
        accepted: false,
        declined: false
      });
    }
  }
}

/**
 * The wallet window opened: answers this device prepared and could not deliver go, the session list is read again,
 * sessions the server is closing get the wallet's goodbye if the key is at hand, and requests left unanswered are
 * queued
 */
export async function refreshTonConnect() {
  const wallet = WalletSession.get();
  await retryTonConnectReplies().catch(() => {});
  const sessions = await refreshSessions(wallet);
  sessions.filter((item) => item.pFlags.closing).forEach((item) => pendingDisconnects.add(String(item.id)));
  await finishPendingDisconnects().catch(() => {});
  queuePendingRequests(wallet, sessions).catch(() => {});
  return sessions;
}

