import Button from '@components/buttonTsx';
import {IconTsx} from '@components/iconTsx';
import InputField from '@components/inputField';
import {HeightTransition} from '@components/sidebarRight/tabs/adminRecentActions/heightTransition';
import SimpleFormField from '@components/simpleFormField';
import Space from '@components/space';
import blurActiveElement from '@helpers/dom/blurActiveElement';
import focusInput from '@helpers/dom/focusInput';
import {createSortableList} from '@helpers/solid/createSortableList';
import {I18nTsx} from '@helpers/solid/i18n';
import classNames from '@helpers/string/classNames';
import {children, createSignal, For, JSX, onMount, Ref, Show} from 'solid-js';
import {createStore} from 'solid-js/store';
import {EmojiDropdownButton} from './emojiDropdownButton';
import {MediaAttachment} from './mediaAttachment';
import styles from './styles.module.scss';


type Item = {
  id: number;
  canBeAnimated: boolean;
  inputField?: InputField;
};

export const PollOptionsSectionContent = (props: {
  scrollable: HTMLElement
}) => {
  let idSeed = 0;

  const createItem = (canBeAnimated = false): Item => ({id: idSeed++, canBeAnimated});

  const [items, setItems] = createStore([createItem()]);

  const sortable = createSortableList({
    container: () => props.scrollable,
    items: () => items,
    getId: item => item.id,
    onReorder: (newItems) => setItems(newItems)
  });

  const onAdd = () => {
    blurActiveElement();
    setItems(prev => [...prev, createItem(true)]);
  };

  return (
    <>
      <For each={items}>
        {(item, index) => (
          <PollOptionFieldWithAnimation
            item={item}
            index={index()}
            sortable={sortable}
            inputFieldRef={(inputField) => {
              setItems(index(), 'inputField', inputField);
            }}
            onEnter={() => {
              for(const item of items.slice(index() + 1)) {
                if(!item.inputField?.value) {
                  focusInput(item.inputField?.input);
                  return;
                }
              }
              if(item.inputField?.value) onAdd();
            }}
            onEmptyBackspace={() => {
              if(items.length === 1) return;

              setItems(prev => prev.filter((_, i) => i !== index()));

              if(items.length) {
                focusInput(items[Math.max(0, index() - 1)]?.inputField?.input);
              } else {
                setItems([createItem()]);
                focusInput(items[0]?.inputField?.input);
              }
            }}
          />
        )}
      </For>

      <Space amount='0.5rem' />

      <Button class={styles.addOptionButton} primary onClick={onAdd}>
        <IconTsx class={styles.addOptionButtonIcon} icon='plus' />
        <I18nTsx key='NewPoll.OptionsAddOption' />
      </Button>
    </>
  );
};

const PollOptionFieldWithAnimation = (props: {
  item: Item;
  index: number;
  sortable: ReturnType<typeof createSortableList>;
  inputFieldRef?: (value: InputField) => void;
  onEnter?: () => void;
  onEmptyBackspace?: () => void;
}) => {
  const willAnimate = props.item.canBeAnimated;
  const [done, setDone] = createSignal(!willAnimate);

  return (
    <EnterAnimationWrapper canAnimate={willAnimate} onDone={() => {
      setDone(true);
      focusInput(props.item.inputField?.input);
    }}>
      {props.index > 0 && <Space amount='0.75rem' />}
      <PollOptionField
        ref={props.sortable.itemRef(props.item.id)}
        onPointerDown={props.sortable.handleProps(props.item.id).onPointerDown}
        style={props.sortable.itemStyle(props.item.id)}
        hoverDisabled={!done() || props.sortable.draggingId() !== null}
        inputFieldRef={props.inputFieldRef}
        onEnter={props.onEnter}
        onEmptyBackspace={props.onEmptyBackspace}
      />
    </EnterAnimationWrapper>
  );
};

const EnterAnimationWrapper = (props: {
  canAnimate?: boolean;
  onDone: () => void;
  children: JSX.Element;
}) => {
  const [visible, setVisible] = createSignal(!props.canAnimate);
  const [done, setDone] = createSignal(!props.canAnimate);

  onMount(() => {
    setVisible(true);
  });

  const resolvedChildren = children(() => props.children);

  return (
    <>
      <Show when={!done()}>
        <HeightTransition
          onAfterEnter={() => {
            setDone(true)
            props.onDone();
          }}
        >
          <Show when={visible()}>
            <div style={{overflow: !done() ? 'hidden' : 'visible'}}>
              {resolvedChildren()}
            </div>
          </Show>
        </HeightTransition>
      </Show>
      <Show when={done()}>
        {resolvedChildren()}
      </Show>
    </>
  );
};


const PollOptionField = (props: {
  ref?: Ref<HTMLDivElement>;
  inputFieldRef?: (value: InputField) => void;
  value?: string;
  style?: JSX.CSSProperties;
  onPointerDown?: JSX.HTMLAttributes<HTMLElement>['onPointerDown'];
  hoverDisabled?: boolean;

  onEnter?: () => void;
  onEmptyBackspace?: () => void;
}) => {
  const [value, setValue] = createSignal(props.value ?? '');

  const inputField = new InputField({
    placeholder: 'NewPoll.Option',
    canWrapCustomEmojis: true,
    onRawInput: (value) => {
      setValue(value);
    }
  });

  props.inputFieldRef?.(inputField);

  inputField.setValueSilently(value());
  inputField.input.classList.replace('input-field-input', styles.inputField);
  inputField.placeholder.classList.add(styles.inputFieldPlaceholder);

  inputField.input.addEventListener('keydown', (e) => {
    if(e.key === 'Enter') {
      props.onEnter?.();
    }

    if(e.key === 'Backspace' && value() === '') {
      e.preventDefault();
      props.onEmptyBackspace?.();
    }
  });

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
      hoverDisabled={props.hoverDisabled}
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
