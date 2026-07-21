/**
 * Per-container thumb controller for wrapSticker's lottie path: shows an instant
 * silhouette, upgrades it to a preview image, then retires it (and any adopted
 * prior-generation media) once the player's canvas is provably on screen. Disposal
 * only makes it inert - the next generation adopts whatever DOM is left.
 */
import type LottiePlayer from '@lib/lottie/lottiePlayer';
import liteMode from '@helpers/liteMode';
import {MOUNT_CLASS_TO} from '@config/debug';
import {Middleware} from '@helpers/middleware';

export const onAnimationEnd = (element: HTMLElement, onAnimationEnd: () => void, timeout: number) => {
  const onEnd = () => {
    element.removeEventListener('animationend', onEnd);
    onAnimationEnd();
    clearTimeout(_timeout);
  };
  element.addEventListener('animationend', onEnd);
  const _timeout = setTimeout(onEnd, timeout);
};

const whenAnimationEnd = (element: HTMLElement, timeout: number) =>
  new Promise<void>((resolve) => onAnimationEnd(element, resolve, timeout));

const MEDIA_TAGS = new Set(['CANVAS', 'VIDEO', 'IMG', 'svg']);

export type StickerAppearance = ReturnType<typeof createStickerAppearance>;

export default function createStickerAppearance({container, thumbKey, middleware, replacePreviousMedia}: {
  container: HTMLElement,
  thumbKey: string,
  middleware?: Middleware,
  replacePreviousMedia?: boolean
}) {
  let disposed = false;
  let mediaArrived = false;
  let underlay: HTMLElement; // current silhouette / preview image
  const previous: HTMLElement[] = []; // adopted prior-generation media, retired under the new layer

  middleware?.onClean(() => {
    disposed = true;
  });

  // adopt a reused container's leftovers: reuse a same-key thumb as the underlay, keep
  // other media beneath until the new frame presents (the premium lock and DIVs stay)
  for(const child of Array.from(container.children) as HTMLElement[]) {
    if(child.classList.contains('premium-sticker-lock') || child.tagName === 'DIV') continue;
    else if(!underlay && child.dataset.stickerThumb === thumbKey) underlay = child;
    else if(MEDIA_TAGS.has(child.tagName)) previous.push(child);
  }

  const canBuildSilhouette = () => !disposed && !mediaArrived && !underlay && !previous.length;
  // previous media blocks a plain image insert (a re-wrapped reaction keeps its full-res
  // img); only onlyThumb re-wraps (replacePreviousMedia) replace it
  const canBuildImage = () => !disposed && !mediaArrived && underlay?.tagName !== 'IMG' && (replacePreviousMedia || !previous.length);

  const setSilhouette = (svg: SVGSVGElement) => {
    if(!canBuildSilhouette()) return;

    svg.classList.add('lottie-vector', 'media-sticker', 'thumbnail');
    svg.dataset.stickerThumb = thumbKey;
    container.append(svg);
    underlay = svg as Element as HTMLElement;
  };

  const upgradeToImage = (image: HTMLImageElement, onApplied?: VoidFunction) => {
    if(!canBuildImage()) return onApplied?.();

    // gate the swap on decode so a not-yet-decoded img can't paint blank over the
    // silhouette for a frame (instant when cached; on failure keep what we have)
    (image.decode ? image.decode() : Promise.resolve()).then(() => {
      if(!canBuildImage()) return onApplied?.();

      image.classList.add('media-sticker', 'thumbnail');
      image.dataset.stickerThumb = thumbKey;
      underlay ? underlay.replaceWith(image) : container.append(image);
      underlay = image;
      previous.splice(0).forEach((el) => el.remove());
      onApplied?.();
    }, () => onApplied?.());
  };

  const onMediaFirstFrame = async({animation, canvas, needFadeIn}: {
    animation: LottiePlayer,
    canvas: HTMLCanvasElement | undefined,
    needFadeIn?: boolean
  }) => {
    if(disposed || mediaArrived) return;

    mediaArrived = true;
    const lower = [...previous, underlay].filter(Boolean);
    const top = lower[lower.length - 1];
    underlay = undefined;
    previous.length = 0;

    const fade = needFadeIn !== false &&
      (needFadeIn || !top || top.tagName === 'svg') &&
      liteMode.isAvailable('animations');

    // the canvas is attached and on top of the thumb by now (the player mounts it before
    // firstFrame); cross-fade it in over the still-opaque thumb on cold start
    if(fade && canvas) {
      canvas.classList.add('fade-in');
      await whenAnimationEnd(canvas, 400);
      canvas.classList.remove('fade-in');
    }

    // ensurePresented re-presents the staged frame onto the attached canvas and waits until it has
    // reached the screen; only then drop the thumb - instantly, no fade. By the time it resolves the
    // canvas already covers the cell, so the removal is invisible and never flashes blank.
    await animation.ensurePresented();
    if(disposed) return;

    lower.forEach((el) => el.remove());
  };

  return {
    canBuildSilhouette,
    canBuildImage,
    setSilhouette,
    upgradeToImage,
    onMediaFirstFrame
  };
}

// debug-mounted (like lottieLoader/liteMode) so the browser no-blink test can drive the real
// controller against a local .tgs without bootstrapping the whole wrapSticker/doc pipeline
MOUNT_CLASS_TO && (MOUNT_CLASS_TO.createStickerAppearance = createStickerAppearance);
