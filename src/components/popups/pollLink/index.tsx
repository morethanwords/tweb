import {InputFieldTsx} from '@components/inputFieldTsx';
import type InputField from '@components/inputField';
import Section from '@components/section';
import {InviteLink} from '@components/sidebarLeft/tabs/inviteLink';
import ListenerSetter from '@helpers/listenerSetter';
import {doubleRaf} from '@helpers/schedulers';
import {I18nTsx} from '@helpers/solid/i18n';
import {subscribeOn} from '@helpers/solid/subscribeOn';
import {Message, MessageMedia, WebPage} from '@layer';
import {useHotReloadGuard} from '@lib/solidjs/hotReloadGuard';
import type SolidJSHotReloadGuardProvider from '@lib/solidjs/hotReloadGuardProvider';
import {createEffect, createMemo, createSignal, onCleanup, Show} from 'solid-js';
import PopupElement, {createPopup, usePopupContext} from '../indexTsx';
import styles from './styles.module.scss';
import PollLinkWebPagePreview, {hasRichWebPagePreview} from './webPagePreview';


type PollLinkEditorPopupProps = {
  initialUrl?: string;
  onClose?: () => void;
  onSubmit: (url: string) => void;
};

const PollLinkEditorPopup = (props: PollLinkEditorPopupProps) => {
  const [url, setUrl] = createSignal(props.initialUrl || '');
  const trimmedUrl = createMemo(() => url().trim());

  const Inner = () => {
    const popupContext = usePopupContext();
    let inputField: InputField;

    createEffect(() => {
      if(!popupContext.shown()) return;

      doubleRaf().then(() => {
        if(inputField.input.isConnected) inputField.input.focus();
      });
    });

    return (
      <>
        <PopupElement.Header>
          <PopupElement.CloseButton />
          <PopupElement.Title><I18nTsx key='Chat.Poll.AttachLink' /></PopupElement.Title>
        </PopupElement.Header>
        <PopupElement.Body>
          <Section noMarginBottom>
            <InputFieldTsx
              label='URL'
              name='url'
              plainText
              autocomplete='off'
              value={url()}
              onRawInput={setUrl}
              instanceRef={(value) => {
                inputField = value;
                inputField.input.setAttribute('autocapitalize', 'off');
                inputField.input.spellcheck = false;
              }}
            />
          </Section>
        </PopupElement.Body>
        <PopupElement.Footer>
          <PopupElement.FooterButton
            confirm
            disabled={!trimmedUrl()}
            langKey='Done'
            callback={() => props.onSubmit(trimmedUrl())}
          />
        </PopupElement.Footer>
      </>
    );
  };

  return (
    <PopupElement show class={styles.popup} containerClass={styles.container} onCloseAfterTimeout={props.onClose}>
      <Inner />
    </PopupElement>
  );
};

type PollLinkPreviewPopupProps = {
  url: string;
  preview?: MessageMedia.messageMediaWebPage;
  message: Message.message;
  onClose?: () => void;
};

const PollLinkPreviewPopup = (props: PollLinkPreviewPopupProps) => {
  const {appImManager, rootScope} = useHotReloadGuard();
  const [preview, setPreview] = createSignal(props.preview);
  let shouldRestoreTriggerFocus = true;

  const webPage = createMemo((): WebPage.webPage | undefined => {
    const webpage = preview()?.webpage;
    return webpage?._ === 'webPage' ? webpage : undefined;
  });

  createEffect(() => {
    const webpage = preview()?.webpage;
    if(!webpage || webpage._ === 'webPageNotModified' || !webpage.id) return;

    const webpageId = webpage.id;
    let active = true;
    onCleanup(() => {
      active = false;
    });

    const refreshPreview = async(onlyIfResolved = false) => {
      const updatedWebPage = await rootScope.managers.appWebPagesManager.getCachedWebPage(webpageId);
      if(!active || !updatedWebPage || (onlyIfResolved && updatedWebPage._ === 'webPagePending')) return;

      const currentPreview = preview();
      const currentWebPage = currentPreview?.webpage;
      if(!currentPreview || !currentWebPage || currentWebPage._ === 'webPageNotModified' || currentWebPage.id !== webpageId) return;

      setPreview({
        ...currentPreview,
        // Cached webpages are updated in place. Clone the outer webpage so a
        // resolved/media update invalidates keyed preview rendering as well.
        webpage: {...updatedWebPage}
      });
    };

    if(webpage._ === 'webPagePending') void refreshPreview(true);

    subscribeOn(rootScope)('webpage_updated', ({id}) => {
      if(id !== webpageId) return;
      void refreshPreview();
    });
  });

  const openLink = () => {
    shouldRestoreTriggerFocus = false;
    return appImManager.openUrl(props.url, true);
  };

  const Inner = () => {
    const popupContext = usePopupContext();
    const listenerSetter = new ListenerSetter();
    let openButton: HTMLButtonElement;
    onCleanup(() => listenerSetter.removeAll());

    createEffect(() => {
      if(!popupContext.shown()) return;

      doubleRaf().then(() => {
        if(openButton.isConnected) openButton.focus();
      });
    });

    const inviteLink = new InviteLink({
      button: false,
      listenerSetter,
      url: props.url
    });
    inviteLink.container.classList.add(styles.inviteLinkContainer);

    return (
      <>
        <PopupElement.Header>
          <PopupElement.CloseButton />
          <PopupElement.Title><I18nTsx key='OpenUrlTitle' /></PopupElement.Title>
        </PopupElement.Header>
        <PopupElement.Body class={styles.openLinkBody}>
          {inviteLink.container}
          <Show when={webPage()} keyed>
            {(page) => (
              <Show when={hasRichWebPagePreview(page)}>
                <PollLinkWebPagePreview
                  class={styles.webPagePreview}
                  media={preview()}
                  message={props.message}
                  onClose={(restoreTriggerFocus = true) => {
                    shouldRestoreTriggerFocus = restoreTriggerFocus;
                    popupContext.hide();
                  }}
                />
              </Show>
            )}
          </Show>
        </PopupElement.Body>
        <PopupElement.Footer>
          <PopupElement.FooterButton ref={openButton} confirm langKey='Open' callback={openLink} />
        </PopupElement.Footer>
      </>
    );
  };

  return (
    <PopupElement
      show
      old
      class={styles.popup}
      containerClass={styles.container}
      onCloseAfterTimeout={() => {
        if(shouldRestoreTriggerFocus) props.onClose?.();
      }}
    >
      <Inner />
    </PopupElement>
  );
};

export function openPollLinkEditorPopup(
  props: PollLinkEditorPopupProps,
  HotReloadGuard: typeof SolidJSHotReloadGuardProvider
) {
  createPopup(() => <HotReloadGuard><PollLinkEditorPopup {...props} /></HotReloadGuard>);
}

export function openPollLinkPreviewPopup(
  props: PollLinkPreviewPopupProps,
  HotReloadGuard: typeof SolidJSHotReloadGuardProvider
) {
  createPopup(() => <HotReloadGuard><PollLinkPreviewPopup {...props} /></HotReloadGuard>);
}
