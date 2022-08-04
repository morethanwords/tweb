/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import RLottieIcon from '../../lib/rlottie/rlottieIcon';
import {GROUP_CALL_PARTICIPANT_CLEARED_MUTED_STATE, GROUP_CALL_PARTICIPANT_MUTED_STATE, getColorByMutedState, clearMutedStateModifier} from '.';
import {SuperRLottieIcon} from '../superIcon';

export default class GroupCallParticipantMutedIcon extends SuperRLottieIcon<{
  PartState: GROUP_CALL_PARTICIPANT_CLEARED_MUTED_STATE,
  ColorState: GROUP_CALL_PARTICIPANT_MUTED_STATE
}> {
  constructor(private colored: boolean) {
    super({
      width: 32,
      height: 32,
      getPart: (state, prevState) => {
        const states = GROUP_CALL_PARTICIPANT_MUTED_STATE;

        let index: number;
        switch(state) {
          case states.HAND:
            index = 3;
            break;
          case states.MUTED:
            index = prevState === states.HAND ? 0 : 2;
            break;
          case states.UNMUTED:
            index = 1;
            break;
        }

        return this.getItem().getPart(index);
      },
      getColor: colored ? (state, prevState) => {
        return getColorByMutedState(state);
      } : undefined
    });

    const className = 'group-call-participant-muted-icon';
    this.container.classList.add(className + '-container');

    const parts = RLottieIcon.generateEqualParts(4, 21);
    this.add({
      name: 'voice_outlined2',
      parts
    });
  }

  public setState(state: GROUP_CALL_PARTICIPANT_MUTED_STATE) {
    return super.setState(clearMutedStateModifier(state), state);
  }
}
