import {createEffect, onCleanup} from 'solid-js';
import {animate} from '../../../helpers/animation';
import clamp from '../../../helpers/number/clamp';
import {SetVideoTimeFlags, useMediaEditorContext} from '../context';


type Args = {
  gl: WebGLRenderingContext;
  drawAdjustedImage: () => void;
};

export default function initVideoPlayback({gl, drawAdjustedImage}: Args) {
  const {editorState, mediaState, actions} = useMediaEditorContext();
  const {renderingPayload} = editorState;
  const video = renderingPayload.media.video;

  if(!video) return;

  // We don't want this 'seeked' event to be fired when generating the final result
  let pendingSeek = false;

  actions.setVideoTime = (time: number, flags = SetVideoTimeFlags.Redraw | SetVideoTimeFlags.UpdateVideo | SetVideoTimeFlags.UpdateCursor) => {
    if(flags & SetVideoTimeFlags.UpdateCursor) mediaState.currentVideoTime = time;
    if(flags & SetVideoTimeFlags.UpdateVideo) video.currentTime = time * video.duration;
    if(flags & SetVideoTimeFlags.Redraw) pendingSeek = true;
  };

  const seekListener = () => {
    if(!pendingSeek) return;
    pendingSeek = false;

    gl.bindTexture(gl.TEXTURE_2D, renderingPayload.texture);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, video);

    drawAdjustedImage();
  };

  video.addEventListener('seeked', seekListener);
  onCleanup(() => {
    video.removeEventListener('seeked', seekListener);
  });


  createEffect(() => {
    if(editorState.currentTab !== 'adjustments') return;

    const listener = (event: KeyboardEvent) => {
      const el = (event.target as HTMLElement);

      if(event.code === 'Space' && !el.isContentEditable) {
        event.preventDefault(); // stop page from scrolling, idk if needed
        editorState.isPlaying = !editorState.isPlaying;
      }
    };

    document.addEventListener('keydown', listener);

    onCleanup(() => {
      editorState.isPlaying = false;
      document.removeEventListener('keydown', listener);
    });
  });

  createEffect(() => {
    video.muted = mediaState.videoMuted;
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

      drawAdjustedImage();

      frameCallbackId = video.requestVideoFrameCallback(() => frameCallback());
    }

    const timeout = self.setTimeout(() => {
      if(mediaState.currentVideoTime >= mediaState.videoCropStart + mediaState.videoCropLength)
        actions.setVideoTime(mediaState.videoCropStart);

      frameCallbackId = video.requestVideoFrameCallback(frameCallback);
      video.play();

      animate(() => {
        skip = (skip + 1) % 3;

        if(skip) return true;
        if(!playing) return false;

        mediaState.currentVideoTime = video.currentTime / video.duration || 0;

        if(video.ended || video.paused || mediaState.currentVideoTime >= mediaState.videoCropStart + mediaState.videoCropLength) {
          playing = false;
          editorState.isPlaying = false;
          mediaState.currentVideoTime = clamp(mediaState.currentVideoTime, mediaState.videoCropStart, mediaState.videoCropStart + mediaState.videoCropLength);
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
};
