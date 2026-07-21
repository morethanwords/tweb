import {expect, test} from '@playwright/test';
import {readFileSync} from 'fs';
import {resolve} from 'path';

const HAND_STOP_URL = '/assets/tgs/hand_stop.json';
const animation = JSON.parse(readFileSync(resolve(__dirname, '..', 'public', 'assets', 'tgs', 'hand_stop.json'), 'utf8'));
const fitz = animation.fitz[2] as Record<'o' | 'f12' | 'f3' | 'f4' | 'f5' | 'f6', number>;
const FITZ_COLORS = [fitz.o, fitz.f12, fitz.f3, fitz.f4, fitz.f5, fitz.f6].map((color) => [
  (color >> 16) & 255,
  (color >> 8) & 255,
  color & 255
]);

test.beforeEach(async({page}) => {
  await page.goto('/');
  await page.waitForFunction(
    () => typeof (window as any).lottieLoader?.loadAnimationFromURL === 'function',
    null,
    {timeout: 30_000}
  );
});

test('applies authored color replacements for every Fitz tone', async({page}) => {
  for(let toneIndex = 0; toneIndex < FITZ_COLORS.length; ++toneIndex) {
    const counts = await page.evaluate(async({colors, toneIndex, url}) => {
      const container = document.createElement('div');
      document.body.append(container);

      const player = await (window as any).lottieLoader.loadAnimationFromURL({
        container,
        width: 64,
        height: 64,
        group: 'none',
        name: `hand-stop-tone-${toneIndex}`,
        autoplay: false,
        loop: false,
        noCache: true,
        noOffscreen: true,
        skipFirstFrameRendering: true,
        toneIndex
      }, url);

      try {
        await player.loadPromise;
        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error('Fitz frame render timed out')), 5_000);
          player.addEventListener('enterFrame', () => {
            clearTimeout(timeout);
            resolve();
          }, {once: true});
          player.addEventListener('error', reject, {once: true});
          player.requestFrame(0);
        });

        const canvas = player.canvas[0] as HTMLCanvasElement;
        const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
        return colors.map(([red, green, blue]) => {
          let count = 0;
          for(let offset = 0; offset < pixels.length; offset += 4) {
            if(
              pixels[offset] === red &&
              pixels[offset + 1] === green &&
              pixels[offset + 2] === blue &&
              pixels[offset + 3] === 255
            ) {
              ++count;
            }
          }

          return count;
        });
      } finally {
        player.remove();
        container.remove();
      }
    }, {colors: FITZ_COLORS, toneIndex, url: HAND_STOP_URL});

    expect(counts[toneIndex]).toBeGreaterThan(50);
    counts.forEach((count, colorIndex) => {
      if(colorIndex !== toneIndex) {
        expect(count).toBe(0);
      }
    });
  }
});
