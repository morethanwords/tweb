import {SuperLottieIcon} from '@components/superIcon';

export default class GroupCallMicrophoneIconMini extends SuperLottieIcon<{
  PartState: boolean,
  ColorState: boolean,
  Items: {
    name: 'voice_mini'
  }[]
}> {
  constructor(colored?: boolean, skipAnimation?: boolean, size?: number) {
    super({
      width: size,
      height: size,
      getPart: (state) => {
        return this.getItem().getPart(state ? 'unmute' : 'mute');
      },
      getColor: colored ? (state) => {
        return state ? [255, 255, 255] : [158, 158, 158];
      } : undefined,
      skipAnimation
    });

    this.add({
      name: 'voice_mini',
      parts: [{
        startFrame: 0,
        endFrame: 35,
        name: 'hand-to-muted'
      }, {
        startFrame: 36,
        endFrame: 68,
        name: 'unmute'
      }, {
        startFrame: 69,
        endFrame: 98,
        name: 'mute'
      }, {
        startFrame: 99,
        endFrame: 135,
        name: 'muted-to-hand'
      }, {
        startFrame: 136,
        endFrame: 171,
        name: 'unmuted-to-hand'
      }]
    });
  }
}
