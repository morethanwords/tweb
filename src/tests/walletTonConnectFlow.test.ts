/*
 * TON Connect through the server, end to end against a made-up dApp and server: the connect event the dApp opens,
 * the proof guard for the wallet-ownership domain, a request opened, claimed and answered (signed data checked
 * against its digest), a decline, a transfer's answer, and an answer kept and sent again after a failure. The keys are
 * the real derivation of a known phrase; nothing reaches a chain or a server.
 */

import bytesToHex from '@helpers/bytes/bytesToHex';
import bytesFromHex from '@helpers/bytes/bytesFromHex';
import base64ToBytes from '@helpers/string/base64ToBytes';
import {deriveSessionKeyPair, deriveSigningSeed, openFromPeer, sealToPeer, signDataDigest, signDigest, signingPublicKey} from '@lib/wallet/tonConnectCrypto';
import {ed25519Verify, ensureCryptoReady, x25519DerivePublic} from '@lib/calls/e2e/crypto';
import {formatTonAddress} from '@lib/wallet/tonAddress';
import {toRawTonAddress} from '@lib/wallet/tonConnectWire';
import type {TonConnectSession} from '@layer';

const fake = vi.hoisted(() => {
  const NOW = 1_800_000_000;
  const managers = {
    timeManager: {getServerTime: vi.fn(async() => NOW)},
    appWalletManager: {
      getTonConnectOwnershipDomain: vi.fn(async() => 'wallet.telegram.org'),
      getTonConnectSessions: vi.fn(async(): Promise<any[]> => []),
      tonConnectRegisterKey: vi.fn(),
      tonConnectSubmitConnectResult: vi.fn(),
      tonConnectClaimRequest: vi.fn(),
      tonConnectSubmitResponse: vi.fn(),
      tonConnectCloseSession: vi.fn(async() => true),
      tonConnectNextEventId: vi.fn(async() => '11')
    }
  };

  // * the wallet of the account the flow started on: its managers and its replies' owner
  const session = {
    managers,
    vault: {ownerId: 1},
    withTonConnectSigner: vi.fn(),
    sendTonConnect: vi.fn(),
    previewTonConnect: vi.fn()
  };

  return {NOW, managers, session};
});

vi.mock('@lib/rootScope', () => ({default: {myId: 1, managers: fake.managers}}));
vi.mock('@lib/wallet/walletSession', () => ({
  default: {get: () => fake.session},
  isSendOutcomeUnknown: () => false,
  walletError: (type: string) => Object.assign(new Error(type), {type}),
  withTabsLock: (_name: string, _ifAvailable: boolean, task: () => Promise<any>) => task()
}));

import {
  answerTonConnectConnect,
  answerTonConnectRequest,
  getStoredTonConnectReply,
  openTonConnectRequest,
  retryTonConnectReplies
} from '@lib/wallet/tonConnect';
import sodium from 'libsodium-wrappers';

const PHRASE = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about ' +
  'zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo wrong';
const WALLET_HASH = new Uint8Array(32).fill(0x11);
const WALLET_ADDRESS = formatTonAddress({workchain: 0, hash: WALLET_HASH, bounceable: false});
const NONCE = new Uint8Array(16).fill(7);

let seed: Uint8Array, signingKey: Uint8Array, dapp: {publicKey: Uint8Array, privateKey: Uint8Array}, w: Uint8Array;
const status = () => ({presence: 'ready' as const, date: 0, state: {_: 'walletState' as const, pFlags: {}, address: WALLET_ADDRESS, public_key: signingKey, balance: '0'}});

function makeSession(patch: Partial<TonConnectSession> = {}): TonConnectSession {
  return {
    _: 'tonConnectSession',
    pFlags: {},
    id: '77',
    dapp_client_id: bytesToHex(dapp.publicKey),
    client_id: bytesToHex(w),
    nonce: NONCE,
    manifest: {_: 'tonConnectManifest', url: 'https://app.example', name: 'App'},
    date: fake.NOW,
    ...patch
  };
}

/** the server's challenge: a fresh answer sealed to the registered key under an ephemeral one */
function serveChallenge() {
  const answers: string[] = [];
  fake.managers.appWalletManager.tonConnectRegisterKey.mockImplementation(async(_id: string, clientId: string) => {
    const ephemeral = sodium.crypto_box_keypair();
    const answer = sodium.randombytes_buf(32);
    answers.push(bytesToHex(answer));
    const sealed = await sealToPeer(ephemeral.privateKey, bytesFromHex(clientId), answer);
    const challenge = new Uint8Array(104);
    challenge.set(ephemeral.publicKey, 0);
    challenge.set(sealed, 32);
    return {_: 'wallet.tonConnectChallenge', challenge, event_id: '5'};
  });
  return answers;
}

async function dappOpens(body: Uint8Array) {
  return JSON.parse(new TextDecoder().decode(await openFromPeer(dapp.privateKey, w, body)));
}

async function dappSends(request: object, msgId = 3) {
  const body = await sealToPeer(dapp.privateKey, w, new TextEncoder().encode(JSON.stringify(request)));
  return {_: 'tonConnectRequest' as const, session_id: '77', msg_id: msgId, body, expires: fake.NOW + 300, trace_id: 'trace-1'};
}

beforeAll(async() => {
  await ensureCryptoReady();
  seed = await deriveSigningSeed(new TextEncoder().encode(PHRASE));
  signingKey = await signingPublicKey(seed);
  const pair = sodium.crypto_box_keypair();
  dapp = {publicKey: pair.publicKey, privateKey: pair.privateKey};
  w = (await deriveSessionKeyPair(seed, dapp.publicKey, NONCE)).publicKey;
});

beforeEach(() => {
  localStorage.clear();
  Object.values(fake.managers.appWalletManager).forEach((mock) => mock.mockClear());
  [fake.session.withTonConnectSigner, fake.session.sendTonConnect, fake.session.previewTonConnect].forEach((mock) => mock.mockReset());
  fake.session.withTonConnectSigner.mockImplementation(async(_status: unknown, task: (signer: any) => Promise<unknown>) => task({
    seed: seed.slice(),
    signingKey: bytesToHex(signingKey),
    account: async() => ({address: toRawTonAddress(WALLET_ADDRESS), network: '-239', walletStateInit: 'te6c', publicKey: bytesToHex(signingKey)}),
    signProof: async() => signDigest(seed, new Uint8Array(32))
  }));
  fake.managers.appWalletManager.tonConnectClaimRequest.mockResolvedValue(true);
  fake.managers.appWalletManager.tonConnectSubmitResponse.mockResolvedValue(true);
  fake.managers.appWalletManager.tonConnectSubmitConnectResult.mockResolvedValue(true);
});

describe('TON Connect connect', () => {
  const link = (manifestUrl: string) => ({
    clientId: '',
    traceId: 'trace-0',
    request: {manifestUrl, items: ['ton_addr', 'ton_proof'], proofPayload: 'payload-1'}
  });

  it('answers the challenge and sends the connect event the dApp opens', async() => {
    const answers = serveChallenge();
    const submitted: any[] = [];
    fake.managers.appWalletManager.tonConnectSubmitConnectResult.mockImplementation(async(options: any) => {
      submitted.push({...options, challengeAnswer: bytesToHex(options.challengeAnswer)});
      return true;
    });

    await answerTonConnectConnect({
      status: status(),
      session: makeSession({client_id: undefined, pFlags: {pending: true}}),
      link: link('https://app.example/tonconnect-manifest.json'),
      approve: true
    });

    expect(fake.managers.appWalletManager.tonConnectRegisterKey).toHaveBeenCalledWith('77', bytesToHex(w));
    expect(submitted).toHaveLength(1);
    expect(submitted[0]).toMatchObject({sessionId: '77', challengeAnswer: answers[0], error: false, traceId: 'trace-0'});
    const event = await dappOpens(submitted[0].body);
    expect(event.event).toBe('connect');
    expect(event.id).toBe(5);
    expect(event.payload.items[0]).toEqual({
      name: 'ton_addr',
      address: toRawTonAddress(WALLET_ADDRESS),
      network: '-239',
      walletStateInit: 'te6c',
      publicKey: bytesToHex(signingKey)
    });
    expect(event.payload.items[1].proof).toMatchObject({timestamp: fake.NOW, domain: {lengthBytes: 11, value: 'app.example'}, payload: 'payload-1'});
    expect(event.payload.device.features[1]).toEqual({name: 'SignData', types: ['text', 'binary']});
  });

  it('registers the key again once when the server no longer takes its challenge', async() => {
    const answers = serveChallenge();
    const submit = fake.managers.appWalletManager.tonConnectSubmitConnectResult;
    // * the answer is wiped once sent: it is read as it goes
    const sent: string[] = [];
    submit.mockImplementationOnce(async(options: any) => {
      sent.push(bytesToHex(options.challengeAnswer));
      throw {type: 'TONCONNECT_CHALLENGE_INVALID'};
    }).mockImplementationOnce(async(options: any) => {
      sent.push(bytesToHex(options.challengeAnswer));
      return true;
    });
    await answerTonConnectConnect({
      status: status(),
      session: makeSession({client_id: undefined, pFlags: {pending: true}}),
      link: link('https://app.example/tonconnect-manifest.json'),
      approve: true
    });

    expect(fake.managers.appWalletManager.tonConnectRegisterKey).toHaveBeenCalledTimes(2);
    expect(sent).toEqual(answers);

    // * once only: a second refusal is the answer
    submit.mockClear().mockRejectedValue({type: 'TONCONNECT_CHALLENGE_INVALID'});
    await expect(answerTonConnectConnect({
      status: status(),
      session: makeSession({client_id: undefined, pFlags: {pending: true}}),
      link: link('https://app.example/tonconnect-manifest.json'),
      approve: true
    })).rejects.toBeTruthy();
    expect(submit).toHaveBeenCalledTimes(2);
    submit.mockReset();
  });

  it('never signs a proof for the wallet-ownership domain or telegram.org, and sends nothing', async() => {
    serveChallenge();
    for(const url of ['https://wallet.telegram.org', 'https://telegram.org']) {
      await expect(answerTonConnectConnect({
        status: status(),
        session: makeSession({client_id: undefined, pFlags: {pending: true}, manifest: {_: 'tonConnectManifest', url, name: 'Not Telegram'}}),
        link: link(url + '/tonconnect-manifest.json'),
        approve: true
      })).rejects.toMatchObject({failure: 'invalidManifest'});
    }

    expect(fake.session.withTonConnectSigner).not.toHaveBeenCalled();
    expect(fake.managers.appWalletManager.tonConnectRegisterKey).not.toHaveBeenCalled();
  });

  it('refuses a manifest of another host than the link names', async() => {
    await expect(answerTonConnectConnect({
      status: status(),
      session: makeSession({client_id: undefined, pFlags: {pending: true}, manifest: {_: 'tonConnectManifest', url: 'https://other.example', name: 'App'}}),
      link: link('https://app.example/tonconnect-manifest.json'),
      approve: true
    })).rejects.toMatchObject({failure: 'invalidManifest'});
  });

  it('declines with connect_error under the registered key', async() => {
    serveChallenge();
    await answerTonConnectConnect({
      status: status(),
      session: makeSession({client_id: undefined, pFlags: {pending: true}}),
      link: link('https://app.example/tonconnect-manifest.json'),
      approve: false
    });

    const options = fake.managers.appWalletManager.tonConnectSubmitConnectResult.mock.calls[0][0];
    expect(options.error).toBe(true);
    expect(await dappOpens(options.body)).toEqual({event: 'connect_error', id: 5, payload: {code: 300, message: 'User declined the request'}});
  });
});

describe('TON Connect requests', () => {
  it('opens, claims and answers signData with a signature over its digest', async() => {
    const answers = serveChallenge();
    const envelope = await dappSends({method: 'signData', params: [JSON.stringify({type: 'text', text: 'Hello'})], id: '9'});
    const loaded = await openTonConnectRequest(status(), makeSession(), envelope);
    expect(loaded.request.kind).toBe('signData');

    const result = await answerTonConnectRequest(status(), loaded, true);
    expect(result).toEqual({approved: true, failure: undefined});
    const claim = fake.managers.appWalletManager.tonConnectClaimRequest.mock.calls[0][0];
    expect(claim).toMatchObject({sessionId: '77', msgId: 3, appRequestId: '9', declined: false});
    expect(answers).toHaveLength(1);

    const submit = fake.managers.appWalletManager.tonConnectSubmitResponse.mock.calls[0][0];
    expect(submit).toMatchObject({sessionId: '77', msgId: 3, traceId: 'trace-1'});
    const response = await dappOpens(submit.body);
    expect(response.id).toBe('9');
    expect(response.result).toMatchObject({
      address: '0:' + bytesToHex(WALLET_HASH),
      timestamp: fake.NOW,
      domain: 'app.example',
      payload: {type: 'text', text: 'Hello'}
    });
    const digest = await signDataDigest({workchain: 0, hash: WALLET_HASH}, 'app.example', fake.NOW, {type: 'text', text: 'Hello'});
    expect(ed25519Verify(signingKey, digest, base64ToBytes(response.result.signature))).toBe(true);
    expect(getStoredTonConnectReply('77', 3)).toBeUndefined();
  });

  it('claims a request again with a fresh challenge when the first one went stale', async() => {
    serveChallenge();
    const envelope = await dappSends({method: 'signData', params: [JSON.stringify({type: 'text', text: 'Hi'})], id: '20'});
    const claim = fake.managers.appWalletManager.tonConnectClaimRequest;
    claim.mockRejectedValueOnce({type: 'TONCONNECT_CHALLENGE_INVALID'});
    const loaded = await openTonConnectRequest(status(), makeSession(), envelope);
    expect(await answerTonConnectRequest(status(), loaded, true)).toEqual({approved: true, failure: undefined});
    expect(claim).toHaveBeenCalledTimes(2);
  });

  it('claims a decline as declined and answers 300', async() => {
    serveChallenge();
    const envelope = await dappSends({method: 'signData', params: [JSON.stringify({type: 'binary', bytes: 'AAEC'})], id: '10'});
    const loaded = await openTonConnectRequest(status(), makeSession(), envelope);
    expect(await answerTonConnectRequest(status(), loaded, false)).toEqual({approved: false, failure: undefined});
    expect(fake.managers.appWalletManager.tonConnectClaimRequest.mock.calls[0][0].declined).toBe(true);
    const response = await dappOpens(fake.managers.appWalletManager.tonConnectSubmitResponse.mock.calls[0][0].body);
    expect(response).toEqual({error: {code: 300, message: 'User declined the request'}, id: '10'});
  });

  it('answers a request for another network with its error, claimed as declined', async() => {
    serveChallenge();
    const envelope = await dappSends({method: 'signData', params: [JSON.stringify({type: 'text', text: 'x', network: '-3'})], id: '12'});
    const loaded = await openTonConnectRequest(status(), makeSession(), envelope);
    expect(loaded.request.kind).toBe('invalid');
    await answerTonConnectRequest(status(), loaded, true);
    expect(fake.managers.appWalletManager.tonConnectClaimRequest.mock.calls[0][0].declined).toBe(true);
    const response = await dappOpens(fake.managers.appWalletManager.tonConnectSubmitResponse.mock.calls[0][0].body);
    expect(response.error.code).toBe(1);
  });

  it('sends a transfer under its request\'s operation and answers with the signed BoC', async() => {
    serveChallenge();
    const destination = formatTonAddress({workchain: 0, hash: new Uint8Array(32).fill(0x22), bounceable: true});
    const envelope = await dappSends({
      method: 'sendTransaction',
      params: [JSON.stringify({valid_until: fake.NOW + 120, messages: [{address: destination, amount: '1000'}]})],
      id: '13'
    });
    fake.session.sendTonConnect.mockResolvedValue({result: {operationId: 'x', messageHash: 'h', signedBoc: 'te6cSigned', phase: 'submitted'}});
    const loaded = await openTonConnectRequest(status(), makeSession(), envelope);
    expect(await answerTonConnectRequest(status(), loaded, true)).toEqual({approved: true, failure: undefined});
    expect(fake.session.sendTonConnect.mock.calls[0][1]).toBe('ton-connect:77:3');
    expect(fake.session.sendTonConnect.mock.calls[0][2]).toMatchObject({expiration: {kind: 'exact', unixTimestamp: fake.NOW + 120}});
    expect(await dappOpens(fake.managers.appWalletManager.tonConnectSubmitResponse.mock.calls[0][0].body)).toEqual({result: 'te6cSigned', id: '13'});
  });

  it('keeps an answer the server did not take, sends it again later and never signs twice', async() => {
    serveChallenge();
    const envelope = await dappSends({method: 'signData', params: [JSON.stringify({type: 'text', text: 'Again'})], id: '14'});
    const loaded = await openTonConnectRequest(status(), makeSession(), envelope);
    fake.managers.appWalletManager.tonConnectSubmitResponse.mockRejectedValueOnce({type: 'RPC_CALL_FAIL'});
    await expect(answerTonConnectRequest(status(), loaded, true)).rejects.toBeTruthy();
    const stored = getStoredTonConnectReply('77', 3);
    expect(stored?.phase).toBe('prepared');

    const signerCalls = fake.session.withTonConnectSigner.mock.calls.length;
    await retryTonConnectReplies();
    expect(fake.managers.appWalletManager.tonConnectSubmitResponse).toHaveBeenCalledTimes(2);
    const [first, second] = fake.managers.appWalletManager.tonConnectSubmitResponse.mock.calls.map(([options]) => bytesToHex(options.body));
    expect(second).toBe(first);
    expect(fake.session.withTonConnectSigner.mock.calls.length).toBe(signerCalls);
    expect(getStoredTonConnectReply('77', 3)).toBeUndefined();
  });

  it('closes a session the dApp disconnected only once its answer went, and keeps trying until the close holds', async() => {
    const envelope = await dappSends({method: 'disconnect', params: [], id: '16'});
    const loaded = await openTonConnectRequest(status(), makeSession(), envelope);
    const close = fake.managers.appWalletManager.tonConnectCloseSession;
    close.mockRejectedValueOnce({type: 'RPC_CALL_FAIL'});
    await expect(answerTonConnectRequest(status(), loaded, true)).rejects.toBeTruthy();
    expect(getStoredTonConnectReply('77', 3)?.phase).toBe('closing');

    // * the answer is not sent twice: only the close is tried again, and a close the server refused stays to do
    close.mockResolvedValueOnce(false);
    await retryTonConnectReplies();
    expect(getStoredTonConnectReply('77', 3)?.phase).toBe('closing');
    await retryTonConnectReplies();
    expect(fake.managers.appWalletManager.tonConnectSubmitResponse).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalledTimes(3);
    expect(getStoredTonConnectReply('77', 3)).toBeUndefined();
  });

  it('keeps an answer by the server\'s clock, not a device clock that runs ahead', async() => {
    const envelope = await dappSends({method: 'signData', params: [JSON.stringify({type: 'text', text: 'Later'})], id: '17'});
    const loaded = await openTonConnectRequest(status(), makeSession(), envelope);
    fake.managers.appWalletManager.tonConnectSubmitResponse.mockRejectedValueOnce({type: 'RPC_CALL_FAIL'});
    await expect(answerTonConnectRequest(status(), loaded, true)).rejects.toBeTruthy();

    vi.spyOn(Date, 'now').mockReturnValue((fake.NOW + 3600) * 1000);
    try {
      await retryTonConnectReplies();
    } finally {
      vi.mocked(Date.now).mockRestore();
    }

    expect(fake.managers.appWalletManager.tonConnectSubmitResponse).toHaveBeenCalledTimes(2);
    expect(getStoredTonConnectReply('77', 3)).toBeUndefined();
  });

  it('answers a transfer that may have gone with what was signed, and warns of it again when the answer is resent', async() => {
    serveChallenge();
    const destination = formatTonAddress({workchain: 0, hash: new Uint8Array(32).fill(0x22), bounceable: true});
    const envelope = await dappSends({
      method: 'sendTransaction',
      params: [JSON.stringify({valid_until: fake.NOW + 120, messages: [{address: destination, amount: '1000'}]})],
      id: '18'
    });
    fake.session.sendTonConnect.mockResolvedValue({result: {operationId: 'x', messageHash: undefined, signedBoc: 'te6cMaybe', phase: 'submissionUnknown'}});
    fake.managers.appWalletManager.tonConnectSubmitResponse.mockRejectedValueOnce({type: 'RPC_CALL_FAIL'});
    const loaded = await openTonConnectRequest(status(), makeSession(), envelope);
    await expect(answerTonConnectRequest(status(), loaded, true)).rejects.toBeTruthy();
    expect(await answerTonConnectRequest(status(), loaded, true)).toEqual({approved: false, failure: 'outcomeUnknown'});
    expect(fake.session.sendTonConnect).toHaveBeenCalledTimes(1);
    expect(await dappOpens(fake.managers.appWalletManager.tonConnectSubmitResponse.mock.calls[1][0].body)).toEqual({result: 'te6cMaybe', id: '18'});
  });

  it('drops the close of a session the server already closed', async() => {
    const envelope = await dappSends({method: 'disconnect', params: [], id: '19'});
    const loaded = await openTonConnectRequest(status(), makeSession(), envelope);
    fake.managers.appWalletManager.tonConnectCloseSession.mockRejectedValueOnce({type: 'TONCONNECT_SESSION_CLOSED'});
    await answerTonConnectRequest(status(), loaded, true);
    expect(getStoredTonConnectReply('77', 3)).toBeUndefined();
  });

  it('refuses to answer a session another key registered', async() => {
    const envelope = await dappSends({method: 'disconnect', params: [], id: '15'});
    const other = bytesToHex(x25519DerivePublic(new Uint8Array(32).fill(9)));
    await expect(openTonConnectRequest(status(), makeSession({client_id: other}), envelope)).rejects.toMatchObject({failure: 'keyMismatch'});
  });
});
