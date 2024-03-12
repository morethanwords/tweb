/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import replaceContent from '../../helpers/dom/replaceContent';
import toHHMMSS from '../../helpers/string/toHHMMSS';
import CallInstance from '../../lib/calls/callInstance';
import CALL_STATE from '../../lib/calls/callState';
import {i18n, LangPackKey} from '../../lib/langPack';

export default class CallDescriptionElement {
  private container: HTMLElement;
  private state: CALL_STATE;
  private interval: number;

  constructor(private appendTo: HTMLElement) {
    this.container = document.createElement('div');
    this.container.classList.add('call-description');
  }

  public detach() {
    if(this.interval !== undefined) {
      clearInterval(this.interval);
      this.interval = undefined;
    }

    this.container.remove();
    this.state = undefined;
  }

  public update(instance: CallInstance) {
    const {connectionState} = instance;

    if(this.state === connectionState) {
      return;
    }

    this.state = connectionState;

    let element: HTMLElement;
    if(connectionState === CALL_STATE.CONNECTED) {
      element = document.createElement('span');
      element.classList.add('call-description-duration');

      const setTime = () => {
        element.innerText = toHHMMSS(instance.duration, true);
      };

      this.interval = window.setInterval(setTime, 1000);
      setTime();
    } else {
      let langPackKey: LangPackKey;
      switch(connectionState) {
        case CALL_STATE.PENDING:
          langPackKey = instance.isOutgoing ? 'Call.StatusRinging' : 'Call.StatusCalling';
          break;
        case CALL_STATE.REQUESTING:
          langPackKey = 'Call.StatusRequesting';
          break;
        case CALL_STATE.EXCHANGING_KEYS:
          langPackKey = 'VoipExchangingKeys';
          break;
        case CALL_STATE.CLOSED:
          langPackKey = instance.connectedAt !== undefined ? 'Call.StatusEnded' : 'Call.StatusFailed';
          break;
        default:
          langPackKey = 'Call.StatusConnecting';
          break;
      }

      element = i18n(langPackKey);
      if(this.interval !== undefined) {
        clearInterval(this.interval);
        this.interval = undefined;
      }
    }

    this.container.classList.toggle('has-duration', connectionState === CALL_STATE.CONNECTED);
    replaceContent(this.container, element);

    if(!this.container.parentElement) {
      this.appendTo.append(this.container);
    }
  }
}
