/*
 * The e2e media transform must fail CLOSED in both directions.
 *
 * Inbound: a frame we cannot turn into authenticated plaintext must never reach
 * the decoder. Forwarding it is not merely "the user hears noise" — a plaintext
 * Opus/VP8 frame the relay makes up decodes perfectly well, so passing
 * undecryptable frames through hands a malicious or compromised SFU a
 * media-injection channel into a call the UI labels end-to-end encrypted. That
 * defeats the per-frame Ed25519 sender signature, whose whole purpose is that
 * unsigned frames are not rendered. Reference: libtgcalls
 * GroupInstanceCustomImpl.cpp:1494 forwards to the sink only on a non-empty
 * transform result, with no else branch.
 *
 * Outbound: a frame we cannot encrypt must never reach the wire.
 *
 * These drive the worker's real `onrtctransform` handler through a
 * ReadableStream → WritableStream pair, the same shape the browser wires up.
 */

import {beforeAll, describe, expect, it, vi} from 'vitest';

// The worker posts responses/events with `self.postMessage(msg)` (one arg).
// jsdom's window.postMessage requires a targetOrigin, so stub it before the
// module under test can call it.
const posted: any[] = [];
vi.stubGlobal('postMessage', (msg: any) => {
  posted.push(msg);
});

import {E2eCall} from '@lib/calls/e2e/call';
import {ensureCryptoReady} from '@lib/calls/e2e/crypto';
import {PrivateKey} from '@lib/calls/e2e/keys';
import {localToServer} from '@lib/calls/e2e/tl';
import {PERM_ADD_USERS, PERM_REMOVE_USERS} from '@lib/calls/e2e/tlTypes';

// Imported for its side effects: installs the `message` handler + onrtctransform.
import '@lib/calls/e2e/encryptWorker';

const ALICE_ID = BigInt(94001); // us
const BOB_ID = BigInt(94002); // a mapped remote sender
const ALICE_SEED = new Uint8Array(32).fill(0xa1);
const MAPPED_SSRC = 0x11223344;
const UNMAPPED_SSRC = 0x55667788;

let nextId = 1;

function request(kind: string, args?: any): Promise<any> {
  const id = nextId++;
  self.dispatchEvent(new MessageEvent('message', {data: args === undefined ? {kind, id} : {kind, id, args}}));
  return vi.waitFor(() => {
    const response = posted.find((m) => m?.id === id && (m.kind === 'ok' || m.kind === 'err'));
    if(!response) throw new Error(`no response for ${kind}`);
    if(response.kind === 'err') throw new Error(`worker error: ${response.message}`);
    return response.result;
  });
}

interface PumpResult {
  forwarded: boolean;
  bytes?: Uint8Array;
}

// Push exactly one frame through the worker's transform and report whether it
// came out the other side. `getMetadata` is omitted entirely when `ssrc` is
// null, matching a frame whose metadata the browser didn't supply.
async function pump(
  direction: 'send' | 'recv',
  bytes: Uint8Array,
  ssrc: number | null | undefined
): Promise<PumpResult> {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  const frame: any = {data: buffer};
  if(ssrc !== null) {
    frame.getMetadata = () => (ssrc === undefined ? {} : {synchronizationSource: ssrc});
  }

  const result: PumpResult = {forwarded: false};
  let settle: () => void;
  const finished = new Promise<void>((resolve) => {
    settle = resolve;
  });

  const readable = new ReadableStream({
    start(controller) {
      controller.enqueue(frame);
      controller.close();
    }
  });
  const writable = new WritableStream({
    write(outFrame: any) {
      result.forwarded = true;
      result.bytes = new Uint8Array(outFrame.data);
    },
    close: () => settle(),
    abort: () => settle()
  });

  (self as any).onrtctransform({
    transformer: {readable, writable, options: {direction, channelId: 0, kind: 'audio'}}
  });

  await finished;
  return result;
}

describe('e2e media transform — fails closed', () => {
  beforeAll(async() => {
    await ensureCryptoReady();

    // Hydrate the worker on a real one-participant chain so `call` is live and
    // the failure paths below are the ONLY reason a frame gets dropped.
    const aliceKey = PrivateKey.fromSeed(ALICE_SEED);
    const zeroBlock = localToServer(await E2eCall.createZeroBlock(aliceKey, {
      participants: [{
        userId: ALICE_ID,
        publicKey: aliceKey.publicKeyBytes,
        canAddUsers: true,
        canRemoveUsers: true,
        version: 0
      }],
      externalPermissions: PERM_ADD_USERS | PERM_REMOVE_USERS
    }));

    await request('init', {userId: ALICE_ID, privateSeed: ALICE_SEED, lastBlockServer: zeroBlock});
    await request('setSsrcUsers', {entries: [[MAPPED_SSRC, BOB_ID]]});
  });

  it('drops an inbound frame on an SSRC the participant map does not know', async() => {
    // The relay's easiest injection route: pick any SSRC we were never told
    // about and put a well-formed plaintext Opus frame on it.
    const {forwarded} = await pump('recv', new Uint8Array([0x78, 0x9c, 0x01, 0x02]), UNMAPPED_SSRC);
    expect(forwarded).toBe(false);
  });

  it('drops an inbound frame that fails to decrypt on a known SSRC', async() => {
    // Same injection with a mapped SSRC — no epoch matches, no signature
    // verifies, so nothing may be rendered.
    const {forwarded} = await pump('recv', new Uint8Array(64).fill(0x41), MAPPED_SSRC);
    expect(forwarded).toBe(false);
  });

  it('drops an inbound frame whose metadata carries no SSRC', async() => {
    const {forwarded} = await pump('recv', new Uint8Array([1, 2, 3, 4]), undefined);
    expect(forwarded).toBe(false);
  });

  it('drops an inbound frame with no metadata at all', async() => {
    const {forwarded} = await pump('recv', new Uint8Array([1, 2, 3, 4]), null);
    expect(forwarded).toBe(false);
  });

  it('encrypts an outbound frame rather than passing the plaintext through', async() => {
    const plaintext = new Uint8Array([9, 8, 7, 6, 5]);
    const {forwarded, bytes} = await pump('send', plaintext, null);
    expect(forwarded).toBe(true);
    // Whatever leaves must not be the plaintext we handed in.
    expect(Array.from(bytes!)).not.toEqual(Array.from(plaintext));
    expect(bytes!.length).toBeGreaterThan(plaintext.length);
  });

  it('drops frames in BOTH directions once the call is gone', async() => {
    await request('destroy');

    expect((await pump('recv', new Uint8Array([1, 2, 3, 4]), MAPPED_SSRC)).forwarded).toBe(false);
    // Outbound especially: no call, no key, so this could only leave as plaintext.
    expect((await pump('send', new Uint8Array([1, 2, 3, 4]), null)).forwarded).toBe(false);
  });
});
