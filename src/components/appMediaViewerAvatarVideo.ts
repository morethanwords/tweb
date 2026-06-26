import {Photo} from '@layer';
import appDownloadManager from '@lib/appDownloadManager';
import chooseProfileVideoSize from '@appManagers/utils/photos/chooseProfileVideoSize';
import createLoopingMutedVideo from '@helpers/dom/createLoopingMutedVideo';

// Overlays a looping muted video (animated avatar) on top of the media-viewer
// mover's still image, once the photo's full video variant has downloaded.
// Returns a cleanup that cancels the pending download and removes the video.
// Shared by AppMediaViewer (chat/channel avatar-change photos) and
// AppMediaViewerAvatar (peer avatars).
export default function overlayAvatarVideoOnMover(mover: HTMLElement, photo: Photo.photo): () => void {
  let video: HTMLVideoElement | undefined;
  let cancelled = false;

  const videoSize = chooseProfileVideoSize(photo, 'full');
  if(videoSize) {
    Promise.resolve(appDownloadManager.downloadMediaURL({media: photo, thumb: videoSize})).then((url) => {
      if(cancelled || !url || !mover.isConnected) return;
      const container = (mover.querySelector('.media-viewer-aspecter') as HTMLElement) || mover;
      video = createLoopingMutedVideo(url, 'media-viewer-avatar-video', videoSize.video_start_ts);
      container.append(video);
    });
  }

  return () => {
    cancelled = true;
    if(video) {
      video.pause();
      video.src = '';
      video.remove();
      video = undefined;
    }
  };
}
