import {Middleware} from '../middleware';

// const createdVideos: HTMLVideoElement[] = [];
export default function createVideo({
  pip,
  middleware
}: {
  pip?: boolean,
  middleware: Middleware
}) {
  const video = document.createElement('video');
  if(!pip) video.disablePictureInPicture = true;
  video.setAttribute('playsinline', 'true');
  // createdVideos.push(video);

  middleware?.onDestroy(() => {
    video.src = '';
    video.load();
  });

  return video;
}

// (window as any).createdVideos = createdVideos;
