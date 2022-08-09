/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {animate} from '../../helpers/animation';

export default function callVideoCanvasBlur(video: HTMLVideoElement) {
  const canvas = document.createElement('canvas');
  canvas.classList.add('call-video-blur');
  const size = 16;
  canvas.width = size;
  canvas.height = size;

  const ctx = canvas.getContext('2d', {alpha: false});
  ctx.filter = 'blur(2px)';
  const renderFrame = () => {
    ctx.drawImage(video, 0, 0, video.videoWidth, video.videoHeight, 0, 0, canvas.width, canvas.height);
  };

  animate(() => {
    renderFrame();
    return canvas.isConnected;
  });

  renderFrame();

  return canvas;
}
