import EmojiDocumentIcon from '@components/emojiDocumentIcon';
import {IconTsx} from '@components/iconTsx';
import PopupElement from '@components/popups/indexTsx';
import SimpleFormField from '@components/simpleFormField';
import Space from '@components/space';
import cloneDOMRect from '@helpers/dom/cloneDOMRect';
import {I18nTsx} from '@helpers/solid/i18n';
import {useHotReloadGuard} from '@lib/solidjs/hotReloadGuard';
import {createEffect, createMemo, createSignal, Show} from 'solid-js';
import {useCreateToneLimits} from './limits';
import styles from './styles.module.scss';
import InputField from '@components/inputField';
import Scrollable from '@components/scrollable2';


export type CreateTonePopupProps = {

}

const CreateTonePopup = (props: CreateTonePopupProps) => {
  const {useEmojiDropdown, rootScope, toastNew} = useHotReloadGuard();

  const [styleName, setStyleName] = createSignal('');
  const [instructions, setInstructions] = createSignal('');
  const [docId, setDocId] = createSignal<DocId>();

  const [emojiButton, setEmojiButton] = createSignal<HTMLElement>();

  const {maxTitleLength, maxInstructionsLength} = useCreateToneLimits();

  const canSubmit = createMemo(() => {
    if(styleName().length > maxTitleLength()) return;
    if(instructions().length > maxInstructionsLength()) return;
    if(!docId()) return;
    return true;
  });

  createEffect(() => {
    const {emoticonsDropdown} = useEmojiDropdown({
      element: emojiButton(),
      onClick: (emoji) => {
        emoticonsDropdown.toggle(false);
        if(!emoji.docId) {
          toastNew({
            langPackKey: 'AiEditor.NewStyle.EmojiUnsupported'
          });
          return;
        }
        setDocId(emoji.docId);
      },
      noRegularEmoji: true,
      noPacks: false,
      noSearchGroups: false,
      customParentElement: document.body,
      getOpenPosition: () => {
        const rect = emojiButton().getBoundingClientRect();
        const cloned = cloneDOMRect(rect);
        cloned.top = rect.bottom + 8;
        return cloned;
      }
    })
  });

  const instructionsInputField = new InputField({
    canWrapCustomEmojis: false,
    withLinebreaks: true,
    onRawInput: (value) => {
      setInstructions(value);
    }
  });

  instructionsInputField.input.classList.replace('input-field-input', styles.inputField);

  return (
    <PopupElement class={styles.popup} containerClass={styles.popupContainer}>
      <PopupElement.Header class={styles.popupHeader}>
        <PopupElement.CloseButton class={styles.popupCloseButton} />
        <PopupElement.Title title='AiEditor.NewStyle.Title' />
      </PopupElement.Header>
      <PopupElement.Body class={styles.popupBody}>
        <div class={styles.header}>
          <div class={styles.emojiButton} ref={setEmojiButton}>
            <div class={styles.emoji}>
              <Show when={docId()} fallback={<IconTsx icon='ai_style_tone' class={styles.emojiIcon} />} keyed>
                {(docId) =>
                  <EmojiDocumentIcon
                    docId={docId}
                    managers={rootScope.managers}
                    color='primary-text-color'
                    size={64}
                    onFail={() => setDocId()}
                  />
                }
              </Show>
            </div>
          </div>
        </div>

        <SimpleFormField.Section>
          <SimpleFormField
            value={styleName()}
            onChange={setStyleName}
          >
            <SimpleFormField.Label maxLength={maxTitleLength()}>
              <I18nTsx key="AiEditor.NewStyle.StyleName" />
            </SimpleFormField.Label>
            <SimpleFormField.Input forceFieldValue />
          </SimpleFormField>
        </SimpleFormField.Section>

        <SimpleFormField.Caption>
          <I18nTsx key="AiEditor.NewStyle.StyleNameDescription" />
        </SimpleFormField.Caption>

        <Space amount='1rem' />

        <SimpleFormField.Section>
          <SimpleFormField
            value={instructions()}
            onChange={setInstructions}
            withMinHeight
          >
            <SimpleFormField.Label maxLength={maxInstructionsLength()}>
              <I18nTsx key="AiEditor.NewStyle.Instructions" />
            </SimpleFormField.Label>
            <SimpleFormField.InputStub>
              <Scrollable class={styles.inputFieldScrollable} relative>
                {instructionsInputField.input}
              </Scrollable>
            </SimpleFormField.InputStub>
          </SimpleFormField>
        </SimpleFormField.Section>

        <SimpleFormField.Caption>
          <I18nTsx key="AiEditor.NewStyle.InstructionsDescription" />
        </SimpleFormField.Caption>
      </PopupElement.Body>
      <PopupElement.Footer class={styles.popupFooter}>
        <PopupElement.FooterButton
          disabled={!canSubmit()}
          langKey="Create"
          // callback={() => submitMutation.mutateAsync()}
        />
      </PopupElement.Footer>
    </PopupElement>
  );
};

export default CreateTonePopup;
