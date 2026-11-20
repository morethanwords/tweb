import {createEffect, onCleanup} from 'solid-js';
import createMiddleware from '@helpers/solid/createMiddleware';
import {useMediaEditorContext} from '@components/mediaEditor/context';
import {snapToViewport} from '@components/mediaEditor/utils';
import createVideoForDrawing, {seekVideoForDrawing} from '@components/mediaEditor/canvas/createVideoForDrawing';
import styles from '@components/mediaEditor/canvas/videoControls.module.scss';

type Args = {
  getCanvas: () => HTMLCanvasElement;
  size: {
    width: number;
    height: number;
  };
};

export default function useVideoControlsCanvas({getCanvas, size}: Args) {
  const {editorState, mediaSrc} = useMediaEditorContext();
  const middleware = createMiddleware().get();
  let videoPromise: Promise<HTMLVideoElement>;

  createEffect(() => {
    const media = editorState.renderingPayload?.media;
    const canvas = getCanvas();
    if(!media || !canvas || !size.width || !size.height) return;

    const ratio = media.width / media.height;
    const width = size.width, height = size.height;

    const ctx = canvas.getContext('2d');

    const controller = new AbortController();
    let cleaned = false;

    onCleanup(() => {
      cleaned = true;
      controller.abort();
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    });

    (async() => {
      const video = await (videoPromise ??= createVideoForDrawing(mediaSrc, {currentTime: 0, middleware}));
      // (window as any).myWeakRef = new WeakRef(video); // works

      if(cleaned) return;

      const [chunkWidth, chunkHeight] = snapToViewport(ratio, width, height);

      for(let x = 0; x < width; x += chunkWidth) {
        await seekVideoForDrawing(video, x / width * video.duration, controller.signal);
        if(cleaned) return;

        ctx.drawImage(video, x, 0, chunkWidth, chunkHeight);

        const fade = document.createElement('div');

        fade.classList.add(styles.FrameFade);
        fade.style.top = '0px';
        fade.style.left = x + 'px';
        fade.style.width = chunkWidth + 0.5 + 'px'; // add a few px to prevent unexpected borders
        fade.style.height = chunkHeight + 'px';

        canvas.after(fade);

        fade.animate({opacity: [1, 0]}, {duration: 500, easing: 'ease-in-out'}).finished
        .then(() => fade.remove());
      }
    })().catch((error) => {
      if(!cleaned) console.error('Failed to draw video timeline', error instanceof Error ? error.message : error?.message || error);
    });
  });
}
