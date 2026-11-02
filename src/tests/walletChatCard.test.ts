import {bumpDuration, bumpShape, joinReadLine, READ_PRESS, READ_ROLL_DURATION, READ_ROLL_FIRST, READ_SPACING, readRollLands, readRollSteps, SETTLE_BUMP} from '@components/wallet/chatCard/motion';
import {liftAt, LIFT_DURATION, riseAt, RISE_DURATION} from '@components/wallet/chatCard/arrival';
import {BURST_DURATION, playWalletCardBurst} from '@components/wallet/chatCard/burst';

// * the frames the burst asks for, handed out by the test with the timestamps it chooses
const frames = vi.hoisted(() => [] as FrameRequestCallback[]);
vi.mock('@components/wallet/frameLoop', () => ({
  requestWalletFrame: (callback: FrameRequestCallback) => {
    frames.push(callback);
    return () => {};
  }
}));

describe('wallet chat card motion', () => {
  test('a read rolls every digit a cycle and up to its value, leading zeros stand', () => {
    expect(readRollSteps('0.05')).toEqual({steps: [0, -1, 0, 15], rolling: 1});
    expect(readRollSteps('1,250.5')).toEqual({steps: [11, -1, 12, 15, 10, -1, 15], rolling: 5});
  });

  test('the first rolling digit lands first, the last one at the end of the roll', () => {
    expect(readRollLands(0, 5)).toBe(READ_ROLL_FIRST);
    expect(readRollLands(4, 5)).toBe(READ_ROLL_DURATION);
    expect(readRollLands(0, 1)).toBe(READ_ROLL_DURATION);
  });

  test('a bump rises, falls past rest and settles back to it', () => {
    expect(bumpShape(SETTLE_BUMP, 0)).toBe(0);
    expect(bumpShape(SETTLE_BUMP, SETTLE_BUMP.rise)).toBe(1);
    const undershoot = bumpShape(SETTLE_BUMP, SETTLE_BUMP.rise + SETTLE_BUMP.hold + SETTLE_BUMP.fall + SETTLE_BUMP.settle / 2);
    expect(undershoot).toBeCloseTo(-SETTLE_BUMP.undershoot);
    expect(bumpShape(SETTLE_BUMP, bumpDuration(SETTLE_BUMP))).toBe(0);
    expect(bumpShape(READ_PRESS, -10)).toBe(0);
  });

  test('cards read together take turns 0.9 s apart, a later read starts at once', () => {
    expect(READ_SPACING).toBe(900);
    const first = joinReadLine(10000);
    const second = joinReadLine(10100);
    expect(first.at).toBe(10000);
    expect(second.at).toBe(10900);
    expect(joinReadLine(20000).at).toBe(20000);
  });

  test('a fresh card rises from 70 px lower at .86 of its size, its bottom edge in place, and shows at once', () => {
    expect(riseAt(0, 100)).toEqual({y: 70 + .14 * 50, scale: .86, opacity: 0});
    expect(riseAt(120, 100).opacity).toBe(1);
    expect(riseAt(RISE_DURATION, 100)).toEqual({y: 0, scale: 1, opacity: 1});
  });

  test('a glyph lifts after the sheen crossed it, dips past rest and is still in 0.8 s', () => {
    expect(liftAt(0)).toBe(0);
    expect(liftAt(100)).toBeGreaterThan(.5);
    expect(liftAt(400)).toBeLessThan(0);
    expect(liftAt(LIFT_DURATION)).toBe(0);
  });

  test('a card that goes before its turn leaves the line, one whose turn came keeps spacing it', () => {
    const first = joinReadLine(30000);
    const second = joinReadLine(30100);
    second.leave(30200);
    expect(joinReadLine(30300).at).toBe(30900);
    first.leave(30400);
    expect(joinReadLine(30500).at).toBe(31800);
  });
});

describe('wallet chat card stars', () => {
  test('a burst in a Document PiP window runs by one clock: its frames count from the window\'s own opening', async() => {
    let realm = 100000;
    const now = vi.spyOn(performance, 'now').mockImplementation(() => realm);
    const OwnPath2D = globalThis.Path2D;
    globalThis.Path2D ??= class {} as typeof Path2D;
    let filled = 0;
    const ctx = {setTransform() {}, clearRect() {}, fill: () => ++filled, fillStyle: '', globalAlpha: 1};
    const canvas = {width: 0, height: 0, isConnected: true, getContext: () => ctx} as any as HTMLCanvasElement;
    try {
      frames.length = 0;
      let done = false;
      playWalletCardBurst({canvas, width: 200, height: 120, originX: 100, originY: 40, emitter: 30}).then(() => done = true);
      // * the PiP window opened 90 s after the tab: its frame timestamps are that much behind the tab's clock
      for(let i = 0; i < BURST_DURATION / 16 + 4 && frames.length; ++i) {
        realm += 16;
        frames.shift()(realm - 90000);
      }

      await Promise.resolve();
      expect(filled).toBeGreaterThan(0);
      expect(done).toBe(true);
      expect(frames.length).toBe(0);
    } finally {
      now.mockRestore();
      globalThis.Path2D = OwnPath2D;
    }
  });
});
