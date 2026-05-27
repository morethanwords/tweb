/*
 * Placeholder media streams for the P2P call: a disabled silent audio track and
 * a disabled black video track. Used as the sender track while a real
 * camera/microphone track is absent, so the transceiver direction stays stable.
 */

import createCanvasStream from '@helpers/canvas/createCanvasStream';

export function silence(audioContext: AudioContext) {
  const oscillator = audioContext.createOscillator();
  const destination = audioContext.createMediaStreamDestination();
  oscillator.connect(destination);
  oscillator.start();

  const track = destination.stream.getAudioTracks()[0];
  track.enabled = false;
  return new MediaStream([track]);
}

export function black({width, height}: {width: number, height: number}) {
  // createCanvasStream (tweb's helper) already paints the canvas black via the
  // default fillStyle; we only need to disable the track for a placeholder.
  const stream = createCanvasStream({width, height});
  stream.getVideoTracks()[0].enabled = false;
  return stream;
}
