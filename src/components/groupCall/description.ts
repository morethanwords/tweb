import {GroupCall} from '@layer';
import GroupCallInstance from '@lib/calls/groupCallInstance';
import GROUP_CALL_STATE from '@lib/calls/groupCallState';
import I18n, {LangPackKey, FormatterArguments} from '@lib/langPack';

export default class GroupCallDescriptionElement {
  private descriptionIntl: I18n.IntlElement;

  constructor(private appendTo: HTMLElement) {
    this.descriptionIntl = new I18n.IntlElement({
      key: 'VoiceChat.Status.Connecting'
    });

    this.descriptionIntl.element.classList.add('group-call-description');
  }

  public detach() {
    this.descriptionIntl.element.remove();
  }

  public update(instance: GroupCallInstance) {
    const {state} = instance;
    const groupCall = instance.groupCall as GroupCall.groupCall | undefined;

    let key: LangPackKey, args: FormatterArguments;
    if(state === GROUP_CALL_STATE.CONNECTING) {
      key = 'VoiceChat.Status.Connecting';
    } else {
      key = 'VoiceChat.Status.Members';
      args = [groupCall?.participants_count ?? 1];
    }

    const {descriptionIntl} = this;
    descriptionIntl.compareAndUpdate({
      key,
      args
    });

    if(!this.descriptionIntl.element.parentElement) {
      this.appendTo.append(this.descriptionIntl.element);
    }
  }
}
