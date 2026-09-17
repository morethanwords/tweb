import {Message} from '@layer';
import type SolidJSHotReloadGuardProvider from '@lib/solidjs/hotReloadGuardProvider';
import PopupElement, {createPopup} from '@components/popups/indexTsx';
import SuggestedPostAcceptWithTimePopupContent from '@components/chat/bubbleParts/suggestedPostAcceptWithTimePopup/content';
import {createSignal} from 'solid-js';

type Args = {
  peerId: PeerId;
  message: Message.message;
  HotReloadGuard: typeof SolidJSHotReloadGuardProvider;
  offeredStars?: number;
};

export default function showSuggestedPostAcceptWithTimePopup({peerId, message, offeredStars, HotReloadGuard}: Args) {
  const [show, setShow] = createSignal(true);

  const content = new SuggestedPostAcceptWithTimePopupContent;
  content.HotReloadGuard = HotReloadGuard;
  content.feedProps({
    peerId,
    message,
    offeredStars,
    onFinish: () => setShow(false)
  });

  createPopup(() => (
    <PopupElement class="suggested-post-popup" closable show={show()}>
      <PopupElement.Header>
        <PopupElement.CloseButton />
        <PopupElement.Title title="SuggestedPosts.AcceptOffer" />
      </PopupElement.Header>
      <PopupElement.Body>{content}</PopupElement.Body>
    </PopupElement>
  ));
}
