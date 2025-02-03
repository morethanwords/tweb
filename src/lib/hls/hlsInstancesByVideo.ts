import type Hls from 'hls.js';

export const hlsInstancesByVideo = new WeakMap<HTMLVideoElement, Hls>();
