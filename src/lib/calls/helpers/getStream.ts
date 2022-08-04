export default async function getStream(constraints: MediaStreamConstraints, muted: boolean) {
  // console.log('getStream', constraints);

  const stream = await navigator.mediaDevices.getUserMedia(constraints);
  stream.getTracks().forEach((x) => {
    x.enabled = !muted;
  });

  // console.log('getStream result', stream);
  return stream;
}

(window as any).getStream = getStream;
