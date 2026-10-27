import PopupElement, {createPopup} from '@components/popups/indexTsx';
import AccountsLimitPopupContent from '@components/sidebarLeft/accountsLimitPopupContent';
import {createSignal} from 'solid-js';
import {hotReloadGuard} from '@lib/solidjs/hotReloadGuardProvider';

export default function showAccountsLimitPopup() {
  const [show, setShow] = createSignal(true);

  createPopup(() => (
    <PopupElement class="accounts-limit-popup" closable>
      <PopupElement.Header>
        <PopupElement.Title title="LimitReached" />
      </PopupElement.Header>
      <PopupElement.Body>
        {AccountsLimitPopupContent({
          onCancel: () => setShow(false),
          onSubmit: () => {
            setShow(false);
            hotReloadGuard.showPremiumPopup({feature: 'double_limits'});
          }
        })}
      </PopupElement.Body>
    </PopupElement>
  ));
}
