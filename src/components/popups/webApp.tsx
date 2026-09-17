import PopupElement, {createPopup} from '@components/popups/indexTsx';
import {fastRaf} from '@helpers/schedulers';
import {AttachMenuBot} from '@layer';
import ButtonMenuToggle from '@components/buttonMenuToggle';
import WebApp from '@components/webApp';
import ListenerSetter from '@helpers/listenerSetter';
import {createSignal, onCleanup, onMount} from 'solid-js';

export default function showWebAppPopup(options: {
  webViewResultUrl: WebApp['webViewResultUrl'],
  webViewOptions: WebApp['webViewOptions'],
  attachMenuBot?: AttachMenuBot,
  onClose?: () => void
}) {
  const [show, setShow] = createSignal(false);
  // the Mini App draws its own chrome into these, so they are elements rather than JSX
  const title = document.createElement('div');
  title.classList.add('popup-title');

  let webApp: WebApp;
  const [canGoBack, setCanGoBack] = createSignal(false);

  createPopup(() => {
    const listenerSetter = new ListenerSetter();
    let containerEl!: HTMLDivElement, headerEl: HTMLDivElement, bodyEl: HTMLDivElement;

    onMount(() => {
      webApp = new WebApp({
        ...options,
        header: headerEl,
        title,
        body: bodyEl,
        forceHide: () => setShow(false),
        onBackStatus: setCanGoBack
      });

      headerEl.append(ButtonMenuToggle({
        listenerSetter,
        buttons: webApp.getMenuButtons(),
        direction: 'bottom-left'
      }));

      webApp.init(() => {
        setShow(true);
        fastRaf(() => {
          containerEl.style.setProperty('--browser-width', `${containerEl.clientWidth}px`);
        });
      });
    });

    onCleanup(() => {
      listenerSetter.removeAll();
      webApp.destroy();
    });

    return (
      <PopupElement
        class="popup-payment popup-payment-verification popup-web-app"
        closable
        show={show()}
        containerProps={{ref: (element) => containerEl = element}}
        onClose={options.onClose}
        isConfirmationNeededOnClose={() => webApp.isConfirmationNeededOnClose()}
      >
        <PopupElement.Header ref={(element) => headerEl = element}>
          <PopupElement.CloseButton
            canGoBack={canGoBack()}
            onBackClick={() => webApp.onBackClick()}
          />
          {title}
        </PopupElement.Header>
        <PopupElement.Body ref={(element) => bodyEl = element} />
      </PopupElement>
    );
  });
}
