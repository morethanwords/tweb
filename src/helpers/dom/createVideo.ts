export default function createVideo(options: {
  pip?: boolean
} = {}) {
  const video = document.createElement('video');
  if(!options.pip) video.disablePictureInPicture = true;
  video.setAttribute('playsinline', 'true');
  return video;
}
