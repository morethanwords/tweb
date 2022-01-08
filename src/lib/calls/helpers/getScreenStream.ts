export default async function getScreenStream(constraints: DisplayMediaStreamConstraints) {
  const screenStream = await navigator.mediaDevices.getDisplayMedia(constraints);
  return screenStream;
}
