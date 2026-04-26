import {ButtonIconTsx} from '@components/buttonIconTsx';
import Button from '@components/buttonTsx';
import {MarkupTooltipTypes} from '@components/chat/markupTooltip';
import {EmoticonsDropdown} from '@components/emoticonsDropdown';
import {IconTsx} from '@components/iconTsx';
import InputField from '@components/inputField';
import Scrollable from '@components/scrollable2';
import SimpleFormField, {useSimpleFormFieldContext} from '@components/simpleFormField';
import Space from '@components/space';
import {createSortableList} from '@helpers/solid/createSortableList';
import {I18nTsx} from '@helpers/solid/i18n';
import classNames from '@helpers/string/classNames';
import {useHotReloadGuard} from '@lib/solidjs/hotReloadGuard';
import type SolidJSHotReloadGuardProvider from '@lib/solidjs/hotReloadGuardProvider';
import {createMemo, createSignal, For, JSX, onCleanup, Ref} from 'solid-js';
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
        <BodyContent />
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
          <EmojiDropdownButton inputField={questionInput} />
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
          <EmojiDropdownButton inputField={descriptionInput} />
        </SimpleFormField.SideContent>
        <SimpleFormField.SideContent class={styles.sideContentWithFixedIcon} first last>
          <ButtonIconTsx icon='attach' />
        </SimpleFormField.SideContent>
      </SimpleFormField>

    </PopupElement.Header>
  );
};


const BodyContent = () => {
  let idSeed = 0;
  const [items, setItems] = createSignal([...Array(14).fill('').map(() => ({id: idSeed++}))]);
  const itemsLength = createMemo(() => items().length);

  const [scrollable, setScrollable] = createSignal<HTMLElement>();

  const sortable = createSortableList({
    container: scrollable,
    items,
    getId: item => item.id,
    onReorder: setItems
  });


  return (
    <Scrollable ref={setScrollable}>
      <div class={styles.caption}>
        <I18nTsx key='PollOptions' />

        <Space amount='0.5rem' />

        <For each={items()}>
          {(item, index) => (
            <>
              <PollOptionField
                ref={sortable.registerItem(item.id)}
                dragByRef={sortable.registerHandle(item.id)}
                onPointerDown={sortable.getProps(item.id).onPointerDown}
                style={sortable.getStyle(item.id)}
              />
              {index() < itemsLength() - 1 && <Space amount='0.75rem' />}
            </>
          )}
        </For>

        <Space amount='0.5rem' />

        <Button class={styles.addOptionButton} primary>
          <IconTsx class={styles.addOptionButtonIcon} icon='plus' />
          <I18nTsx key='NewPoll.OptionsAddOption' />
        </Button>
      </div>
    </Scrollable>
  );
};

const PollOptionField = (props: {
  ref?: Ref<HTMLDivElement>;
  dragByRef?: Ref<HTMLDivElement>;
  style?: JSX.CSSProperties;
  onPointerDown?: JSX.HTMLAttributes<HTMLElement>['onPointerDown'];
}) => {
  const [value, setValue] = createSignal('');

  const inputField = new InputField({
    placeholder: 'NewPoll.Option',
    canWrapCustomEmojis: true,
    onRawInput: (value) => {
      setValue(value);
    }
  });

  inputField.input.classList.replace('input-field-input', styles.inputField);
  inputField.placeholder.classList.add(styles.inputFieldPlaceholder);

  return (
    <SimpleFormField
      ref={props.ref}
      value={value()}
      onChange={setValue}
      class={classNames(styles.flexFull, styles.formField)}
      withEndButtonIcon
      withStartButtonIcon
      withMinHeight
      style={props.style}
    >
      <SimpleFormField.SideContent
        ref={props.dragByRef}
        class={styles.draggableSideContent}
        first
        last
        onPointerDown={props.onPointerDown}
      >
        <IconTsx icon='menu' />
      </SimpleFormField.SideContent>
      <SimpleFormField.InputStub>
        {inputField.input}
        {inputField.placeholder}
      </SimpleFormField.InputStub>
      <SimpleFormField.SideContent class={styles.sideContentWithFixedIcon} first last>
        <EmojiDropdownButton inputField={inputField} />
      </SimpleFormField.SideContent>
      <SimpleFormField.SideContent class={styles.sideContentWithFixedIcon} first last>
        <ButtonIconTsx icon='attach' />
      </SimpleFormField.SideContent>
    </SimpleFormField>
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
      }
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
