import type SolidJSHotReloadGuardProvider from '@lib/solidjs/hotReloadGuardProvider';
import PopupElement, {createPopup} from '@components/popups/indexTsx';
import SuggestPostPopupContent, {SuggestPostPopupContentProps} from '@components/chat/suggestPostPopup/content';
import {createSignal} from 'solid-js';

type Args = SuggestPostPopupContentProps & {
  HotReloadGuard: typeof SolidJSHotReloadGuardProvider;
  suggestChange?: boolean;
};

export default function showSuggestPostPopup({HotReloadGuard, suggestChange, onFinish, ...rest}: Args) {
  const [show, setShow] = createSignal(true);

  const content = new SuggestPostPopupContent;
  content.HotReloadGuard = HotReloadGuard;
  content.feedProps({
    ...rest,
    onFinish: (payload) => {
      onFinish(payload);
      setShow(false);
    }
  });

  createPopup(() => (
    <PopupElement class="suggested-post-popup" closable show={show()}>
      <PopupElement.Header>
        <PopupElement.CloseButton />
        <PopupElement.Title title={suggestChange ? 'SuggestedPosts.SuggestAChange' : 'SuggestedPosts.SuggestAPost'} />
      </PopupElement.Header>
      <PopupElement.Body>{content}</PopupElement.Body>
    </PopupElement>
  ));
}
