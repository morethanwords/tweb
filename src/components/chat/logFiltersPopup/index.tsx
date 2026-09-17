import type SolidJSHotReloadGuardProvider from '@lib/solidjs/hotReloadGuardProvider';
import PopupElement, {createPopup} from '@components/popups/indexTsx';
import LogFiltersPopupContent, {LogFiltersPopupContentProps} from '@components/chat/logFiltersPopup/content';
import {createSignal} from 'solid-js';

type Args = LogFiltersPopupContentProps & {
  HotReloadGuard: typeof SolidJSHotReloadGuardProvider;
};

export default function showLogFiltersPopup({HotReloadGuard, onFinish, ...rest}: Args) {
  const [show, setShow] = createSignal(true);

  const content = new LogFiltersPopupContent;
  content.HotReloadGuard = HotReloadGuard;
  content.feedProps({
    ...rest,
    onFinish: (payload) => {
      onFinish(payload);
      setShow(false);
    }
  });

  createPopup(() => (
    <PopupElement class="log-filters-popup" closable show={show()}>
      <PopupElement.Header>
        <PopupElement.CloseButton />
        <PopupElement.Title title="RecentActions" />
      </PopupElement.Header>
      <PopupElement.Body>{content}</PopupElement.Body>
    </PopupElement>
  ));
}
