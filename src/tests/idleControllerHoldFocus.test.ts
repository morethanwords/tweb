import {IdleController} from '@helpers/idleController';

const settled = async(promise: Promise<void>) => {
  let done = false;
  promise.then(() => done = true);
  await new Promise((resolve) => setTimeout(resolve, 0));
  return done;
};

describe('idle controller: the app held out of sight', () => {
  test('what waits for the user\'s eyes waits for every hold to go, and for the focus', async() => {
    const idle = new IdleController();
    idle.isIdle = false;
    expect(await settled(idle.getFocusPromise())).toBe(true);

    const releaseFirst = idle.holdFocus();
    const releaseSecond = idle.holdFocus();
    const waiting = idle.getFocusPromise();
    expect(await settled(waiting)).toBe(false);

    // * held twice: one release is not enough, and releasing twice counts once
    releaseFirst();
    releaseFirst();
    expect(await settled(waiting)).toBe(false);

    // * the window blurred meanwhile: back in sight, it still waits for the focus
    idle.isIdle = true;
    releaseSecond();
    expect(await settled(waiting)).toBe(false);

    idle.isIdle = false;
    expect(await settled(waiting)).toBe(true);
    expect(idle.isIdle, 'a hold is not being idle').toBe(false);
  });

  test('a wait begun before the hold, while the window was away, still waits for its release', async() => {
    const idle = new IdleController();
    idle.isIdle = true;
    const waiting = idle.getFocusPromise();
    const release = idle.holdFocus();

    idle.isIdle = false;
    expect(await settled(waiting), 'the focus came back while the app was held').toBe(false);

    release();
    expect(await settled(waiting)).toBe(true);
  });
});
