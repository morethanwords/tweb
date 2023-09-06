import createVideo from './dom/createVideo';

export default function preloadVideo(url: string): Promise<HTMLVideoElement> {
  return new Promise((resolve, reject) => {
    const video = createVideo();
    video.volume = 0;
    video.addEventListener('loadedmetadata', () => resolve(video), {once: true});
    video.addEventListener('error', reject, {once: true});
    video.src = url;
  });
}
