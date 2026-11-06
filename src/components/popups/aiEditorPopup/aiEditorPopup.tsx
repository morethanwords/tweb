import {I18nTsx} from '@helpers/solid/i18n';
import {AiComposeTone, InputRichMessage, RichMessage, TextWithEntities} from '@layer';
import type SolidJSHotReloadGuardProvider from '@lib/solidjs/hotReloadGuardProvider';
import {LocalTextWithEntities} from '@types';
import PopupElement, {createPopup} from '../indexTsx';
import styles from './aiEditorPopup.module.scss';
import {AiEditorPopupBodyContent} from './bodyContent';
import AiEditorPopupProvider from '@components/popups/aiEditorPopup/provider';
import type {AiSendStyle} from '@components/chat/aiSendStyles';


export type AiEditorSendOptions = {
  silent?: boolean;
  scheduleDate?: number;
  scheduleRepeatPeriod?: number;
  effect?: DocId;
};

export type AiEditorActionResult = MaybePromise<boolean | void>;

export type AiEditorPopupProps = {
  peerId: PeerId;
  text: TextWithEntities.textWithEntities;
  richMessage?: InputRichMessage.inputRichMessage;
  initialTones?: AiComposeTone[];
  onApply: (text: LocalTextWithEntities) => AiEditorActionResult;
  onApplyRichMessage?: (richMessage: RichMessage) => AiEditorActionResult;
  onSend?: (text: LocalTextWithEntities, options?: AiEditorSendOptions) => AiEditorActionResult;
  onSendRichMessage?: (richMessage: RichMessage, options?: AiEditorSendOptions) => AiEditorActionResult;
  canSendWhenOnline?: () => boolean | Promise<boolean>;
  /** When true, sending always opens the schedule popup and the send context menu is hidden */
  isScheduled?: boolean;
  /** The request saved to be made on every message the chat sends, if one is */
  savedSendStyle?: AiSendStyle;
  /**
   * Keeps a request of the editor for the chat, to be made on every message it sends (or none, given none): "Always use
   * in this chat". Whether it is kept
   */
  onSaveSendStyle?: (style: AiSendStyle | undefined) => boolean;
};

const AiEditorPopup = (props: AiEditorPopupProps) => {
  return (
    <PopupElement
      class={styles.popup}
      containerClass={styles.container}
    >
      <PopupElement.Header>
        <PopupElement.CloseButton />
        <PopupElement.Title>
          <I18nTsx key='AiEditor.Title' />
        </PopupElement.Title>
      </PopupElement.Header>
      <PopupElement.Body>
        <AiEditorPopupProvider {...props}>
          <AiEditorPopupBodyContent />
        </AiEditorPopupProvider>
      </PopupElement.Body>
    </PopupElement>
  );
};

export function openAiEditorPopup(props: AiEditorPopupProps, HotReloadGuard: typeof SolidJSHotReloadGuardProvider) {
  createPopup(() => <HotReloadGuard><AiEditorPopup {...props} /></HotReloadGuard>);
}
