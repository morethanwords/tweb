import PopupElement, {createPopup} from '@components/popups/indexTsx';
import appImManager from '@lib/appImManager';
import TelegramWebView from '@components/telegramWebView';
import getWebViewTgLink from '@helpers/getWebViewTgLink';
import {createSignal, onCleanup, onMount} from 'solid-js';
import I18n from '@lib/langPack';

export function createVerificationIframe(options: ConstructorParameters<typeof TelegramWebView>[0]) {
  const result = new TelegramWebView({
    ...options,
    sandbox: 'allow-forms allow-scripts allow-same-origin allow-modals'
  });
  const {iframe} = result;
  iframe.allow = 'payment';
  iframe.title = I18n.format('Checkout.WebConfirmation.Title', true);
  iframe.classList.add('payment-verification');
  return result;
}

export default function showPaymentVerificationPopup(options: {
  url: string,
  openPathAfter?: boolean,
  onFinish?: () => void,
  onClose?: () => void
}) {
  const [show, setShow] = createSignal(true);

  const telegramWebView = createVerificationIframe({url: options.url});

  telegramWebView.addEventListener('web_app_open_tg_link', (e) => {
    options.onFinish?.();
    setShow(false);
    if(options.openPathAfter) {
      appImManager.openUrl(getWebViewTgLink(e.path_full));
    }
  });

  createPopup(() => {
    onMount(() => telegramWebView.onMount());
    onCleanup(() => telegramWebView.destroy());

    return (
      <PopupElement class="popup-payment popup-payment-verification" closable show={show()} onClose={options.onClose}>
        <PopupElement.Header>
          <PopupElement.CloseButton />
          <PopupElement.Title title="Checkout.WebConfirmation.Title" />
        </PopupElement.Header>
        <PopupElement.Body>{telegramWebView.iframe}</PopupElement.Body>
      </PopupElement>
    );
  });

  return {hide: () => setShow(false)};
}
