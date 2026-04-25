import {ButtonIconTsx} from '@components/buttonIconTsx';
import Button from '@components/buttonTsx';
import {MarkupTooltipTypes} from '@components/chat/markupTooltip';
import {EmoticonsDropdown} from '@components/emoticonsDropdown';
import InputField from '@components/inputField';
import Scrollable from '@components/scrollable2';
import SimpleFormField, {useSimpleFormFieldContext} from '@components/simpleFormField';
import Space from '@components/space';
import {I18nTsx} from '@helpers/solid/i18n';
import classNames from '@helpers/string/classNames';
import {useHotReloadGuard} from '@lib/solidjs/hotReloadGuard';
import type SolidJSHotReloadGuardProvider from '@lib/solidjs/hotReloadGuardProvider';
import {createMemo, createSignal, For, onCleanup} from 'solid-js';
import styles from './createPoll.module.scss';
import PopupElement, {createPopup} from './indexTsx';

const supportedDescriptionFormattingTypes: MarkupTooltipTypes[] = ['bold', 'italic', 'link', 'underline', 'monospace', 'spoiler', 'strikethrough'];

export const CreatePollPopup = () => {
  return (
    <PopupElement
      show
      class={styles.popup}
      containerClass={styles.container}
    >
      <Header />
      <hr class={styles.hr} />
      <PopupElement.Body>
        <Scrollable>
          <For each={new Array(100).fill(0)}>
            {() => (
              <div class={styles.caption}>
                <I18nTsx key='PollOptions' />
              </div>
            )}
          </For>
        </Scrollable>
      </PopupElement.Body>
      <PopupElement.Footer>
        ssomething
      </PopupElement.Footer>
    </PopupElement>
  );
};

const Header = () => {
  const [question, setQuestion] = createSignal('');
  const [description, setDescription] = createSignal('');

  const questionInput = new InputField({
    canWrapCustomEmojis: true,
    onRawInput: (value) => {
      setQuestion(value);
    }
  });

  questionInput.input.classList.replace('input-field-input', styles.inputField);

  const descriptionInput = new InputField({
    canHaveFormatting: supportedDescriptionFormattingTypes,
    canWrapCustomEmojis: true,
    withLinebreaks: true,
    onRawInput: (value) => {
      setDescription(value);
    }
  });

  descriptionInput.input.classList.replace('input-field-input', styles.inputField);

  return (
    <PopupElement.Header class={styles.header}>
      <PopupElement.CloseButton class={styles.closeButton} />

      <PopupElement.Title>
        <I18nTsx key='NewPoll' />
      </PopupElement.Title>

      <Button class={styles.confirmButton} primaryFilled>
        <I18nTsx key='Create' />
      </Button>

      <Space amount='1rem' class={styles.flexFull} />

      <SimpleFormField
        value={question()}
        onChange={setQuestion}
        class={classNames(styles.flexFull, styles.formField)}
        withEndButtonIcon
        withMinHeight
      >
        <SimpleFormField.InputStub>
          {questionInput.input}
        </SimpleFormField.InputStub>
        <SimpleFormField.Label><I18nTsx key='AskAQuestion' /></SimpleFormField.Label>

        <SimpleFormField.SideContent class={styles.sideContentWithFixedIcon} first last>
          <EmojiDropdownButton inputField={/* @once */ questionInput} />
        </SimpleFormField.SideContent>
      </SimpleFormField>

      <Space amount='1rem' class={styles.flexFull} />

      <SimpleFormField
        value={description()}
        onChange={setDescription}
        class={classNames(styles.flexFull, styles.formField)}
        withEndButtonIcon
        withMinHeight
      >
        <SimpleFormField.InputStub>
          {descriptionInput.input}
        </SimpleFormField.InputStub>
        <SimpleFormField.Label><I18nTsx key='DescriptionOptionalPlaceholder' /></SimpleFormField.Label>
        <SimpleFormField.SideContent class={styles.sideContentWithFixedIcon} first last>
          <EmojiDropdownButton inputField={/* @once */ descriptionInput} />
        </SimpleFormField.SideContent>
        <SimpleFormField.SideContent class={styles.sideContentWithFixedIcon} first last>
          <ButtonIconTsx icon='attach' />
        </SimpleFormField.SideContent>
      </SimpleFormField>

    </PopupElement.Header>
  );
};

const EmojiDropdownButton = (props: { inputField: InputField }) => {
  const {createEmojiDropdownButton} = useHotReloadGuard();
  const {useSetForceFocused} = useSimpleFormFieldContext();

  const button = createMemo(() => {
    const setForceFocused = useSetForceFocused();

    let emoticonsDropdown: EmoticonsDropdown;

    const {button} = createEmojiDropdownButton({
      inputField: props.inputField,
      onEmoticonsDropdown: (value) => {
        emoticonsDropdown = value;

        setForceFocused(!!emoticonsDropdown);
        button.classList.toggle(styles.forceFocused, !!emoticonsDropdown);
      },
      fromInputCenter: true
    });

    onCleanup(() => {
      emoticonsDropdown?.hideAndDestroy();
    });

    button.classList.add(styles.emojiDropdownButton);
    button.tabIndex = -1;

    return button;
  });

  return (
    <>{button()}</>
  );
};

export function openCreatePollPopup(HotReloadGuard: typeof SolidJSHotReloadGuardProvider) {
  createPopup(() => <HotReloadGuard><CreatePollPopup /></HotReloadGuard>);
}
