import {I18nTsx} from '@helpers/solid/i18n';
import {Message, TextWithEntities} from '@layer';
import type SolidJSHotReloadGuardProvider from '@lib/solidjs/hotReloadGuardProvider';
import PopupElement, {createPopup} from '../indexTsx';
import {TranslatePopupBodyContent} from './bodyContent';
import styles from './translate.module.scss';


export type TranslatePopupOptions = {
  peerId: PeerId,
  message?: Message.message,
  textWithEntities?: TextWithEntities,
  detectedLanguage: TranslatableLanguageISO
};

function TranslatePopup(props: {options: TranslatePopupOptions}) {
  // Collected from media-caption clicks (the old `hideWithCallback`); drained
  // after the close animation via `onCloseAfterTimeout`.
  const deferredCloseCallbacks: (() => void)[] = [];

  return (
    <PopupElement
      class={styles.popup}
      containerClass={styles.container}
      closable
      onCloseAfterTimeout={() => {
        deferredCloseCallbacks.splice(0).forEach((cb) => cb());
      }}
    >
      <PopupElement.Header class={styles.header}>
        <PopupElement.CloseButton />
        <PopupElement.Title>
          <I18nTsx key='Translate' />
        </PopupElement.Title>
      </PopupElement.Header>
      <PopupElement.Body>
        <TranslatePopupBodyContent
          options={props.options}
          deferredCloseCallbacks={deferredCloseCallbacks}
        />
      </PopupElement.Body>
    </PopupElement>
  );
}

export function openTranslatePopup(
  options: TranslatePopupOptions,
  HotReloadGuard: typeof SolidJSHotReloadGuardProvider
) {
  createPopup(() => (
    <HotReloadGuard>
      <TranslatePopup options={options} />
    </HotReloadGuard>
  ));
}
