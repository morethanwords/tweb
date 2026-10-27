import safePlay from '@helpers/dom/safePlay';

/**
 * Plays it; a browser that will not let it play aloud (`NotAllowedError`, no user gesture) gets it
 * muted instead, which it always allows.
 */
export default function playOrPlayMuted(media: HTMLMediaElement) {
  return media.play().catch((err: Error) => {
    if(err.name === 'NotAllowedError') {
      media.muted = true;
      media.autoplay = true;
      safePlay(media);
    }
  });
}
