import {createEffect, onCleanup} from 'solid-js';
import deferredPromise from '../../../helpers/cancellablePromise';
import createMiddleware from '../../../helpers/solid/createMiddleware';
import {useMediaEditorContext} from '../context';
import {snapToViewport} from '../utils';
import createVideoForDrawing from './createVideoForDrawing';
import styles from './videoControls.module.scss';

type Args = {
  getCanvas: () => HTMLCanvasElement;
  size: {
    width: number;
    height: number;
  };
};

export default function useVideoControlsCanvas({getCanvas, size}: Args) {
  const {editorState, mediaSrc} = useMediaEditorContext();

  createEffect(() => {
    const media = editorState.renderingPayload?.media;
    const canvas = getCanvas();
    if(!media || !canvas || !size.width || !size.height) return;

    const ratio = media.width / media.height;

    const ctx = canvas.getContext('2d');

    let
      deferred = deferredPromise<void>(),
      cleaned = false
    ;

    onCleanup(() => {
      cleaned = true;
      deferred?.resolve();
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    });

    const middleware = createMiddleware().get();

    (async() => {
      const video = await createVideoForDrawing(mediaSrc, {currentTime: 0, middleware});
      // (window as any).myWeakRef = new WeakRef(video); // works

      if(cleaned) return;

      video.addEventListener('seeked', () => {
        deferred?.resolve();
      });

      const [chunkWidth, chunkHeight] = snapToViewport(ratio, size.width, size.height);

      for(let x = 0; x < size.width; x += chunkWidth) {
        deferred = deferredPromise();
        video.currentTime = x / size.width * video.duration;

        await deferred;
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
    })();
  });
}
