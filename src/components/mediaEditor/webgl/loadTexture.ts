import deferredPromise from '../../../helpers/cancellablePromise';
import handleVideoLeak from '../../../helpers/dom/handleVideoLeak';
import onMediaLoad from '../../../helpers/onMediaLoad';

import {MediaType} from '../types';


type LoadTextureArgs = {
  gl: WebGLRenderingContext;
  mediaSrc: string;
  mediaType: MediaType;
};

type LoadTextureMedia = {
  width: number;
  height: number;
  image?: HTMLImageElement;
  video?: HTMLVideoElement;
};

type LoadTextureResult = {
  texture: WebGLTexture;
  media: LoadTextureMedia;
};

export async function loadTexture({gl, mediaSrc, mediaType}: LoadTextureArgs): Promise<LoadTextureResult> {
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);

  let media: LoadTextureMedia;

  if(mediaType === 'image') {
    const image = new Image();
    image.src = mediaSrc;

    const deferred = deferredPromise<void>();
    image.addEventListener('load', () => void deferred.resolve());
    await deferred;

    media = {
      image,
      width: image.naturalWidth,
      height: image.naturalHeight
    };
  } else {
    const video = document.createElement('video');
    video.src = mediaSrc;
    video.autoplay = true;
    video.controls = false;

    video.addEventListener('timeupdate', () => {
      video.pause();
      video.currentTime = 0;
    }, {once: true});

    // Theoretically we should not have any errors here as this is handled in the media popup
    try {
      const promise = onMediaLoad(video);
      await handleVideoLeak(video, promise);
    } catch{}

    media = {
      video,
      width: video.videoWidth,
      height: video.videoHeight
    };
  }

  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, media.video || media.image);

  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

  return {media, texture};
}
