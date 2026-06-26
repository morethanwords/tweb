import {I18nTsx} from '@helpers/solid/i18n';
import {AiComposeTone, TextWithEntities} from '@layer';
import type SolidJSHotReloadGuardProvider from '@lib/solidjs/hotReloadGuardProvider';
import {LocalTextWithEntities} from '@types';
import {createSignal} from 'solid-js';
import PopupElement, {createPopup} from '../indexTsx';
import styles from './aiEditorPopup.module.scss';
import {AiEditorPopupBodyContent} from './bodyContent';
import {AiEditorPopupContext, AiEditorPopupContextValue} from './context';


export type AiEditorPopupProps = {
  peerId: PeerId;
  text: TextWithEntities.textWithEntities;
  initialTones?: AiComposeTone[];
  onApply: (text: LocalTextWithEntities) => void;
  onSend?: (text: LocalTextWithEntities) => void;
};

const AiEditorPopup = (props: AiEditorPopupProps) => {
  const [show, setShow] = createSignal(true);

  const contextValue: AiEditorPopupContextValue = {
    ...props,
    /** Will get overriden if undefined once the tones are fetched */
    initialTones: props.initialTones,
    onApply: (...args) => {
      props.onApply(...args);
      setShow(false);
    },
    onSend: props.onSend ? (...args) => {
      props.onSend(...args);
      setShow(false);
    } : undefined,
    resultTextSignal: createSignal<TextWithEntities>()
  };

  return (
    <PopupElement
      show={show()}
      class={styles.popup}
      containerClass={styles.container}
    >
      <PopupElement.Header class={styles.header}>
        <PopupElement.CloseButton class={styles.closeButton} />
        <PopupElement.Title>
          <I18nTsx key='AiEditor.Title' />
        </PopupElement.Title>
      </PopupElement.Header>
      <PopupElement.Body>
        <AiEditorPopupContext.Provider value={contextValue}>
          <AiEditorPopupBodyContent />
        </AiEditorPopupContext.Provider>
      </PopupElement.Body>
    </PopupElement>
  );
};

export function openAiEditorPopup(props: AiEditorPopupProps, HotReloadGuard: typeof SolidJSHotReloadGuardProvider) {
  createPopup(() => <HotReloadGuard><AiEditorPopup {...props} /></HotReloadGuard>);
}
