import PopupElement from '@components/popups';
import SuggestedPostRejectPopupContent from '@components/chat/bubbleParts/suggestedPostRejectPopup/content';


type Args = {
  peerId: PeerId;
  messageId: number;
};

export default class SuggestedPostRejectPopup extends PopupElement {
  constructor({peerId, messageId}: Args) {
    super('suggested-post-popup', {
      overlayClosable: true,
      closable: true,
      body: true,
      title: 'SuggestedPosts.RejectOffer'
    });

    const content = new SuggestedPostRejectPopupContent;
    content.feedProps({
      peerId,
      messageId,
      onFinish: () => {
        this.hide();
      }
    })

    this.body.append(content);
  }
}
