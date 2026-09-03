/*
 * Replay protection of 1-on-1 signaling. tgcalls (EncryptedConnection.cpp
 * registerIncomingCounter) remembers only the largest 64 counters it has seen:
 * a packet with a counter in that list, or older than the list's window once it
 * is full, is refused. A Map of every counter ever seen did the same job at
 * first and then grew with the call — one entry per packet the peer chose to
 * send.
 */
import {describe, expect, it} from 'vitest';
import {P2P_SIGNALING_INCOMING_COUNTERS_KEPT} from '@lib/calls/constants';
import P2PEncryptor from '@lib/calls/p2P/p2PEncryptor';

const KEY = new Uint8Array(256).map((_, i) => (i * 7 + 3) & 0xff);
const PAYLOAD = new TextEncoder().encode('{"@type":"MediaState"}');

// The caller's packets as the callee receives them: one encryptor per side,
// the same key, complementary key-derivation offsets.
function makePair() {
  return {caller: new P2PEncryptor(true, KEY), callee: new P2PEncryptor(false, KEY)};
}

async function packetWithSeq(encryptor: P2PEncryptor, seq: number) {
  (encryptor as any).counter = seq - 1;
  return (await encryptor.encryptRawPacket(PAYLOAD)).bytes;
}

function register(encryptor: P2PEncryptor, counter: number): boolean {
  return (encryptor as any).registerIncomingCounter(counter);
}

// WebCrypto hands back typed arrays of Node's realm, jsdom's `Uint8Array` is
// another — compare contents, not constructors.
async function decrypt(encryptor: P2PEncryptor, packet: Uint8Array) {
  const decrypted = await encryptor.decryptRawPacket(packet);
  return decrypted && Array.from(decrypted);
}

const PAYLOAD_BYTES = Array.from(PAYLOAD);

describe('P2PEncryptor replay window', () => {
  it('decrypts a packet once and refuses its replay', async() => {
    const {caller, callee} = makePair();
    const packet = await packetWithSeq(caller, 1);

    expect(await decrypt(callee, packet)).toEqual(PAYLOAD_BYTES);
    expect(await decrypt(callee, packet)).toBeUndefined();
  });

  it('takes an out-of-order packet inside the window and refuses one that fell out', async() => {
    const {caller, callee} = makePair();
    const window = P2P_SIGNALING_INCOMING_COUNTERS_KEPT;

    for(let seq = 1; seq <= window + 6; ++seq) {
      expect(await decrypt(callee, await packetWithSeq(caller, seq))).toEqual(PAYLOAD_BYTES);
    }

    // Largest seen is window + 6: counter 7 is the oldest still inside.
    expect(await decrypt(callee, await packetWithSeq(caller, 200))).toEqual(PAYLOAD_BYTES);
    expect(register(callee, 7)).toBe(false);
    expect(register(callee, 200 - window + 1)).toBe(true);
    expect(register(callee, 200 - window)).toBe(false);
  });

  it('keeps the window sorted and bounded', () => {
    const {callee} = makePair();
    const window = P2P_SIGNALING_INCOMING_COUNTERS_KEPT;
    const list = (callee as any).largestIncomingCounters as number[];

    // Out-of-order arrival, some duplicates, ten thousand packets.
    for(let i = 0; i < 10000; ++i) {
      const counter = 1 + ((i * 37) % 9973);
      const accepted = register(callee, counter);
      if(accepted) {
        expect(list).toContain(counter);
      }
      expect(list.length).toBeLessThanOrEqual(window);
      for(let j = 1; j < list.length; ++j) {
        expect(list[j - 1]).toBeLessThan(list[j]);
      }
    }

    // Every kept counter lies within the window below the largest one.
    const largest = list[list.length - 1];
    for(const counter of list) {
      expect(counter + window).toBeGreaterThan(largest);
    }
    // Everything the window holds is a replay from now on.
    for(const counter of [...list]) {
      expect(register(callee, counter)).toBe(false);
    }
  });
});
