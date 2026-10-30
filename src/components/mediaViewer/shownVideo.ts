/**
 * The `<video>` the current mover shows: the player's only while it stands in that mover — paging installs the next
 * mover before the outgoing player is cleaned up — else the mover's own one, once it is there
 */
export default function getShownVideo(mover: HTMLElement | undefined, playerVideo: HTMLVideoElement | undefined) {
  if(playerVideo && mover?.contains(playerVideo)) {
    return playerVideo;
  }

  return mover?.querySelector('video') ?? undefined;
}
