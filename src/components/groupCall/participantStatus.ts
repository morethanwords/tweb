/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import replaceContent from '../../helpers/dom/replaceContent';
import setInnerHTML from '../../helpers/dom/setInnerHTML';
import {GroupCallParticipant} from '../../layer';
import {i18n} from '../../lib/langPack';
import {GROUP_CALL_PARTICIPANT_MUTED_STATE} from '.';
import {GroupCallParticipantVideoType} from './participantVideo';
import wrapEmojiText from '../../lib/richTextProcessor/wrapEmojiText';
import Icon from '../icon';

const className = 'group-call-participant-status';
export default class GroupCallParticipantStatusElement {
  public container: HTMLElement;

  constructor(private withIcons: GroupCallParticipantVideoType[]) {
    this.container = document.createElement('div');
    this.container.classList.add(className + '-container');
  }

  public setState(state: GROUP_CALL_PARTICIPANT_MUTED_STATE, participant: GroupCallParticipant) {
    const states = GROUP_CALL_PARTICIPANT_MUTED_STATE;
    const icons = this.withIcons.filter((type) => !!participant[type]).map((type) => {
      const iconClassName: Icon = `${type === 'presentation' ? 'listscreenshare' : 'videocamera_filled'}`;
      const i = Icon(iconClassName, className + '-icon', className + '-icon-' + type);
      return i;
    });

    let element2: HTMLElement, actionClassName: string;
    if(state === states.MUTED_FOR_ME) {
      element2 = i18n('VoiceChat.Status.MutedForYou');
      actionClassName = 'is-muted';
    } else if(state === states.UNMUTED) {
      element2 = i18n('VoiceChat.Status.Speaking');
      actionClassName = 'is-speaking';
    } else if(state === states.HAND) {
      element2 = i18n('VoiceChat.Status.WantsSpeak');
      actionClassName = 'is-waiting';
    } else if(participant.about && !icons.length) {
      setInnerHTML(this.container, wrapEmojiText(participant.about));
      return;
    } else {
      element2 = i18n('VoiceChat.Status.Listening');
      actionClassName = 'is-listening';
    }

    const span = document.createElement('span');
    span.classList.add(className, actionClassName);
    span.append(...icons, element2);

    replaceContent(this.container, span);
  }
}
