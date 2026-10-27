/*
 * Per-frame cost of the conference media pipeline (encryptPacket +
 * decryptPacket), at the three frame sizes a call actually carries: an Opus
 * frame, a VP8 delta frame and a VP8 keyframe.
 *
 * Skipped unless TDE2E_BENCH=1 — timings on a shared machine are too noisy to
 * gate on. Run it with:
 *
 *   TDE2E_BENCH=1 pnpm exec vitest run src/lib/calls/e2e/tests/framePipeline.bench.test.ts
 *
 * Besides the mean time per frame it reports the longest the event loop was
 * held while keyframes went through: every stream of a call shares the one
 * worker thread, so a synchronous stretch there delays every other stream's
 * frames (an audio frame waits behind a video keyframe).
 */

import {beforeAll, describe, expect, it} from 'vitest';
import {ActiveEpoch, decryptPacket, encryptPacket, ReplayState} from '../call';
import {ensureCryptoReady, randomBytes} from '../crypto';
import {PrivateKey} from '../keys';

const SENDER_ID = BigInt(1001);

const CASES = [
  {name: 'audio ~100 B', size: 100, prefix: 0, frames: 400},
  {name: 'video delta ~2 KB', size: 2 * 1024, prefix: 1, frames: 300},
  {name: 'video keyframe ~60 KB', size: 60 * 1024, prefix: 10, frames: 60}
];

function makeEpoch(sender: PrivateKey): ActiveEpoch {
  return {
    height: 1,
    epochHash: randomBytes(32),
    groupSharedKey: randomBytes(32),
    participantKeysByUserId: new Map([[SENDER_ID.toString(), sender.publicKey()]])
  };
}

// Longest gap between two consecutive macrotasks while `work` runs: how long a
// frame of another stream could have waited for this worker thread. Ticks on
// a MessageChannel, which (unlike setTimeout) is not clamped to 1 ms.
async function measureStall(work: () => Promise<void>): Promise<number> {
  let maxGap = 0;
  let last = performance.now();
  let running = true;
  const channel = new MessageChannel();
  channel.port1.onmessage = () => {
    const now = performance.now();
    maxGap = Math.max(maxGap, now - last);
    last = now;
    if(running) channel.port2.postMessage(0);
  };
  channel.port2.postMessage(0);
  await work();
  running = false;
  channel.port1.close();
  return maxGap;
}

describe.runIf(process.env.TDE2E_BENCH)('conference frame pipeline benchmark', () => {
  beforeAll(() => ensureCryptoReady());

  for(const {name, size, prefix, frames} of CASES) {
    it(name, async() => {
      const sender = PrivateKey.fromSeed(new Uint8Array(32).fill(7));
      const epochs = [makeEpoch(sender)];
      const replayState = new ReplayState();
      const data = randomBytes(size);
      let seqno = 0;

      const roundTrip = async() => {
        const packet = await encryptPacket({
          channelId: 0,
          data,
          unencryptedPrefixLength: prefix,
          epochs,
          privateKey: sender,
          seqno: ++seqno
        });
        const decoded = await decryptPacket({packet, fromUserId: SENDER_ID, epochs, replayState});
        expect(decoded.data.length).toBe(size);
      };

      for(let i = 0; i < 20; i++) await roundTrip();

      let encryptTotal = 0;
      let decryptTotal = 0;
      for(let i = 0; i < frames; i++) {
        const t0 = performance.now();
        const packet = await encryptPacket({
          channelId: 0,
          data,
          unencryptedPrefixLength: prefix,
          epochs,
          privateKey: sender,
          seqno: ++seqno
        });
        const t1 = performance.now();
        await decryptPacket({packet, fromUserId: SENDER_ID, epochs, replayState});
        encryptTotal += t1 - t0;
        decryptTotal += performance.now() - t1;
      }

      const stall = await measureStall(async() => {
        for(let i = 0; i < 10; i++) await roundTrip();
      });

      const encryptMs = encryptTotal / frames;
      const decryptMs = decryptTotal / frames;
      console.log(
        `[tde2e bench] ${name}: encrypt ${encryptMs.toFixed(3)} ms, decrypt ${decryptMs.toFixed(3)} ms, ` +
        `total ${(encryptMs + decryptMs).toFixed(3)} ms/frame, max event-loop stall ${stall.toFixed(2)} ms`
      );
    }, 120_000);
  }
});
