import Button from '@components/buttonTsx';
import InputField from '@components/inputField';
import Scrollable from '@components/scrollable2';
import SimpleFormField from '@components/simpleFormField';
import Space from '@components/space';
import getRichValueWithCaret from '@helpers/dom/getRichValueWithCaret';
import {I18nTsx} from '@helpers/solid/i18n';
import classNames from '@helpers/string/classNames';
import type SolidJSHotReloadGuardProvider from '@lib/solidjs/hotReloadGuardProvider';
import {createSignal} from 'solid-js';
import {unwrap} from 'solid-js/store';
import PopupElement, {createPopup} from '../indexTsx';
import {supportedDescriptionFormattingTypes} from './config';
import {EmojiButtonWithOpacity as EmojiDropdownButton} from './emojiButtonWithOpacity';
import {MediaAttachment} from './mediaAttachment';
import {PollOptionsSectionContent} from './pollOptionsSectionContent';
import {PollSettingsSectionContent} from './pollSettingsSectionContent';
import {CreatePollContext, CreatePollPayload, createPollStoreContextValue, useCreatePollContext} from './storeContext';
import styles from './styles.module.scss';


type CreatePollPopupProps = {
  onSubmit: (payload: CreatePollPayload) => void;
};

export const CreatePollPopup = (props: CreatePollPopupProps) => {
  const context = createPollStoreContextValue();

  return (
    <PopupElement
      show
      class={styles.popup}
      containerClass={styles.container}
    >
      <CreatePollContext.Provider value={context}>
        <Header onSubmit={() => {
          props.onSubmit(structuredClone(unwrap(context.store)));
        }} />
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
  const context = useCreatePollContext();

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

  questionInput.input.classList.replace('input-field-input', styles.inputField);

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

  descriptionInput.input.classList.replace('input-field-input', styles.inputField);

  return (
    <PopupElement.Header class={styles.header}>
      <PopupElement.CloseButton class={styles.closeButton} />

      <PopupElement.Title>
        <I18nTsx key='NewPoll' />
      </PopupElement.Title>

      <Button class={styles.confirmButton} primaryFilled onClick={props.onSubmit}>
        <I18nTsx key='Create' />
      </Button>

      <Space amount='1rem' class={styles.flexFull} />

      <SimpleFormField
        value={context.store.question}
        class={classNames(styles.flexFull, styles.formField)}
        withEndButtonIcon
        withMinHeight
      >
        <SimpleFormField.InputStub>
          {questionInput.input}
        </SimpleFormField.InputStub>
        <SimpleFormField.Label><I18nTsx key='AskAQuestion' /></SimpleFormField.Label>

        <SimpleFormField.SideContent class={styles.sideContentWithFixedIcon} first last>
          <EmojiDropdownButton inputField={questionInput} />
        </SimpleFormField.SideContent>
      </SimpleFormField>

      <Space amount='1rem' class={styles.flexFull} />

      <SimpleFormField
        value={context.store.description}
        class={classNames(styles.flexFull, styles.formField)}
        withEndButtonIcon
        withMinHeight
      >
        <SimpleFormField.InputStub>
          {descriptionInput.input}
        </SimpleFormField.InputStub>
        <SimpleFormField.Label><I18nTsx key='DescriptionOptionalPlaceholder' /></SimpleFormField.Label>
        <SimpleFormField.SideContent class={styles.sideContentWithFixedIcon} first last>
          <EmojiDropdownButton inputField={descriptionInput} />
        </SimpleFormField.SideContent>
        <SimpleFormField.SideContent class={styles.sideContentWithFixedIcon} first={!context.store.descriptionAttachment} last>
          <MediaAttachment
            imgClass={styles.mediaAttachmentImage}
            objectUrl={context.store.descriptionAttachment?.objectUrl}
            onChange={(objectUrl) => {
              context.setStore('descriptionAttachment', {objectUrl});
            }}
          />
        </SimpleFormField.SideContent>
      </SimpleFormField>

    </PopupElement.Header>
  );
};

const BodyContent = () => {
  const [scrollable, setScrollable] = createSignal<HTMLElement>();

  return (
    <Scrollable ref={setScrollable}>
      <div class={styles.sectionTitle}>
        <I18nTsx key='PollOptions' />
      </div>

      <Space amount='0.5rem' />

      <div class={styles.section}>
        <PollOptionsSectionContent scrollable={scrollable()} />
      </div>

      <div class={styles.sectionTitle}>
        <I18nTsx key='Settings' />
      </div>

      <Space amount='0.5rem' />

      <div class={styles.section}>
        <PollSettingsSectionContent />
      </div>

      <Space amount='1.5rem' />
    </Scrollable>
  );
};

export function openCreatePollPopup(props: CreatePollPopupProps, HotReloadGuard: typeof SolidJSHotReloadGuardProvider) {
  createPopup(() => <HotReloadGuard><CreatePollPopup {...props} /></HotReloadGuard>);
}
