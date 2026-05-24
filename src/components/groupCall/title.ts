import setInnerHTML from '@helpers/dom/setInnerHTML';
import {GroupCall} from '@layer';
import GroupCallInstance from '@lib/calls/groupCallInstance';
import {NULL_PEER_ID} from '@appManagers/constants';
import wrapEmojiText from '@lib/richTextProcessor/wrapEmojiText';
import PeerTitle from '@components/peerTitle';

export default class GroupCallTitleElement {
  private peerTitle: PeerTitle;

  constructor(private appendTo: HTMLElement) {
    this.peerTitle = new PeerTitle({peerId: NULL_PEER_ID});
  }

  public update(instance: GroupCallInstance) {
    const {peerTitle, appendTo} = this;
    const groupCall = instance.groupCall as GroupCall.groupCall;
    if(groupCall?.title) {
      setInnerHTML(appendTo, wrapEmojiText(groupCall.title));
      return;
    }

    // TdE2E conferences don't have a backing chat — use a plain title.
    // Eventually this can list participant names.
    if(instance.e2e && (!instance.chatId || instance.chatId === NULL_PEER_ID)) {
      setInnerHTML(appendTo, wrapEmojiText('Encrypted call'));
      return;
    }

    const peerId = instance.chatId.toPeerId(true);
    if(peerTitle.options.peerId !== peerId) {
      peerTitle.options.peerId = peerId;
      peerTitle.update();
    }

    if(peerTitle.element.parentElement !== appendTo) {
      appendTo.append(peerTitle.element);
    }
  }
}
