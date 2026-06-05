import {I18nTsx} from '@helpers/solid/i18n';
import type SolidJSHotReloadGuardProvider from '@lib/solidjs/hotReloadGuardProvider';
import PopupElement, {createPopup} from '../indexTsx';
import styles from './aiEditorPopup.module.scss';
import {AiEditorPopupBodyContent} from './bodyContent';


type AiEditorPopupProps = {
};

const AiEditorPopup = (props: AiEditorPopupProps) => {
  return (
    <PopupElement
      show
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
        <AiEditorPopupBodyContent />
      </PopupElement.Body>
    </PopupElement>
  );
};

export function openAiEditorPopup(props: AiEditorPopupProps, HotReloadGuard: typeof SolidJSHotReloadGuardProvider) {
  createPopup(() => <HotReloadGuard><AiEditorPopup {...props} /></HotReloadGuard>);
}
