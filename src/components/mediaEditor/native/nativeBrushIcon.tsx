import {createEffect, createSignal, onCleanup, onMount} from 'solid-js';
import {getMiddleware} from '@helpers/middleware';
import liteMode from '@helpers/liteMode';
import lottieLoader from '@lib/lottie/lottieLoader';
import type LottiePlayer from '@lib/lottie/lottiePlayer';
import type {LottieWorkerMethods} from '@lib/lottie/lottieMessagePort';

/** Real native artwork: first frame at rest, non-looping selection/hover animation. */
export default function NativeBrushIcon(props: {
  url: string;
  size: number;
  class: string;
  selected?: boolean;
  frame?: number;
  animateOnHover?: boolean;
}) {
  let container: HTMLSpanElement;
  const [player, setPlayer] = createSignal<LottiePlayer>();
  const [hovered, setHovered] = createSignal(false);
  const middleware = getMiddleware();
  let disposed = false;
  let loading: Promise<void>;
  const pending = new Set<Promise<unknown>>();

  onMount(() => {
    loading = lottieLoader.loadAnimationFromURL({
      container,
      width: props.size,
      height: props.size,
      loop: false,
      autoplay: false,
      initFrame: props.frame ?? 0,
      group: 'none',
      // These tiny, command-driven icons need a drainable request per frame, not
      // an independently clocked offscreen worker that can still render on removal.
      noOffscreen: true,
      // Reject a not-yet-created player after this button leaves. Do not clean a
      // player already created until its worker initialization and first frame settle.
      middleware: middleware.get(() => !disposed)
    }, props.url).then(async(value) => {
      const sendQuery = value.sendQuery.bind(value);
      value.sendQuery = <T extends keyof LottieWorkerMethods>(
        method: T,
        payload?: Omit<Parameters<LottieWorkerMethods[T]>[0], 'reqId'>,
        transfer?: Transferable[]
      ) => {
        const request = sendQuery(method, payload, transfer);
        pending.add(request);
        const settled = () => pending.delete(request);
        request.then(settled, settled);
        return request;
      };
      const firstFrame = new Promise<void>((resolve, reject) => {
        if(value.hasFailed) {
          reject(value.error);
          return;
        }
        value.onFirstFrame(resolve);
        value.addEventListener('error', reject, {once: true});
      });
      try {
        await Promise.all([value.loadPromise, firstFrame]);
        if(!disposed) setPlayer(value);
      } finally {
        await value.loadPromise.catch(() => {});
      }
    }).catch(() => {});
  });

  createEffect(() => {
    const value = player();
    if(!value || disposed) return;
    if(props.frame !== undefined) {
      value.pause();
      if(value.curFrame !== props.frame) {
        value.curFrame = props.frame;
        value.requestFrame(props.frame);
      }
    } else if((props.selected || hovered()) && liteMode.isAvailable('motion')) {
      value.playOrRestart();
    } else if(!value.paused || value.curFrame !== 0) {
      value.stop();
    }
  });

  onCleanup(() => {
    disposed = true;
    player()?.pause();
    // loadAnimationFromURL resolves as soon as a player exists, BEFORE loadPromise
    // and the first frame. Immediate removal here used to produce ITEM_DESTROYED.
    if(loading) loading.then(async() => {
      // pause prevents new playback requests; an already submitted bitmap render
      // must finish before the loader's middleware callback destroys its item.
      await Promise.allSettled([...pending]);
      middleware.destroy();
    });
    else middleware.destroy();
  });

  return <span
    ref={container}
    class={`lottie-icon ${props.class}`}
    aria-hidden="true"
    onPointerEnter={() => props.animateOnHover && setHovered(true)}
    onPointerLeave={() => props.animateOnHover && setHovered(false)}
  />;
}
