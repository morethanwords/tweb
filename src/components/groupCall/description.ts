import Icon from '@components/icon';
import {GroupCall} from '@layer';
import GroupCallInstance from '@lib/calls/groupCallInstance';
import GROUP_CALL_STATE from '@lib/calls/groupCallState';
import I18n, {LangPackKey, FormatterArguments} from '@lib/langPack';

export default class GroupCallDescriptionElement {
  private descriptionIntl: I18n.IntlElement;
  private shortDescription: HTMLElement;
  private mounted: HTMLElement;

  constructor(private appendTo: HTMLElement, private useIcon?: boolean) {
    this.descriptionIntl = new I18n.IntlElement({
      key: 'VoiceChat.Status.Connecting'
    });

    this.descriptionIntl.element.classList.add('group-call-description');
  }

  public detach() {
    this.mounted.remove();
  }

  public update(instance: GroupCallInstance) {
    const {state} = instance;
    const groupCall = instance.groupCall as GroupCall.groupCall | undefined;
    const isConnecting = state === GROUP_CALL_STATE.CONNECTING;
    // Only use the compact "icon + count" form while connected — `Connecting`
    // is text, no count to show, so fall back to the i18n element.
    const useShort = this.useIcon && !isConnecting;

    let mount: HTMLElement;
    if(useShort) {
      if(!this.shortDescription) {
        this.shortDescription = document.createElement('span');
        this.shortDescription.classList.add('group-call-description');
      }
      this.shortDescription.replaceChildren(
        Icon('newprivate_filled', 'inline-icon'),
        '' + (groupCall?.participants_count ?? 1)
      );
      mount = this.shortDescription;
    } else {
      let key: LangPackKey, args: FormatterArguments;
      if(isConnecting) {
        key = 'VoiceChat.Status.Connecting';
      } else {
        key = 'VoiceChat.Status.Members';
        args = [groupCall?.participants_count ?? 1];
      }
      this.descriptionIntl.compareAndUpdate({key, args});
      mount = this.descriptionIntl.element;
    }

    // The host (`appendTo`) is sometimes cleared externally — e.g. topbarCall's
    // `clearCurrentInstance` does `statusEl.replaceChildren()`. After such a
    // clear, `this.mounted` keeps pointing at a detached node, so a plain
    // `replaceWith` silently no-ops. Re-mount unconditionally when needed.
    if(this.mounted && this.mounted !== mount) {
      this.mounted.remove();
    }
    if(!mount.parentElement) {
      this.appendTo.append(mount);
    }
    this.mounted = mount;
  }
}
