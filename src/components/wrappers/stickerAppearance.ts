/**
 * Declarative appearance controller for wrapSticker's lottie path.
 *
 * One instance per container - the single owner of the container's media/thumb
 * children (the container itself - classes, dataset, premium lock - stays
 * caller-owned). Layers, bottom to top:
 * - previous: adopted prior-generation media (idempotent re-wrap into a reused
 *   container - never torn down until the layer above has provably presented)
 * - underlay: current-generation svg silhouette, upgradeable to a preview img
 * - media: the player canvas (appended by RLottiePlayer.onLoad, not here)
 *
 * Transitions are forward-only (a late img callback must never displace a
 * canvas) and every lower-layer removal is presentation-gated: offscreen
 * players prove pixels via an acked ensurePresented() + double rAF, legacy
 * players paint synchronously before 'firstFrame'.
 *
 * Disposal (via the caller's middleware) only makes the controller inert - it
 * must NOT remove DOM, the next generation adopts it.
 */
import type RLottiePlayer from '@lib/rlottie/rlottiePlayer';
import liteMode from '@helpers/liteMode';
import {Middleware} from '@helpers/middleware';
import sequentialDom from '@helpers/sequentialDom';
import {createRoot, createSignal} from 'solid-js';

export const onAnimationEnd = (element: HTMLElement, onAnimationEnd: () => void, timeout: number) => {
  const onEnd = () => {
    element.removeEventListener('animationend', onEnd);
    onAnimationEnd();
    clearTimeout(_timeout);
  };
  element.addEventListener('animationend', onEnd);
  const _timeout = setTimeout(onEnd, timeout);
};

const MEDIA_TAGS = new Set(['CANVAS', 'VIDEO', 'IMG', 'svg']);

export type StickerAppearance = ReturnType<typeof createStickerAppearance>;

export default function createStickerAppearance({container, thumbKey, middleware, replacePreviousMedia}: {
  container: HTMLElement,
  thumbKey: string,
  middleware?: Middleware,
  replacePreviousMedia?: boolean
}) {
  return createRoot((dispose) => {
    const [previous, setPrevious] = createSignal<HTMLElement[]>([]);
    const [underlay, setUnderlay] = createSignal<HTMLElement>();
    const [mediaArrived, setMediaArrived] = createSignal(false);

    let disposed = false;
    // fires immediately when the middleware is already dead - born disposed
    middleware?.onClean(() => {
      disposed = true;
      dispose();
    });

    // adoption: classify the leftovers of a previous generation in a reused
    // container (skip the premium lock and DIVs, exactly like the old
    // getThumbFromContainer/cb exclusions; anything unknown stays untouched)
    const adopted: HTMLElement[] = [];
    for(const child of Array.from(container.children) as HTMLElement[]) {
      if(child.classList.contains('premium-sticker-lock') || child.tagName === 'DIV') {
        continue;
      }

      if(!underlay() && child.dataset?.stickerThumb === thumbKey) {
        // same-key underlay - idempotent re-wrap, no rebuild, still upgradeable
        setUnderlay(child);
      } else if(MEDIA_TAGS.has(child.tagName)) {
        // prior-generation media stays as the bottom layer until replaced
        adopted.push(child);
      }
    }

    if(adopted.length) {
      setPrevious(adopted);
    }


    const canBuildSilhouette = () => !disposed && !mediaArrived() && !underlay() && !previous().length;

    // any previous media blocks a non-replacePreviousMedia image insert - keeps
    // today's occupied-container no-op (e.g. a re-wrapped static reaction must
    // not have its full-res img displaced by a stripped thumb); only onlyThumb
    // re-wraps (replacePreviousMedia) retire previous media under the new img
    const canBuildImage = () => !disposed && !mediaArrived() && underlay()?.tagName !== 'IMG' && (replacePreviousMedia || !previous().length);

    const setSilhouette = (svg: SVGSVGElement) => {
      if(!canBuildSilhouette()) {
        return;
      }

      svg.classList.add('rlottie-vector', 'media-sticker', 'thumbnail');
      svg.dataset.stickerThumb = thumbKey;
      // the preview IMAGE loads asynchronously and can lose the race against a
      // warm render - append the instant vector silhouette SYNCHRONOUSLY (works
      // pre-mount too); the image only upgrades it
      container.append(svg);
      setUnderlay(svg as Element as HTMLElement);
    };

    const upgradeToImage = (image: HTMLImageElement, onApplied?: VoidFunction) => {
      // every bail path must call finish so loadThumbPromise always resolves
      const finish = () => onApplied?.();
      if(!canBuildImage()) {
        return finish();
      }

      // renderImageFromUrl's loadedURLs shortcut skips decode() on re-renders -
      // swapping a not-yet-decoded img over the opaque silhouette can paint
      // blank for a frame; gate the swap on decode-completeness (instant when
      // the bitmap is cached). Decode rejection (broken/oversized source) -
      // keep the current layers instead of swapping in a broken img.
      (image.decode ? image.decode() : Promise.resolve()).then(() => {
        if(!canBuildImage()) {
          return finish();
        }

        sequentialDom.mutateElement(container, () => {
          // mediaArrived may flip between scheduling and the rAF flush - an img
          // must never displace a canvas (forward-only)
          if(!canBuildImage()) {
            return finish();
          }

          // convergence with a concurrent same-key generation: it may have
          // replaceWith-ed the tracked underlay - re-resolve from the live DOM
          let current = underlay();
          if(current && current.parentElement !== container) {
            current = (Array.from(container.children) as HTMLElement[]).find((child) => child.dataset?.stickerThumb === thumbKey);
            setUnderlay(current);
            if(current?.tagName === 'IMG') { // an equivalent image already landed
              return finish();
            }
          }

          image.classList.add('media-sticker', 'thumbnail');
          image.dataset.stickerThumb = thumbKey;
          if(current) {
            current.replaceWith(image);
          } else {
            container.append(image);
          }
          setUnderlay(image);

          // atomic retire: prior-generation media goes away in the same paint
          // the decoded img arrives in - a demolished cell can never show
          // silhouette-only or empty
          previous().forEach((el) => el.remove());
          setPrevious([]);

          finish();
        });
      }, () => finish());
    };

    const onMediaFirstFrame = ({animation, canvas, needFadeIn}: {
      animation: RLottiePlayer,
      canvas: HTMLCanvasElement | undefined,
      needFadeIn?: boolean
    }) => {
      if(disposed || mediaArrived()) {
        return;
      }

      // set synchronously DURING the firstFrame dispatch (the player appends
      // the canvas in the same task right after) and BEFORE the scan - any
      // in-flight upgradeToImage callback is blocked from now on
      setMediaArrived(true);

      // LIVE DOM scan, not the signals: a concurrent same-key generation may
      // have replaceWith-ed the tracked underlay - a signal snapshot would
      // retire a detached node and orphan the live img beneath the canvas
      const lower = (Array.from(container.children) as HTMLElement[]).filter((child) => {
        return MEDIA_TAGS.has(child.tagName) && !animation.canvas.includes(child as HTMLCanvasElement);
      });
      const top = lower[lower.length - 1];

      const fade = needFadeIn === false ? false : (needFadeIn || !top || top.tagName === 'svg') && liteMode.isAvailable('animations');
      if(fade && !canvas && !top) {
        return;
      }

      const retire = () => {
        lower.forEach((el) => el.remove());
        setPrevious([]);
        setUnderlay(undefined);
      };

      // offscreen: a worker commit made while the canvas was detached can be
      // lost - the proof must be a re-present issued while the canvas is
      // CONNECTED (popup grids attach whole subtrees after the cells are built,
      // so a post-append ack alone can still race the attach), and only then
      // are the lower layers dropped; legacy renderFrame2 painted synchronously
      const presented = (run: VoidFunction) => {
        if(!animation.offscreen) {
          run();
          return;
        }

        const ensure = () => {
          animation.ensurePresented().then(() => {
            requestAnimationFrame(() => requestAnimationFrame(run));
          });
        };

        const waitConnected = () => {
          if(disposed) {
            return;
          }

          if(canvas?.isConnected) {
            ensure();
          } else {
            requestAnimationFrame(waitConnected);
          }
        };

        waitConnected();
      };

      if(!fade) {
        if(lower.length) {
          presented(() => sequentialDom.mutate(retire));
        }
      } else {
        // offscreen: the canvas already carries a committed frame and onLoad
        // appends it right after this dispatch - without the class it would
        // paint one frame at full opacity (flash), then drop to 0 when the rAF
        // batch adds the class
        if(animation.offscreen && canvas) {
          canvas.classList.add('fade-in');
        }

        sequentialDom.mutate(() => {
          canvas && canvas.classList.add('fade-in');
          // offscreen: the canvas may still be transparent for a frame or two
          // (the worker commit lands asynchronously) and the parallel
          // cross-fade dips through the background = visible blink. Keep the
          // lower layers at full opacity beneath the fading-in canvas; they
          // are removed under a fully opaque canvas afterwards.
          if(!animation.offscreen) {
            lower.forEach((el) => el.classList.add('fade-out'));
          }

          onAnimationEnd(canvas || top, () => {
            presented(() => sequentialDom.mutate(() => {
              canvas && canvas.classList.remove('fade-in');
              // the sticker does not fully cover the silhouette (transparent
              // background/holes) - removing the underlay instantly pops the
              // peeking gray ghost out of existence; fade it away instead
              if(animation.offscreen && lower.length) {
                lower.forEach((el) => el.classList.add('fade-out'));
                onAnimationEnd(top, () => sequentialDom.mutate(retire), 400);
              } else {
                retire();
              }
            }));
          }, 400);
        });
      }
    };

    return {
      canBuildSilhouette,
      canBuildImage,
      setSilhouette,
      upgradeToImage,
      onMediaFirstFrame
    };
  });
}
