/*
 * TON Connect: the connect sheet in each of its states, an app's transfer request (with its emulated preview, still
 * emulating, and with a trace that fails), data to sign, and the connected apps. Nothing reaches a dApp or the
 * server: the flows are the views alone, fed made-up requests, and their buttons answer after a moment.
 *
 * Popup modules are imported inside `open()` — see the note in `confirmations.ts`.
 */

import {defineStories} from '../registry';
import {
  walletSandboxAddress,
  walletSandboxManagers,
  walletSandboxOtherAddress,
  walletSandboxTonConnectSessions
} from '../fixtures';
import type {PopupStoryContext} from '../context';
import type {SendPreview} from '@ton/wallet-engine';
import type {TonConnectManifestInfo} from '@lib/wallet/tonConnect';
import type {TonConnectConnectPhase} from '@components/wallet/tonConnect/connectPopup';
import type {LangPackKey} from '@lib/langPack';
import {createSignal} from 'solid-js';
import pause from '@helpers/schedulers/pause';
import {formatTonAddress} from '@lib/wallet/tonAddress';
import bytesToHex from '@helpers/bytes/bytesToHex';
import bytesFromHex from '@helpers/bytes/bytesFromHex';

const INFO: TonConnectManifestInfo = {name: 'Fragment', domain: 'fragment.com', url: 'https://fragment.com'};
/** a contract the app pays: a bounceable address */
const CONTRACT = formatTonAddress({workchain: 0, hash: new Uint8Array(32).fill(0x5a), bounceable: true});

/** the wallet's answers with its connected apps */
function withTonConnect(base: ReturnType<ReturnType<typeof walletSandboxManagers>>) {
  return {
    ...base,
    appWalletManager: {
      ...base.appWalletManager,
      getTonConnectSessions: () => walletSandboxTonConnectSessions,
      getCachedTonConnectSessions: () => walletSandboxTonConnectSessions
    }
  };
}

async function showConnect(phase: TonConnectConnectPhase, notice?: LangPackKey) {
  const [{default: showTonConnectConnectPopup}, {default: rootScope}] = await Promise.all([
    import('@components/wallet/tonConnect/connectPopup'),
    import('@lib/rootScope')
  ]);
  const status = await rootScope.managers.appWalletManager.getStatus();
  const [current] = createSignal(phase);
  const [info] = createSignal(phase === 'confirm' ? INFO : undefined);
  showTonConnectConnectPopup({
    phase: current,
    info,
    proof: true,
    notice: () => notice,
    status,
    onConnect: () => pause(1500)
  });
}

/** a dApp's request as it comes out of its box */
async function parseRequest(method: string, payload: object) {
  const {parseAppRequest} = await import('@lib/wallet/tonConnectWire');
  return parseAppRequest(JSON.stringify({method, params: [JSON.stringify(payload)], id: '42'}), {
    address: walletSandboxAddress,
    now: Math.floor(Date.now() / 1000)
  });
}

function preview(options: {traceSucceeded?: boolean} = {}): SendPreview {
  const action = (kind: string, details: object, succeeded = true): SendPreview['emulation']['actions'][number] => ({
    actionId: 'AAAA' as any,
    kind,
    succeeded,
    accounts: [walletSandboxOtherAddress],
    transactionHashes: [],
    detailsJson: JSON.stringify(details)
  });

  return {
    messages: [],
    validUntil: 0,
    messageBocBase64: '',
    emulation: {
      mcBlockSeqno: 0,
      walletFeesNanograms: '5823100',
      traceFeesNanograms: '9100000',
      transactionCount: 3,
      actions: [
        action('ton_transfer', {source: walletSandboxAddress, destination: walletSandboxOtherAddress, value: '1500000000', comment: 'Order #1042'}),
        action('call_contract', {source: walletSandboxAddress, destination: CONTRACT}, options.traceSucceeded ?? true),
        action('ton_transfer', {source: CONTRACT, destination: walletSandboxAddress, value: '48210000'})
      ],
      transactions: [],
      traceSucceeded: options.traceSucceeded ?? true,
      isIncomplete: false
    }
  };
}

async function showTransfer(previewPromise: Promise<SendPreview>, messages: object[] = [
  {address: walletSandboxOtherAddress, amount: '1500000000', payload: 'te6cckEBAQEADAAAFAAAAABIZWxsbyGVgYQo'},
  {address: CONTRACT, amount: '50000000'}
]) {
  const {default: showTonConnectRequestPopup} = await import('@components/wallet/tonConnect/requestPopup');
  const request = await parseRequest('sendTransaction', {
    valid_until: Math.floor(Date.now() / 1000) + 300,
    messages
  });
  if(request.kind !== 'sendTransaction') return;
  showTonConnectRequestPopup({
    info: INFO,
    request,
    walletAddress: walletSandboxAddress,
    preview: previewPromise,
    onConfirm: () => pause(1500),
    onDecline: () => pause(500)
  });
}

async function showSign(payload: object) {
  const {default: showTonConnectRequestPopup} = await import('@components/wallet/tonConnect/requestPopup');
  const request = await parseRequest('signData', payload);
  if(request.kind !== 'signData') return;
  showTonConnectRequestPopup({
    info: INFO,
    request,
    walletAddress: walletSandboxAddress,
    onConfirm: () => pause(1500),
    onDecline: () => pause(500)
  });
}

/**
 * A dApp on the other side of the server, for the request flow: its key, the request it sealed to the wallet's
 * session key, and the answers the made-up server took. The wallet's key is the derivation of a made-up phrase,
 * laid over the session for the story — the vault is never touched.
 */
const flow: {pending?: any, envelope?: any, dappSecret?: Uint8Array, w?: Uint8Array, responses: Uint8Array[], claims: any[]} = {responses: [], claims: []};

async function setUpRequestFlow(request: object) {
  const [crypto, e2e, {default: WalletSession}, {toRawTonAddress}] = await Promise.all([
    import('@lib/wallet/tonConnectCrypto'),
    import('@lib/calls/e2e/crypto'),
    import('@lib/wallet/walletSession'),
    import('@lib/wallet/tonConnectWire')
  ]);
  await e2e.ensureCryptoReady();
  const seed = await crypto.deriveSigningSeed('abandon ability able about above absent absorb abstract absurd abuse access accident'.split(' '));
  const signingKey = bytesToHex(await crypto.signingPublicKey(seed));
  const dapp = e2e.x25519GenerateKeyPair();
  const nonce = new Uint8Array(16).fill(5);
  const pair = await crypto.deriveSessionKeyPair(seed, dapp.publicKey, nonce);
  const session = {
    ...walletSandboxTonConnectSessions[0],
    dapp_client_id: bytesToHex(dapp.publicKey),
    client_id: bytesToHex(pair.publicKey),
    nonce
  };
  const body = await crypto.sealToPeer(dapp.secretKey, pair.publicKey, new TextEncoder().encode(JSON.stringify(request)));
  flow.envelope = {_: 'tonConnectRequest', session_id: session.id, msg_id: 501, body, expires: Math.floor(Date.now() / 1000) + 300};
  flow.pending = {_: 'wallet.tonConnectPending', session, requests: [flow.envelope]};
  flow.dappSecret = dapp.secretKey;
  flow.w = pair.publicKey;
  flow.responses = [];
  flow.claims = [];

  const walletSession = WalletSession.get();
  const restore = {
    getDeviceMode: walletSession.getDeviceMode,
    withTonConnectSigner: walletSession.withTonConnectSigner,
    previewTonConnect: walletSession.previewTonConnect,
    sendTonConnect: walletSession.sendTonConnect
  };
  walletSession.getDeviceMode = async() => 'full';
  walletSession.withTonConnectSigner = (async(_status: unknown, task: (signer: any) => Promise<unknown>) => task({
    seed: seed.slice(),
    signingKey,
    account: async() => ({address: toRawTonAddress(walletSandboxAddress), network: '-239', walletStateInit: 'te6c', publicKey: signingKey}),
    signProof: async() => new Uint8Array(64)
  })) as any;
  walletSession.previewTonConnect = async() => preview();
  walletSession.sendTonConnect = async() => ({result: {operationId: 'ton-connect:sandbox', messageHash: '' as any, signedBoc: 'te6cSandboxSigned', phase: 'submitted'}});
  // * the dApp's side of the answer, for a script driving the story
  (window as any).tonConnectSandbox = {
    answers: async() => Promise.all(flow.responses.map(async(response) => {
      return JSON.parse(new TextDecoder().decode(await crypto.openFromPeer(flow.dappSecret, flow.w, response)));
    })),
    claims: () => flow.claims
  };

  return () => {
    Object.assign(walletSession, restore);
    delete (window as any).tonConnectSandbox;
  };
}

/** the made-up server: its challenge sealed to the registered key, and whatever it is answered */
function withServer(base: ReturnType<typeof withTonConnect>) {
  return {
    ...base,
    timeManager: {getServerTime: () => Math.floor(Date.now() / 1000)},
    appWalletManager: {
      ...base.appWalletManager,
      tonConnectGetPending: () => flow.pending,
      tonConnectRegisterKey: async(_sessionId: string, clientId: string) => {
        const [crypto, e2e] = await Promise.all([import('@lib/wallet/tonConnectCrypto'), import('@lib/calls/e2e/crypto')]);
        const ephemeral = e2e.x25519GenerateKeyPair();
        const sealed = await crypto.sealToPeer(ephemeral.secretKey, bytesFromHex(clientId), e2e.randomBytes(32));
        const challenge = new Uint8Array(104);
        challenge.set(ephemeral.publicKey, 0);
        challenge.set(sealed, 32);
        return {_: 'wallet.tonConnectChallenge', challenge, event_id: '1'};
      },
      tonConnectClaimRequest: (options: any) => {
        flow.claims.push({...options, challengeAnswer: undefined});
        return true;
      },
      tonConnectSubmitResponse: (options: {body: Uint8Array}) => {
        flow.responses.push(options.body);
        return true;
      }
    }
  };
}

const SIGN_TEXT = 'Sign in to Fragment\n\nBy signing this message you confirm that you own this wallet. This is not a ' +
  'transaction and costs nothing.\n\nNonce: 6f1c2b9e-0d41-4a5c-9a3e-2f7b8c1d4e5f\nIssued at: 2026-10-17T10:00:00Z\n' +
  'Expires at: 2026-10-17T10:15:00Z\n\nIf you did not request this, close this window. Keep your secret phrase to ' +
  'yourself: no app ever needs it, and Telegram will never ask you for it.';

defineStories('Wallet', [
  {
    id: 'wallet/tonConnect/connect',
    fixtureOnly: true,
    title: 'Wallet: connect an app',
    managers: (ctx: PopupStoryContext) => withTonConnect(walletSandboxManagers()(ctx)),
    open: () => showConnect('confirm')
  },
  {
    // * the manifest has not come yet: Connect stays busy
    id: 'wallet/tonConnect/connectLoading',
    fixtureOnly: true,
    title: 'Wallet: connect an app, loading its manifest',
    managers: (ctx: PopupStoryContext) => withTonConnect(walletSandboxManagers()(ctx)),
    open: () => showConnect('loading')
  },
  {
    id: 'wallet/tonConnect/connectInvalid',
    fixtureOnly: true,
    title: 'Wallet: connect an app with an invalid manifest',
    managers: (ctx: PopupStoryContext) => withTonConnect(walletSandboxManagers()(ctx)),
    open: () => showConnect('notice', 'Wallet.Connect.ManifestInvalid')
  },
  {
    // * this device holds no key of the wallet
    id: 'wallet/tonConnect/connectRestore',
    fixtureOnly: true,
    title: 'Wallet: connect an app without the key',
    managers: (ctx: PopupStoryContext) => withTonConnect(walletSandboxManagers()(ctx)),
    open: () => showConnect('restore')
  },
  {
    id: 'wallet/tonConnect/transfer',
    fixtureOnly: true,
    title: 'Wallet: an app requests a transfer',
    managers: (ctx: PopupStoryContext) => withTonConnect(walletSandboxManagers()(ctx)),
    open: () => showTransfer(Promise.resolve(preview()))
  },
  {
    // * the emulation still runs: no fee yet, Confirm waits
    id: 'wallet/tonConnect/transferLoading',
    fixtureOnly: true,
    title: 'Wallet: an app requests a transfer, emulating',
    managers: (ctx: PopupStoryContext) => withTonConnect(walletSandboxManagers()(ctx)),
    open: () => showTransfer(new Promise<never>(() => {}))
  },
  {
    // * every digit of an amount as long as there are Grams: it fits a narrow sheet, rounded never
    id: 'wallet/tonConnect/transferLongAmount',
    fixtureOnly: true,
    title: 'Wallet: an app requests a transfer of a long amount',
    managers: (ctx: PopupStoryContext) => withTonConnect(walletSandboxManagers()(ctx)),
    open: () => showTransfer(Promise.resolve(preview()), [{address: walletSandboxOtherAddress, amount: '5000000000123456789'}])
  },
  {
    // * part of the trace fails: said so, and Confirm stays off
    id: 'wallet/tonConnect/transferTraceFailed',
    fixtureOnly: true,
    title: 'Wallet: an app requests a transfer that would fail',
    managers: (ctx: PopupStoryContext) => withTonConnect(walletSandboxManagers()(ctx)),
    open: () => showTransfer(Promise.resolve(preview({traceSucceeded: false})))
  },
  {
    id: 'wallet/tonConnect/signText',
    fixtureOnly: true,
    title: 'Wallet: an app asks to sign text',
    managers: (ctx: PopupStoryContext) => withTonConnect(walletSandboxManagers()(ctx)),
    open: () => showSign({type: 'text', text: SIGN_TEXT})
  },
  {
    id: 'wallet/tonConnect/signBinary',
    fixtureOnly: true,
    title: 'Wallet: an app asks to sign bytes',
    managers: (ctx: PopupStoryContext) => withTonConnect(walletSandboxManagers()(ctx)),
    open: () => showSign({type: 'binary', bytes: 'AAEC/f7/'})
  },
  {
    id: 'wallet/tonConnect/apps',
    fixtureOnly: true,
    title: 'Wallet: connected apps',
    managers: (ctx: PopupStoryContext) => withTonConnect(walletSandboxManagers()(ctx)),
    open: async() => {
      const {default: showWalletPopup} = await import('@components/wallet');
      showWalletPopup({screen: 'apps'});
    }
  },
  {
    // * the whole flow from a dApp's link, on a device that holds no key of the wallet: the sheet offers the restore
    id: 'wallet/tonConnect/linkNoKey',
    fixtureOnly: true,
    title: 'Wallet: a dApp\'s connect link, no key here',
    managers: (ctx: PopupStoryContext) => withTonConnect(walletSandboxManagers()(ctx)),
    open: async() => {
      const {openTonConnectLink} = await import('@components/wallet/tonConnect');
      const request = JSON.stringify({manifestUrl: 'https://fragment.com/tonconnect-manifest.json', items: [{name: 'ton_addr'}]});
      openTonConnectLink('tc://?v=2&id=' + 'ab'.repeat(32) + '&r=' + encodeURIComponent(request) + '&ret=none');
    }
  },
  {
    // * the whole flow from a dApp's link with the key here: the sheet waits for the manifest the server fetches
    // * (asked for again after a moment), then asks. The key itself is not in the sandbox: Connect fails at it
    id: 'wallet/tonConnect/linkFlow',
    fixtureOnly: true,
    title: 'Wallet: a dApp\'s connect link, the manifest arriving',
    managers: (ctx: PopupStoryContext) => {
      const base = withTonConnect(walletSandboxManagers()(ctx));
      const session = {...walletSandboxTonConnectSessions[0], pFlags: {pending: true as const}, client_id: undefined as string, manifest: undefined as any};
      return {
        ...base,
        appWalletManager: {
          ...base.appWalletManager,
          getTonConnectOwnershipDomain: () => 'wallet.telegram.org',
          tonConnectCreateSession: () => session,
          tonConnectGetPending: () => ({_: 'wallet.tonConnectPending', session: walletSandboxTonConnectSessions[0] && {...session, manifest: walletSandboxTonConnectSessions[0].manifest}, requests: [] as any[]})
        }
      };
    },
    open: async() => {
      const [{openTonConnectLink}, {default: WalletSession}] = await Promise.all([
        import('@components/wallet/tonConnect'),
        import('@lib/wallet/walletSession')
      ]);
      const session = WalletSession.get();
      const getDeviceMode = session.getDeviceMode;
      session.getDeviceMode = async() => 'full';
      const request = JSON.stringify({manifestUrl: 'https://fragment.com/tonconnect-manifest.json', items: [{name: 'ton_addr'}, {name: 'ton_proof', payload: 'p'}]});
      await openTonConnectLink('https://t.me/sendgrams?startapp=tonconnect-v__2-id__' + 'ab'.repeat(32) + '-r__' + encodeURIComponent(request).replace(/[-._~!'()*]/g, (char) => '%' + char.charCodeAt(0).toString(16).toUpperCase()).replace(/%/g, '--'));
      return () => session.getDeviceMode = getDeviceMode;
    }
  },
  {
    // * the whole request flow from its message in the service chat: read with the session's key, previewed,
    // * claimed and answered — against a made-up dApp and server, with a made-up key laid over the session
    id: 'wallet/tonConnect/requestFlow',
    fixtureOnly: true,
    title: 'Wallet: an app\'s request, opened from its message',
    managers: (ctx: PopupStoryContext) => withServer(withTonConnect(walletSandboxManagers()(ctx))),
    open: async() => {
      const destination = formatTonAddress({workchain: 0, hash: new Uint8Array(32).fill(0x33), bounceable: true});
      const cleanup = await setUpRequestFlow({
        method: 'sendTransaction',
        params: [JSON.stringify({messages: [{address: destination, amount: '1500000000'}]})],
        id: '77'
      });
      const {openTonConnectRequestMessage} = await import('@components/wallet/tonConnect');
      openTonConnectRequestMessage(flow.envelope.session_id, flow.envelope.msg_id, flow.envelope.expires);
      return cleanup;
    }
  },
  {
    // * the wallet's menu offers the connected apps while there are any
    id: 'wallet/tonConnect/menu',
    fixtureOnly: true,
    title: 'Wallet: the menu with connected apps',
    managers: (ctx: PopupStoryContext) => withTonConnect(walletSandboxManagers()(ctx)),
    open: async() => {
      const {default: showWalletPopup} = await import('@components/wallet');
      await showWalletPopup();
      await pause(1500);
      document.querySelector<HTMLElement>('.popup.active .popup-header .btn-menu-toggle')?.click();
    }
  },
  {
    id: 'wallet/tonConnect/appInfo',
    fixtureOnly: true,
    title: 'Wallet: a connected app',
    managers: (ctx: PopupStoryContext) => withTonConnect(walletSandboxManagers()(ctx)),
    open: async() => {
      const [{showTonConnectAppPopup}, {default: rootScope}] = await Promise.all([
        import('@components/wallet/tonConnect/appsScreen'),
        import('@lib/rootScope')
      ]);
      showTonConnectAppPopup({session: walletSandboxTonConnectSessions[0], status: await rootScope.managers.appWalletManager.getStatus()});
    }
  }
]);

// The sandbox reloads on an edit anyway (watchForEdits). Accepting here keeps an edit of a popup this story imports
// from climbing through the story to the app's root once the sandbox has been opened on the dev server.
if(import.meta.hot) import.meta.hot.accept();
