import {test, expect} from '@playwright/test';

test('cleans up a player when tlottie rejects an animation', async({page}) => {
  await page.addInitScript(() => {
    (window as any).__lottieUnhandledRejections = [];
    window.addEventListener('unhandledrejection', (event) => {
      (window as any).__lottieUnhandledRejections.push(String(event.reason));
    });
  });

  await page.goto('/');
  await page.waitForFunction(
    () => typeof (window as any).lottieLoader?.loadAnimationFromURL === 'function',
    null,
    {timeout: 30_000}
  );

  const loadResult = await page.evaluate(async() => {
    const container = document.createElement('div');
    container.id = 'failed-lottie';
    container.style.cssText = 'width:64px;height:64px;';
    document.body.append(container);
    const player = await (window as any).lottieLoader.loadAnimationWorker({
      container,
      width: 64,
      height: 64,
      group: 'none',
      name: 'failed-lottie',
      animationData: new Blob(['{not-json'])
    });

    try {
      await player.loadPromise;
      return {rejected: false};
    } catch(error) {
      return {rejected: true, error: String(error)};
    }
  });

  expect(loadResult.rejected).toBe(true);
  expect(loadResult.error).toBeTruthy();

  await page.waitForFunction(
    () => !(window as any).lottieLoader.getAnimation(document.getElementById('failed-lottie')),
    null,
    {timeout: 10_000}
  );
  await page.waitForTimeout(100);

  expect(await page.evaluate(() => (window as any).__lottieUnhandledRejections)).toEqual([]);
});

test('frame-driven players render only explicitly requested frames', async({page}) => {
  await page.goto('/');
  await page.waitForFunction(
    () => typeof (window as any).lottieLoader?.loadAnimationFromURL === 'function',
    null,
    {timeout: 30_000}
  );

  const result = await page.evaluate(async() => {
    const container = document.createElement('div');
    container.style.cssText = 'width:64px;height:64px;';
    document.body.append(container);
    const player = await (window as any).lottieLoader.loadAnimationFromURL({
      container,
      width: 64,
      height: 64,
      group: 'none',
      name: 'frame-driven-lottie',
      autoplay: false,
      noOffscreen: true,
      skipFirstFrameRendering: true
    }, '/assets/tgs/key.json');
    const frames: number[] = [];
    player.addEventListener('enterFrame', (frameNo: number) => frames.push(frameNo));

    await player.loadPromise;
    await new Promise((resolve) => setTimeout(resolve, 250));
    const framesBeforeRequest = frames.slice();
    const renderedFrame = await new Promise<number>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('frame render timed out')), 5_000);
      player.addEventListener('enterFrame', (frameNo: number) => {
        clearTimeout(timeout);
        resolve(frameNo);
      }, {once: true});
      player.addEventListener('error', reject, {once: true});
      player.requestFrame(1);
    });

    player.remove();
    container.remove();
    return {framesBeforeRequest, renderedFrame};
  });

  expect(result.framesBeforeRequest).toEqual([]);
  expect(result.renderedFrame).toBe(1);
});

test('keeps worker preloading silent when WebAssembly SIMD is unavailable', async({page}) => {
  await page.addInitScript(() => {
    Object.defineProperty(WebAssembly, 'validate', {
      configurable: true,
      value: () => false
    });
    (window as any).__lottieUnhandledRejections = [];
    window.addEventListener('unhandledrejection', (event) => {
      (window as any).__lottieUnhandledRejections.push(String(event.reason));
    });
  });

  await page.goto('/');
  await page.waitForFunction(
    () => typeof (window as any).lottieLoader?.loadLottieWorkers === 'function',
    null,
    {timeout: 30_000}
  );

  const result = await page.evaluate(async() => {
    const loader = (window as any).lottieLoader;
    await loader.loadLottieWorkers();

    const container = document.createElement('div');
    container.style.cssText = 'width:64px;height:64px;';
    document.body.append(container);

    let loadError: string;
    try {
      await loader.loadAnimationWorker({
        container,
        width: 64,
        height: 64,
        animationData: new Blob(['{}'])
      });
    } catch(error) {
      loadError = (error as any)?.type;
    } finally {
      container.remove();
    }

    await new Promise((resolve) => setTimeout(resolve, 100));
    return {
      loadError,
      unhandledRejections: (window as any).__lottieUnhandledRejections
    };
  });

  expect(result.loadError).toBe('NO_WASM');
  expect(result.unhandledRejections).toEqual([]);
});
