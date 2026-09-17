import PopupElement, {createPopup} from '@components/popups/indexTsx';
import SuggestedPostRejectPopupContent from '@components/chat/bubbleParts/suggestedPostRejectPopup/content';
import {createSignal} from 'solid-js';

type Args = {
  peerId: PeerId;
  messageId: number;
};

export default function showSuggestedPostRejectPopup({peerId, messageId}: Args) {
  const [show, setShow] = createSignal(true);

  const content = new SuggestedPostRejectPopupContent;
  content.feedProps({
    peerId,
    messageId,
    onFinish: () => setShow(false)
  });

  createPopup(() => (
    <PopupElement class="suggested-post-popup" closable show={show()}>
      <PopupElement.Header>
        <PopupElement.CloseButton />
        <PopupElement.Title title="SuggestedPosts.RejectOffer" />
      </PopupElement.Header>
      <PopupElement.Body>{content}</PopupElement.Body>
    </PopupElement>
  ));
}
