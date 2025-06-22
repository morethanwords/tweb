import {createEffect, createReaction, onCleanup, onMount} from 'solid-js';
import {modifyMutable, produce} from 'solid-js/store';

import {animate} from '../../../helpers/animation';
import clamp from '../../../helpers/number/clamp';

import {adjustmentsConfig, AdjustmentsConfig} from '../adjustments';
import {useMediaEditorContext} from '../context';
import {withCurrentOwner} from '../utils';
import {draw} from '../webgl/draw';
import {initWebGL} from '../webgl/initWebGL';
import {setTimeout} from 'node:timers';

function drawAdjustedImage(gl: WebGLRenderingContext) {
  const {editorState, mediaState} = useMediaEditorContext();

  const payload = editorState.renderingPayload;
  if(!payload) return;

  draw(gl, payload, {
    ...editorState.finalTransform,
    imageSize: [payload.media.width, payload.media.height],
    ...(Object.fromEntries(
      adjustmentsConfig.map(({key, to100}) => {
        const value = mediaState.adjustments[key];
        return [key, value / (to100 ? 100 : 50)];
      })
    ) as Record<AdjustmentsConfig[number]['key'], number>)
  });
}

export default function ImageCanvas() {
  const {editorState, mediaState, mediaSrc, mediaType, actions} = useMediaEditorContext();

  const canvas = (
    <canvas width={editorState.canvasSize[0] * editorState.pixelRatio} height={editorState.canvasSize[1] * editorState.pixelRatio} />
  ) as HTMLCanvasElement;

  const gl = canvas.getContext('webgl', {
    preserveDrawingBuffer: true
  });

  editorState.imageCanvas = canvas;

  const ownedDrawAdjustedImage = withCurrentOwner(() => drawAdjustedImage(gl));

  const initVideoPlayback = withCurrentOwner(() => {
    const {editorState: {renderingPayload}, actions} = useMediaEditorContext();
    const video = renderingPayload.media.video;

    if(!video) return;

    // We don't want this 'seeked' event to be fired when generating the final result
    let pendingSeek = false;

    actions.setVideoTime = (time: number, redraw = true) => {
      editorState.currentVideoTime = time;
      video.currentTime = time * video.duration;
      if(redraw) pendingSeek = true;
    };

    const seekListener = () => {
      if(!pendingSeek) return;
      pendingSeek = false;

      gl.bindTexture(gl.TEXTURE_2D, renderingPayload.texture);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, video);

      ownedDrawAdjustedImage();
    };

    video.addEventListener('seeked', seekListener);
    onCleanup(() => {
      video.removeEventListener('seeked', seekListener);
    });

    createEffect(() => {
      if(!editorState.isPlaying) return;

      let
        frameCallbackId: number,
        playing = true,
        skip = 0
      ;

      function frameCallback() {
        gl.bindTexture(gl.TEXTURE_2D, renderingPayload.texture);
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, video);

        ownedDrawAdjustedImage();

        frameCallbackId = video.requestVideoFrameCallback(() => frameCallback());
      }

      const timeout = self.setTimeout(() => {
        if(editorState.currentVideoTime >= editorState.videoCropStart + editorState.videoCropLength)
          actions.setVideoTime(editorState.videoCropStart);

        frameCallbackId = video.requestVideoFrameCallback(frameCallback);
        video.play();

        animate(() => {
          skip = (skip + 1) % 3;

          if(skip) return true;
          if(!playing) return false;

          editorState.currentVideoTime = video.currentTime / video.duration || 0;

          if(video.ended || video.paused || editorState.currentVideoTime >= editorState.videoCropStart + editorState.videoCropLength) {
            playing = false;
            editorState.isPlaying = false;
            editorState.currentVideoTime = clamp(editorState.currentVideoTime, editorState.videoCropStart, editorState.videoCropStart + editorState.videoCropLength);
          }

          return playing;
        });
      }, 200); // Let the pause/play icon animation finish as it might lag without this


      onCleanup(() => {
        playing = false;
        self.clearTimeout(timeout);
        video.cancelVideoFrameCallback(frameCallbackId);
        video.pause();
      });
    });
  });

  async function init() {
    const payload = await initWebGL({gl, mediaSrc, mediaType});

    modifyMutable(editorState, produce(state => {
      state.renderingPayload = payload;
      state.imageSize = [payload.media.width, payload.media.height];
    }));

    if(!mediaState.currentImageRatio) {
      const ratio = payload.media.width / payload.media.height;
      actions.setInitialImageRatio(ratio)
      mediaState.currentImageRatio = ratio;
    }

    initVideoPlayback();
  }

  onMount(() => {
    if(editorState.isReady) init(); // When hot reloading
    else {
      const track = createReaction(() => {
        init();
      });

      track(() => editorState.isReady);
    }
  });

  createEffect(() => {
    drawAdjustedImage(gl);
  });

  return <>{canvas}</>;
}
