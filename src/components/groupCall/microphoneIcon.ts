/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {RLottieIconItemPartOptions} from '../../lib/rlottie/rlottieIcon';
import {GROUP_CALL_MICROPHONE_BUTTON_STATE} from '.';
import {SuperRLottieIcon} from '../superIcon';

export default class GroupCallMicrophoneIcon extends SuperRLottieIcon<{
  PartState: GROUP_CALL_MICROPHONE_BUTTON_STATE
}> {
  constructor() {
    super({
      width: 36,
      height: 36,
      getPart: (state, prevState) => {
        const states = GROUP_CALL_MICROPHONE_BUTTON_STATE;
        let partName: string;
        switch(state) {
          case states.HAND:
            partName = prevState === states.MUTED ? 'muted-to-hand' : 'unmuted-to-hand';
            break;
          case states.MUTED:
            partName = prevState === states.HAND ? 'hand-to-muted' : 'mute';
            break;
          case states.UNMUTED:
            partName = 'unmute';
            break;
        }

        return this.getItem().getPart(partName);
      }
    });

    const className = 'group-call-microphone-icon';
    this.container.classList.add(className + '-container');

    const parts: RLottieIconItemPartOptions[] = [{
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
      endFrame: 172,
      name: 'unmuted-to-hand'
    }, {
      startFrame: 173,
      endFrame: 201,
      name: 'scheduled-crossing'
    }, {
      startFrame: 202,
      endFrame: 236,
      name: 'scheduled-to-muted'
    }, {
      startFrame: 237,
      endFrame: 273,
      name: 'scheduled-to-hand'
    }, {
      startFrame: 274,
      endFrame: 310,
      name: 'scheduled-crossed-to-hand'
    }, {
      startFrame: 311,
      endFrame: 343,
      name: 'scheduled-uncrossing'
    }, {
      startFrame: 344,
      endFrame: 375,
      name: 'scheduled-to-muted'
    }, {
      startFrame: 376,
      endFrame: 403,
      name: 'play-to-muted'
    }];

    this.add({
      name: 'voip_filled',
      parts
    });
  }
}
