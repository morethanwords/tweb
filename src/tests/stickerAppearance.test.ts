import {afterEach, describe, expect, it, vi} from 'vitest';

vi.mock('@helpers/liteMode', () => ({
  default: {isAvailable: () => true}
}));

import type LottiePlayer from '@lib/lottie/lottiePlayer';
import createStickerAppearance from '@components/wrappers/stickerAppearance';

const createAnimation = () => ({
  ensurePresented: vi.fn().mockResolvedValue(undefined)
}) as unknown as LottiePlayer;

const createElements = () => {
  const container = document.createElement('div');
  const silhouette = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  const canvas = document.createElement('canvas');
  document.body.append(container);

  return {container, silhouette, canvas};
};

afterEach(() => {
  document.body.replaceChildren();
});

describe('sticker appearance', () => {
  it('fades a Lottie canvas in over its vector silhouette', async() => {
    const {container, silhouette, canvas} = createElements();
    const appearance = createStickerAppearance({container, thumbKey: 'sticker'});
    const animation = createAnimation();
    appearance.setSilhouette(silhouette);
    container.append(canvas);

    const presented = appearance.onMediaFirstFrame({animation, canvas});

    expect(canvas.classList.contains('fade-in')).toBe(true);
    canvas.dispatchEvent(new Event('animationend'));
    await presented;

    expect(canvas.classList.contains('fade-in')).toBe(false);
    expect(silhouette.isConnected).toBe(false);
    expect(animation.ensurePresented).toHaveBeenCalledOnce();
  });

  it('does not fade an explicitly settled frame', async() => {
    const {container, silhouette, canvas} = createElements();
    const appearance = createStickerAppearance({container, thumbKey: 'dice'});
    const animation = createAnimation();
    appearance.setSilhouette(silhouette);
    container.append(canvas);

    await appearance.onMediaFirstFrame({animation, canvas, needFadeIn: false});

    expect(canvas.classList.contains('fade-in')).toBe(false);
    expect(silhouette.isConnected).toBe(false);
    expect(animation.ensurePresented).toHaveBeenCalledOnce();
  });
});
