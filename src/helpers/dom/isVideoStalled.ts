/**
 * A `waiting` video that is stalled on data still on its way, so a loader should show — not one
 * waiting on a seek it already has the data for.
 */
export default function isVideoStalled(video: HTMLVideoElement) {
  return video.networkState === video.NETWORK_LOADING && video.readyState < video.HAVE_FUTURE_DATA;
}
