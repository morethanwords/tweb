/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import { deepEqual } from "../../helpers/object";
import { GroupCall } from "../../layer";
import { GroupCallInstance } from "../../lib/appManagers/appGroupCallsManager";
import GROUP_CALL_STATE from "../../lib/calls/groupCallState";
import I18n, { LangPackKey, FormatterArguments } from "../../lib/langPack";

export default class GroupCallDescriptionElement {
  private descriptionIntl: I18n.IntlElement;

  constructor(private appendTo: HTMLElement) {
    this.descriptionIntl = new I18n.IntlElement({
      key: 'VoiceChat.Status.Connecting'
    });

    this.descriptionIntl.element.classList.add('group-call-description');

    appendTo.append(this.descriptionIntl.element);
  }

  public update(instance: GroupCallInstance) {
    const {state} = instance;
    
    let key: LangPackKey, args: FormatterArguments;
    if(state === GROUP_CALL_STATE.CONNECTING) {
      key = 'VoiceChat.Status.Connecting';
    } else {
      key = 'VoiceChat.Status.Members';
      args = [(instance.groupCall as GroupCall.groupCall).participants_count];
    }

    const {descriptionIntl} = this;
    
    if(descriptionIntl.key !== key || !deepEqual(descriptionIntl.args, args)) {
      descriptionIntl.key = key;
      descriptionIntl.args = args;
      descriptionIntl.update();
    }
  }
}
