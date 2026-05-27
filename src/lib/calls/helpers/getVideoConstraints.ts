import {appSettings} from '@stores/appSettings';

// `deviceId` mirrors getAudioConstraints — when the user has picked a camera
// in the Speakers-and-Camera settings tab, propagate it here so
// `getUserMedia({video})` picks up the chosen device. Falls back to OS default.
//
// Uses `ideal` instead of `min` for resolution/framerate. Strict `min`
// constraints turn into a hard OverconstrainedError when paired with a
// `deviceId: {exact: ...}` lookup because the browser can't fall back to a
// different camera; observed locally with FaceTime HD whose framerate steps
// don't include the requested 24–30 window. With `ideal` the browser picks
// the closest mode the chosen device actually supports.
export default function getVideoConstraints(deviceId?: string): MediaTrackConstraints {
  const constraints: MediaTrackConstraints = {
    width: {ideal: 1280, max: 1920},
    height: {ideal: 720, max: 1080},
    frameRate: {ideal: 30, max: 30}
  };

  const id = deviceId ?? appSettings.callDevices?.cameraId;
  if(id) {
    constraints.deviceId = {exact: id};
  }

  return constraints;
}
