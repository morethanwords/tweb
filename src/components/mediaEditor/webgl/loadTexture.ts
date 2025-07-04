import deferredPromise from '../../../helpers/cancellablePromise';
import {Middleware} from '../../../helpers/middleware';
import createVideoForDrawing from '../canvas/createVideoForDrawing';
import {MediaType} from '../types';


type LoadTextureArgs = {
  gl: WebGLRenderingContext;
  mediaSrc: string;
  mediaType: MediaType;
  videoTime: number;
  waitToSeek?: boolean;

  middleware?: Middleware;
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

export async function loadTexture({gl, mediaSrc, mediaType, videoTime, waitToSeek, middleware}: LoadTextureArgs): Promise<LoadTextureResult> {
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
    const video = await createVideoForDrawing(mediaSrc, {currentTime: videoTime, waitToSeek, middleware});

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
