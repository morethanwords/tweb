// Creates a muted, looping, inline <video> set up to autoplay an avatar clip.
//
// IMPORTANT: every autoplay-relevant property/attribute is set BEFORE assigning
// `src`. Chrome evaluates the autoplay policy the moment the source starts
// loading — if `muted` isn't already true at that point, autoplay is blocked
// (the element then only plays on an explicit play()). Setting src last (and
// retrying play() on canplay/loadeddata) makes muted autoplay reliable.
//
// `startTime` (seconds) is the animated profile photo's video_start_ts: official
// clients begin playback at that frame so the moving clip continues the static
// cover, then native-loop back to 0 (tdesktop video_userpic_player.cpp:138,
// iOS PeerAvatarImageGalleryItem.swift:365). We seek to it once metadata is in.
export default function createLoopingMutedVideo(url: string, className?: string, startTime?: number) {
  const v = document.createElement('video');
  if(className) v.className = className;

  v.muted = true;
  v.loop = true;
  v.playsInline = true;
  v.preload = 'auto';
  v.setAttribute('muted', '');
  v.setAttribute('playsinline', '');
  v.setAttribute('disableremoteplayback', '');

  const tryPlay = () => {
    v.play().catch(() => {});
  };

  const seekTo = startTime > 0 ? startTime : 0;

  if(seekTo) {
    // Don't autoplay from 0 — seek to video_start_ts first (once the duration is
    // known), then play; native loop wraps subsequent passes back to 0.
    v.addEventListener('loadedmetadata', () => {
      try {
        v.currentTime = Math.min(seekTo, v.duration || seekTo);
      } catch{}
      tryPlay();
      // Flag it as autoplay only AFTER the seek — setting it before src (like the
      // no-seek branch) would make the browser start at frame 0 and flash it
      // before the cover frame. The flag itself is just a marker so a pause/resume
      // manager (e.g. animationIntersector) knows the clip is meant to be playing.
      v.autoplay = true;
    }, {once: true});
    v.addEventListener('canplay', tryPlay, {once: true}); // backstop
  } else {
    v.autoplay = true;
    v.addEventListener('loadeddata', tryPlay, {once: true});
    v.addEventListener('canplay', tryPlay, {once: true});
  }

  v.src = url; // assign last so the autoplay policy sees muted=true
  if(!seekTo) tryPlay();

  return v;
}
