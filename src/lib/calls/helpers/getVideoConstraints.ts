export default function getVideoConstraints(): MediaTrackConstraints {
  return {
    width: {min: 1280, max: 1920/* , ideal: 1920 */},
    height: {min: 720, max: 1080/* , ideal: 1080 */},
    frameRate: {min: 24, max: 30}
  };
}
