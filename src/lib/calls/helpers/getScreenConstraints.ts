export default function getScreenConstraints(skipAudio?: boolean) {
  const constraints: DisplayMediaStreamConstraints = {
   video: {
      // @ts-ignore
      // cursor: 'always',
      width: {max: 1920},
      height: {max: 1080},
      frameRate: {max: 30}
    }
  };

  if(!skipAudio) {
    constraints.audio = true;
  }

  return constraints;
}
