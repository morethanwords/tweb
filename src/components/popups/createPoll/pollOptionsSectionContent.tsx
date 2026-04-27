import Button from '@components/buttonTsx';
import {IconTsx} from '@components/iconTsx';
import InputField from '@components/inputField';
import SimpleFormField from '@components/simpleFormField';
import Space from '@components/space';
import {createSortableList} from '@helpers/solid/createSortableList';
import {I18nTsx} from '@helpers/solid/i18n';
import classNames from '@helpers/string/classNames';
import {createMemo, createSignal, For, JSX, Ref} from 'solid-js';
import {EmojiDropdownButton} from './emojiDropdownButton';
import {MediaAttachment} from './mediaAttachment';
import styles from './styles.module.scss';


export const PollOptionsSectionContent = (props: {
  scrollable: HTMLElement
}) => {
  let idSeed = 0;
  const [items, setItems] = createSignal([...Array(5).fill('').map(() => ({id: idSeed++}))]);
  const itemsLength = createMemo(() => items().length);

  const sortable = createSortableList({
    container: () => props.scrollable,
    items,
    getId: item => item.id,
    onReorder: setItems
  });

  return (
    <>
      <For each={items()}>
        {(item, index) => (
          <>
            <PollOptionField
              ref={sortable.itemRef(item.id)}
              value={item.id.toString()}
              onPointerDown={sortable.handleProps(item.id).onPointerDown}
              style={sortable.itemStyle(item.id)}
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
    </>
  );
};


const PollOptionField = (props: {
  ref?: Ref<HTMLDivElement>;
  value?: string;
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

  props.value && inputField.setValueSilently(props.value);
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
      solidBackground
      style={props.style}
    >
      <SimpleFormField.SideContent
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
      <MediaAttachment />
    </SimpleFormField>
  );
};
