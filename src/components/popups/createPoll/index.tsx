import editableFieldStyles from '@/scss/modulePartials/editableFieldContent.module.scss';
import Button from '@components/buttonTsx';
import InputField from '@components/inputField';
import Scrollable from '@components/scrollable2';
import SimpleFormField from '@components/simpleFormField';
import Space from '@components/space';
import getRichValueWithCaret from '@helpers/dom/getRichValueWithCaret';
import {I18nTsx} from '@helpers/solid/i18n';
import classNames from '@helpers/string/classNames';
import {useHotReloadGuard} from '@lib/solidjs/hotReloadGuard';
import type SolidJSHotReloadGuardProvider from '@lib/solidjs/hotReloadGuardProvider';
import {createSignal, Show} from 'solid-js';
import PopupElement, {createPopup, useSnitchedPopupContext} from '../indexTsx';
import {supportedDescriptionFormattingTypes} from './config';
import {EmojiButtonWithOpacity as EmojiDropdownButton} from './emojiButtonWithOpacity';
import {MediaAttachment} from './mediaAttachment';
import {PollOptionsSectionContent} from './pollOptionsSectionContent';
import {PollSettingsSectionContent} from './pollSettingsSectionContent';
import {CreatePollContext, CreatePollPayload, createPollStoreContextValue, SupportedMediaType, useCreatePollContext} from './storeContext';
import styles from './styles.module.scss';
import {useCreatePollLimits} from './useCreatePollLimits';
import {createFormFieldClickHandler, getFinalPayload, hasMeaningfulChanges, interactableClass, useCanSubmit, useSupportsMedia} from './utils';


type CreatePollPopupProps = {
  isBroadcast?: boolean;
  supportedMediaTypes?: SupportedMediaType[];
  onSubmit: (payload: CreatePollPayload) => void;
};

export const CreatePollPopup = (props: CreatePollPopupProps) => {
  const {confirmationPopup} = useHotReloadGuard();

  const context = createPollStoreContextValue({
    isBroadcast: () => props.isBroadcast ?? false,
    supportedMediaTypes: () => props.supportedMediaTypes ?? []
  });

  const {SnitchPopupContext, popupContext} = useSnitchedPopupContext();

  const isConfirmationNeededOnClose = () => {
    if(!hasMeaningfulChanges(context.store)) return false;

    return confirmationPopup({
      titleLangKey: 'CancelPollAlertTitle',
      descriptionLangKey: 'CancelPollAlertText',
      button: {
        langKey: 'Discard',
        isDanger: true
      }
    });
  };

  return (
    <PopupElement
      show
      class={styles.popup}
      containerClass={styles.container}
      isConfirmationNeededOnClose={isConfirmationNeededOnClose}
    >
      <SnitchPopupContext />
      <CreatePollContext.Provider value={context}>
        <Header
          onSubmit={() => {
            props.onSubmit(getFinalPayload(context));
            popupContext()?.destroy();
          }}
        />
        <hr class={styles.hr} />
        <PopupElement.Body>
          <BodyContent />
        </PopupElement.Body>
      </CreatePollContext.Provider>
    </PopupElement>
  );
};

const Header = (props: {
  onSubmit: () => void;
}) => {
  const canSubmit = useCanSubmit();

  return (
    <PopupElement.Header class={styles.header}>
      <PopupElement.CloseButton class={styles.closeButton} />

      <PopupElement.Title>
        <I18nTsx key='NewPoll' />
      </PopupElement.Title>

      <Button class={styles.confirmButton} primaryFilled onClick={props.onSubmit} disabled={!canSubmit()}>
        <I18nTsx key='Create' />
      </Button>
    </PopupElement.Header>
  );
};

const QuestionAndDescription = () => {
  const context = useCreatePollContext();
  const {maxQuestionLength, maxDescriptionLength} = useCreatePollLimits();
  const supportsMedia = useSupportsMedia();

  const questionInput = new InputField({
    canWrapCustomEmojis: true,
    onRawInput: () => {
      const {value, entities} = getRichValueWithCaret(questionInput.input);
      context.setStore({
        question: value,
        questionEntities: entities
      });
    }
  });

  questionInput.input.classList.replace('input-field-input', editableFieldStyles.editableFieldContent);

  const descriptionInput = new InputField({
    canHaveFormatting: supportedDescriptionFormattingTypes,
    canWrapCustomEmojis: true,
    withLinebreaks: true,
    onRawInput: () => {
      const {value, entities} = getRichValueWithCaret(descriptionInput.input);
      context.setStore({
        description: value,
        descriptionEntities: entities
      });
    }
  });

  descriptionInput.input.classList.replace('input-field-input', editableFieldStyles.editableFieldContent);

  return (
    <>
      <SimpleFormField
        value={context.store.question}
        class={classNames(styles.flexFull, styles.formField)}
        withEndButtonIcon
        withMinHeight
        onClick={createFormFieldClickHandler(questionInput)}
      >
        <SimpleFormField.InputStub>
          {questionInput.input}
        </SimpleFormField.InputStub>
        <SimpleFormField.Label maxLength={maxQuestionLength()}>
          <I18nTsx key='AskAQuestion' />
        </SimpleFormField.Label>

        <SimpleFormField.SideContent withFixedIcon first last>
          <EmojiDropdownButton class={interactableClass} inputField={questionInput} />
        </SimpleFormField.SideContent>
      </SimpleFormField>

      <Space amount='1rem' class={styles.flexFull} />

      <SimpleFormField
        value={context.store.description}
        class={classNames(styles.flexFull, styles.formField)}
        withEndButtonIcon
        withMinHeight
        isMarkupTooltipHost
        onClick={createFormFieldClickHandler(descriptionInput)}
      >
        <SimpleFormField.InputStub>
          {descriptionInput.input}
        </SimpleFormField.InputStub>
        <SimpleFormField.Label><I18nTsx key='DescriptionOptionalPlaceholder' /></SimpleFormField.Label>
        <SimpleFormField.SideContent withFixedIcon first last>
          <EmojiDropdownButton class={interactableClass} inputField={descriptionInput} />
        </SimpleFormField.SideContent>
        <Show when={supportsMedia('photo') || supportsMedia('video')}>
          <SimpleFormField.WithAutoLengthCounter
            maxLength={maxDescriptionLength()}
            first={!context.store.descriptionAttachment}
            last
            withFixedIcon
          >
            <MediaAttachment
              btnClass={interactableClass}
              supportedMediaTypes={[
                ...(supportsMedia('photo') ? ['photo'] as const : []),
                ...(supportsMedia('video') ? ['video'] as const : []),
                ...(supportsMedia('gif') ? ['gif'] as const : []) // GIF is additional to photo
              ]}
              imgClass={styles.mediaAttachmentImage}
              attachedMedia={context.store.descriptionAttachment}
              onAttach={(value) => {
                context.setStore('descriptionAttachment', value);
              }}
            />
          </SimpleFormField.WithAutoLengthCounter>
        </Show>
      </SimpleFormField>
    </>
  );
};

const BodyContent = () => {
  const [scrollable, setScrollable] = createSignal<HTMLElement>();

  return (
    <Scrollable ref={setScrollable}>
      <Space amount='1rem' />

      <div class={styles.sectionWrapper}>
        <SimpleFormField.Section>
          <QuestionAndDescription />
        </SimpleFormField.Section>
      </div>

      <Space amount='1rem' />

      <div class={styles.sectionWrapper}>
        <SimpleFormField.Section>
          <div class={styles.sectionTitle}>
            <I18nTsx key='PollOptions' />
          </div>

          <Space amount='0.5rem' />

          <PollOptionsSectionContent scrollable={scrollable()} />
        </SimpleFormField.Section>
      </div>

      <Space amount='1rem' />

      <div class={styles.sectionWrapper}>
        <SimpleFormField.Section>
          <div class={styles.sectionTitle}>
            <I18nTsx key='Settings' />
          </div>

          <Space amount='0.5rem' />

          <PollSettingsSectionContent />
        </SimpleFormField.Section>
      </div>

      <Space amount='1.5rem' />
    </Scrollable>
  );
};

export function openCreatePollPopup(props: CreatePollPopupProps, HotReloadGuard: typeof SolidJSHotReloadGuardProvider) {
  createPopup(() => <HotReloadGuard><CreatePollPopup {...props} /></HotReloadGuard>);
}
