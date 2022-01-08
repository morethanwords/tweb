export default function getScreenConstraints(): DisplayMediaStreamConstraints {
  return {
   video: {
      // @ts-ignore
      // cursor: 'always',
      width: {max: 1920},
      height: {max: 1080},
      frameRate: {max: 30}
    },
    audio: true
  };
}
