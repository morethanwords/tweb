import EmojiDocumentIcon from '@components/emojiDocumentIcon';
import {IconTsx} from '@components/iconTsx';
import InputField from '@components/inputField';
import PopupElement from '@components/popups/indexTsx';
import ripple from '@components/ripple';
import Scrollable from '@components/scrollable2';
import SimpleFormField from '@components/simpleFormField';
import Space from '@components/space';
import {StaticCheckbox} from '@components/staticCheckbox';
import cloneDOMRect from '@helpers/dom/cloneDOMRect';
import {keepMe} from '@helpers/keepMe';
import {createMutation} from '@helpers/solid/createMutation';
import {I18nTsx} from '@helpers/solid/i18n';
import {wrapAsyncClickHandler} from '@helpers/wrapAsyncClickHandler';
import {CreateToneArgs} from '@lib/appManagers/aiTonesManager';
import {LangPackKey} from '@lib/langPack';
import {useHotReloadGuard} from '@lib/solidjs/hotReloadGuard';
import {createEffect, createMemo, createSignal, mergeProps, Show} from 'solid-js';
import {useCreateToneLimits} from './limits';
import styles from './styles.module.scss';

keepMe(ripple);


type SubmitPayload = CreateToneArgs;

export type CreateTonePopupProps = {
  titleLangKey?: LangPackKey;
  submitLangKey?: LangPackKey;
  errorLangKey?: LangPackKey;
  initialValues?: Partial<SubmitPayload>;
  onSubmit: (payload: SubmitPayload) => Promise<void>;
};

const CreateTonePopup = (inProps: CreateTonePopupProps) => {
  const props = mergeProps({
    titleLangKey: 'AiEditor.NewStyle.Title',
    submitLangKey: 'Create',
    errorLangKey: 'AiEditor.NewStyle.Error'
  }, inProps);

  const {useEmojiDropdown, rootScope, toastNew} = useHotReloadGuard();

  const [styleName, setStyleName] = createSignal(props.initialValues?.title ?? '');
  const [instructions, setInstructions] = createSignal(props.initialValues?.prompt ?? '');
  const [docId, setDocId] = createSignal<DocId>(props.initialValues?.emojiId);
  const [displayAuthor, setDisplayAuthor] = createSignal(props.initialValues?.displayAuthor ?? false);

  const [emojiButton, setEmojiButton] = createSignal<HTMLElement>();

  const {maxTitleLength, maxInstructionsLength} = useCreateToneLimits();

  const canSubmit = createMemo(() => {
    if(!styleName().length || styleName().length > maxTitleLength()) return false;
    if(!instructions().length || instructions().length > maxInstructionsLength()) return false;
    if(!docId()) return false;

    if(props.initialValues &&
      props.initialValues.title === styleName() &&
      props.initialValues.emojiId === docId() &&
      props.initialValues.displayAuthor === displayAuthor() &&
      props.initialValues.prompt === instructions()
    ) return false;

    return true;
  });

  const submitMutation = createMutation(props.onSubmit, {
    onError: () => toastNew({
      langPackKey: props.errorLangKey
    })
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
      canUsePremiumEmojiAlways: true,
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

  instructionsInputField.setValueSilently(props.initialValues?.prompt ?? '');

  return (
    <PopupElement class={styles.popup} containerClass={styles.popupContainer}>
      <PopupElement.Header class={styles.popupHeader}>
        <PopupElement.CloseButton class={styles.popupCloseButton} />
        <PopupElement.Title title={props.titleLangKey} />
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

        <Space amount='1rem' />

        <div class={styles.checkboxContainer} onClick={() => setDisplayAuthor(p => !p)} use:ripple>
          <StaticCheckbox round checked={displayAuthor()} />
          <div class={styles.checkboxText}>
            <I18nTsx key="AiEditor.NewStyle.AddLink" />
          </div>
        </div>

      </PopupElement.Body>
      <PopupElement.Footer class={styles.popupFooter}>
        <PopupElement.FooterButton
          disabled={!canSubmit() || submitMutation.isPending()}
          langKey={props.submitLangKey}
          callback={() => submitMutation.mutateAsync({
            emojiId: docId(),
            title: styleName(),
            prompt: instructions(),
            displayAuthor: displayAuthor()
          })}
        />
      </PopupElement.Footer>
    </PopupElement>
  );
};

export default CreateTonePopup;
