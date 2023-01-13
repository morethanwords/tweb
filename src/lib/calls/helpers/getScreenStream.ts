export default async function getScreenStream(constraints: DisplayMediaStreamOptions) {
  const screenStream = await navigator.mediaDevices.getDisplayMedia(constraints);
  const track = screenStream.getVideoTracks()[0];
  track.contentHint = 'text';
  return screenStream;
}
