/*
 * After the receive transform drops a video frame (fail-closed), it asks the
 * sender for a keyframe — at most once a second — and keeps asking on the
 * authenticated delta frames that follow until a keyframe gets through. The
 * dropped frames themselves stay dropped.
 *
 * Drives the worker's real `onrtctransform` with a transformer whose readable
 * this test feeds one frame at a time. A frame without `data` passes through
 * the transform untouched, so one is sent behind every real frame as a probe:
 * when it comes out, the frame before it has been fully handled.
 */

import {afterEach, beforeAll, describe, expect, it, vi} from 'vitest';

// The worker posts with `self.postMessage(msg)` (one arg); jsdom's needs a
// targetOrigin.
const posted: any[] = [];
vi.stubGlobal('postMessage', (msg: any) => {
  posted.push(msg);
});

import {E2eCall} from '../call';
import {ensureCryptoReady} from '../crypto';
import {PrivateKey} from '../keys';
import {localToServer} from '../tl';
import {GroupParticipant, PERM_ADD_USERS, PERM_REMOVE_USERS} from '../tlTypes';

// Imported for its side effects: installs the `message` handler + onrtctransform.
import '../encrypt.worker';

const ALICE_ID = BigInt(95001); // the worker's user
const BOB_ID = BigInt(95002); // a remote sender in the call
const ALICE_SEED = new Uint8Array(32).fill(0xb1);
const BOB_SEED = new Uint8Array(32).fill(0xb2);
const BOB_SSRC = 0x0a0b0c0d;

let nextId = 1;
function request(kind: string, args?: any): Promise<any> {
  const id = nextId++;
  self.dispatchEvent(new MessageEvent('message', {data: {kind, id, args}}));
  return vi.waitFor(() => {
    const response = posted.find((m) => m?.id === id && (m.kind === 'ok' || m.kind === 'err'));
    if(!response) throw new Error(`no response for ${kind}`);
    if(response.kind === 'err') throw new Error(`worker error: ${response.message}`);
    return response.result;
  });
}

function participant(userId: bigint, key: PrivateKey): GroupParticipant {
  return {userId, publicKey: key.publicKeyBytes, canAddUsers: true, canRemoveUsers: true, version: 0};
}

interface Harness {
  // Feed one frame and resolve once the transform is done with it.
  push(frame: any): Promise<void>;
  forwarded: any[];
  sendKeyFrameRequest: ReturnType<typeof vi.fn> | undefined;
}

function attachTransform(options: {direction: 'send' | 'recv'; kind: 'audio' | 'video'}, withKeyFrameRequest = true): Harness {
  let input: ReadableStreamDefaultController<any>;
  const readable = new ReadableStream({
    start(controller) {
      input = controller;
    }
  });
  const forwarded: any[] = [];
  let probeOut: () => void;
  const writable = new WritableStream({
    write(frame: any) {
      if(frame.probe) probeOut();
      else forwarded.push(frame);
    }
  });
  const sendKeyFrameRequest = withKeyFrameRequest ? vi.fn(() => Promise.resolve()) : undefined;
  const transformer: any = {readable, writable, options: {...options, channelId: 0}};
  if(sendKeyFrameRequest) transformer.sendKeyFrameRequest = sendKeyFrameRequest;
  (self as any).onrtctransform({transformer});

  return {
    forwarded,
    sendKeyFrameRequest,
    push: (frame) => new Promise<void>((resolve) => {
      probeOut = resolve;
      input.enqueue(frame);
      input.enqueue({probe: true});
    })
  };
}

function wireFrame(bytes: Uint8Array, extra: Record<string, unknown> = {}): any {
  const data = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(data).set(bytes);
  return {data, getMetadata: () => ({synchronizationSource: BOB_SSRC}), ...extra};
}

// VP8: the payload header's lowest bit is 0 on a keyframe, 1 on a delta frame;
// the codec header stays in the clear (10 bytes on a keyframe, 1 on a delta).
const DELTA = new Uint8Array([0x01, 0x22, 0x33, 0x44, 0x55, 0x66]);
const KEYFRAME = new Uint8Array([0x00, 0x9d, 0x01, 0x2a, 0x80, 0x02, 0xe0, 0x01, 0x00, 0x11, 0x22, 0x33]);

describe('video receive transform — keyframe requests after a drop', () => {
  let bobCall: E2eCall;
  let now = 0;
  const encryptFromBob = async(plain: Uint8Array) =>
    wireFrame(await bobCall.encrypt(0, plain, plain === KEYFRAME ? 10 : 1));
  const garbage = () => wireFrame(new Uint8Array(80).fill(0x41));

  beforeAll(async() => {
    await ensureCryptoReady();
    const alice = PrivateKey.fromSeed(ALICE_SEED.slice());
    const bob = PrivateKey.fromSeed(BOB_SEED.slice());
    const zero = await E2eCall.createZeroBlock(alice, {
      participants: [participant(ALICE_ID, alice)],
      externalPermissions: PERM_ADD_USERS | PERM_REMOVE_USERS
    });
    const selfAdd = await E2eCall.createSelfAddBlock(bob, zero, participant(BOB_ID, bob));
    bobCall = await E2eCall.create(BOB_ID, bob, selfAdd);

    await request('init', {userId: ALICE_ID, privateSeed: ALICE_SEED.slice(), lastBlockServer: localToServer(selfAdd)});
    await request('setSsrcUsers', {entries: [[BOB_SSRC, BOB_ID]]});
    vi.spyOn(performance, 'now').mockImplementation(() => now);
  });

  afterEach(() => {
    now += 60_000;
  });

  it('asks for a keyframe on a drop, at most once a second, and never forwards the dropped frame', async() => {
    const t = attachTransform({direction: 'recv', kind: 'video'});
    const start = now;

    await t.push(garbage());
    expect(t.sendKeyFrameRequest).toHaveBeenCalledTimes(1);

    now = start + 400;
    await t.push(garbage());
    now = start + 999;
    await t.push(garbage());
    expect(t.sendKeyFrameRequest).toHaveBeenCalledTimes(1);

    now = start + 1000;
    await t.push(garbage());
    expect(t.sendKeyFrameRequest).toHaveBeenCalledTimes(2);
    expect(t.forwarded).toHaveLength(0);
  });

  it('backs off to one request per 10 s from a sender it never decrypts', async() => {
    const t = attachTransform({direction: 'recv', kind: 'video'});
    const start = now;
    const requestsAt: number[] = [];
    for(let ms = 0; ms <= 40_000; ms += 250) {
      now = start + ms;
      const before = t.sendKeyFrameRequest.mock.calls.length;
      await t.push(garbage());
      if(t.sendKeyFrameRequest.mock.calls.length > before) requestsAt.push(ms);
    }

    // 1 s, then doubling, capped at 10 s.
    expect(requestsAt).toEqual([0, 1000, 3000, 7000, 15000, 25000, 35000]);
  });

  it('asks at the first pace again once a keyframe got through', async() => {
    const t = attachTransform({direction: 'recv', kind: 'video'});
    const start = now;
    for(const ms of [0, 1000, 3000]) {
      now = start + ms;
      await t.push(garbage());
    }
    expect(t.sendKeyFrameRequest).toHaveBeenCalledTimes(3);

    now = start + 3100;
    await t.push(await encryptFromBob(KEYFRAME));
    now = start + 3200;
    await t.push(garbage());
    now = start + 4200;
    await t.push(garbage());

    expect(t.sendKeyFrameRequest).toHaveBeenCalledTimes(5);
  });

  it('keeps asking on authenticated delta frames until a keyframe arrives, then stops', async() => {
    const t = attachTransform({direction: 'recv', kind: 'video'});
    const start = now;

    await t.push(garbage());
    expect(t.sendKeyFrameRequest).toHaveBeenCalledTimes(1);

    // Decryptable again, but the decoder has nothing to apply deltas to.
    now = start + 300;
    await t.push(await encryptFromBob(DELTA));
    expect(t.sendKeyFrameRequest).toHaveBeenCalledTimes(1); // throttled
    now = start + 1300;
    await t.push(await encryptFromBob(DELTA));
    expect(t.sendKeyFrameRequest).toHaveBeenCalledTimes(2);
    expect(t.forwarded).toHaveLength(2);
    expect(Array.from(new Uint8Array(t.forwarded[1].data))).toEqual(Array.from(DELTA));

    now = start + 1500;
    await t.push(await encryptFromBob(KEYFRAME));
    now = start + 5000;
    await t.push(await encryptFromBob(DELTA));
    now = start + 9000;
    await t.push(await encryptFromBob(DELTA));
    expect(t.sendKeyFrameRequest).toHaveBeenCalledTimes(2);
    expect(t.forwarded).toHaveLength(5);
  });

  it('takes the browser\'s frame type over the VP8 bit when it has one', async() => {
    const t = attachTransform({direction: 'recv', kind: 'video'});
    const start = now;
    await t.push(garbage());
    now = start + 2000;
    // A frame the browser reports as a keyframe ends the recovery.
    await t.push({...(await encryptFromBob(DELTA)), type: 'key'});
    now = start + 4000;
    await t.push(await encryptFromBob(DELTA));
    expect(t.sendKeyFrameRequest).toHaveBeenCalledTimes(1);
  });

  it('does not ask while frames decrypt', async() => {
    const t = attachTransform({direction: 'recv', kind: 'video'});
    for(let i = 0; i < 3; i++) {
      now += 2000;
      await t.push(await encryptFromBob(DELTA));
    }
    expect(t.sendKeyFrameRequest).not.toHaveBeenCalled();
    expect(t.forwarded).toHaveLength(3);
  });

  it('leaves audio and send transforms alone', async() => {
    const audio = attachTransform({direction: 'recv', kind: 'audio'});
    await audio.push(garbage());
    expect(audio.sendKeyFrameRequest).not.toHaveBeenCalled();
    expect(audio.forwarded).toHaveLength(0);

    const send = attachTransform({direction: 'send', kind: 'video'});
    await send.push(wireFrame(DELTA));
    expect(send.sendKeyFrameRequest).not.toHaveBeenCalled();
  });

  it('still drops the frame where the transformer cannot ask for a keyframe', async() => {
    const t = attachTransform({direction: 'recv', kind: 'video'}, false);
    await t.push(garbage());
    expect(t.forwarded).toHaveLength(0);
  });
});
