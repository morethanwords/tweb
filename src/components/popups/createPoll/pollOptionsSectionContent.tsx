import Button from '@components/buttonTsx';
import {IconTsx} from '@components/iconTsx';
import InputField from '@components/inputField';
import {HeightTransition} from '@components/sidebarRight/tabs/adminRecentActions/heightTransition';
import SimpleFormField from '@components/simpleFormField';
import Space from '@components/space';
import {StaticCheckbox} from '@components/staticCheckbox';
import StaticRadio from '@components/staticRadio';
import blurActiveElement from '@helpers/dom/blurActiveElement';
import focusInput from '@helpers/dom/focusInput';
import getRichValueWithCaret from '@helpers/dom/getRichValueWithCaret';
import {createSortableList} from '@helpers/solid/createSortableList';
import {I18nTsx} from '@helpers/solid/i18n';
import classNames from '@helpers/string/classNames';
import {batch, children, createMemo, createSignal, For, JSX, mapArray, onMount, Ref, Show} from 'solid-js';
import {Transition} from 'solid-transition-group';
import {EmojiButtonWithOpacity as EmojiDropdownButton} from './emojiButtonWithOpacity';
import {useCreatePollLimits} from './hooks';
import {MediaAttachment} from './mediaAttachment';
import {AttachedMedia, StorePollOption, useCreatePollContext} from './storeContext';
import styles from './styles.module.scss';


type Item = {
  id: number;
  option: StorePollOption;
  inputField?: InputField;
};

export const PollOptionsSectionContent = (props: {
  scrollable: HTMLElement
}) => {
  const {maxOptions} = useCreatePollLimits();

  let idSeed = 0;

  const [canAnimate, setCanAnimate] = createSignal(false);

  const context = useCreatePollContext();

  const rawMappedItems = mapArray(() => context.store.pollOptions, (option): Item => ({
    id: idSeed++,
    option
  }));

  const items = createMemo(rawMappedItems);

  const optionsLeft = createMemo(() => Math.max(0, maxOptions() - items().length));

  const sortable = createSortableList({
    container: () => props.scrollable,
    items,
    getId: item => item.id,
    onReorder: (newItems) => {
      context.setStore('pollOptions', newItems.map(item => item.option));
    }
  });

  onMount(() => {
    setCanAnimate(true);
  });

  const onAdd = () => {
    if(optionsLeft() === 0) return;
    blurActiveElement();
    context.setStore('pollOptions', context.store.pollOptions.length, {
      text: '',
      entities: []
    });
  };

  return (
    <>
      <For each={items()}>
        {(item, index) => (
          <PollOptionFullField
            item={item}
            index={index()}
            sortable={sortable}
            canAnimate={canAnimate()}
            inputFieldRef={(inputField) => {
              item.inputField = inputField;
            }}
            onChange={(option) => {
              context.setStore('pollOptions', index(), option);
            }}
            onEnter={() => {
              for(const item of items().slice(index() + 1)) {
                if(!item.inputField?.value) {
                  focusInput(item.inputField?.input);
                  return;
                }
              }
              if(item.inputField?.value) onAdd();
            }}
            onEmptyBackspace={() => {
              if(items().length === 1) return;

              context.setStore('pollOptions', prev => prev.filter((_, i) => i !== index()));
              focusInput(items()[Math.max(0, index() - 1)]?.inputField?.input);
            }}
          />
        )}
      </For>

      <Space amount='0.5rem' />

      <HeightTransition>
        <Show when={optionsLeft() > 0}>
          <div style={{overflow: 'hidden'}}>
            <div class={styles.caption}>
              <I18nTsx key='NewPoll.OptionsLeft' args={optionsLeft().toString()} />
            </div>
            <Button class={styles.addOptionButton} primary onClick={onAdd}>
              <IconTsx class={styles.addOptionButtonIcon} icon='plus' />
              <I18nTsx key='NewPoll.OptionsAddOption' />
            </Button>
          </div>
        </Show>
      </HeightTransition>
    </>
  );
};

const PollOptionFullField = (props: {
  item: Item;
  index: number;
  sortable: ReturnType<typeof createSortableList>;
  onChange: (option: Partial<StorePollOption>) => void;
  canAnimate?: boolean;
  inputFieldRef?: (value: InputField) => void;
  onEnter?: () => void;
  onEmptyBackspace?: () => void;
}) => {
  const context = useCreatePollContext();

  // Detach reactivity
  const canAnimate = props.canAnimate;
  const [done, setDone] = createSignal(!canAnimate);

  const onSortablePointerDown = props.sortable.dragHandleProps(props.item.id).onPointerDown;

  const onRadioClick = () => {
    batch(() => {
      context.setStore('pollOptions', (option) => option.checked, 'checked', false);
      context.setStore('pollOptions', props.index, 'checked', true);
    });
  };

  return (
    <EnterAnimationWrapper canAnimate={canAnimate} onDone={() => {
      setDone(true);
      focusInput(props.item.inputField?.input);
    }}>
      {props.index > 0 && <Space amount='0.75rem' />}
      <div
        ref={props.sortable.itemRef(props.item.id)}
        class={styles.pollOptionRow}
        style={props.sortable.itemStyle(props.item.id)}
      >
        <Show when={context.store.hasCorrectAnswer}>
          <div class={styles.pollOptionCheckWrapper}>
            <Transition name='fade-2' duration={200} mode='outin'>
              <Show when={!context.store.allowMultipleAnswers}>
                <div class={styles.checkButtonWrapper} onClick={onRadioClick}>
                  <StaticRadio checked={props.item.option.checked} />
                </div>
              </Show>
              <Show when={context.store.allowMultipleAnswers}>
                <div class={styles.checkButtonWrapper} onClick={() => props.onChange({checked: !props.item.option.checked})}>
                  <StaticCheckbox checked={props.item.option.checked} />
                </div>
              </Show>
            </Transition>
          </div>
        </Show>
        <PollOptionInputField
          value={props.item.option.text}
          attachment={props.item.option.attachment}
          onChange={props.onChange}
          onPointerDown={(e) => {
            blurActiveElement();
            onSortablePointerDown(e);
          }}
          hoverDisabled={!done() || props.sortable.draggingId() !== null}
          inputFieldRef={props.inputFieldRef}
          onEnter={props.onEnter}
          onEmptyBackspace={props.onEmptyBackspace}
        />
      </div>
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
    <Show when={!done()} fallback={resolvedChildren()}>
      <HeightTransition
        onAfterEnter={() => {
          setDone(true)
          props.onDone();
        }}
      >
        <Show when={visible()}>
          <div style={{overflow: 'hidden'}}>
            {resolvedChildren()}
          </div>
        </Show>
      </HeightTransition>
    </Show>
  );
};


const PollOptionInputField = (props: {
  ref?: Ref<HTMLDivElement>;
  inputFieldRef?: (value: InputField) => void;
  value?: string;
  style?: JSX.CSSProperties;
  onPointerDown?: JSX.HTMLAttributes<HTMLElement>['onPointerDown'];
  hoverDisabled?: boolean;
  onChange: (option: Partial<StorePollOption>) => void;
  attachment?: AttachedMedia;

  onEnter?: () => void;
  onEmptyBackspace?: () => void;
}) => {
  const {maxOptionLength} = useCreatePollLimits();

  const inputField = new InputField({
    placeholder: 'NewPoll.Option',
    canWrapCustomEmojis: true,
    onRawInput: () => {
      const {value, entities} = getRichValueWithCaret(inputField.input);
      props.onChange({text: value, entities});
    }
  });

  props.inputFieldRef?.(inputField);

  // inputField.setValueSilently(value());
  inputField.input.classList.replace('input-field-input', styles.inputField);
  inputField.placeholder.classList.add(styles.inputFieldPlaceholder);

  inputField.input.addEventListener('keydown', (e) => {
    if(e.key === 'Enter') {
      props.onEnter?.();
    }

    if(e.key === 'Backspace' && props.value === '') {
      e.preventDefault();
      props.onEmptyBackspace?.();
    }
  });

  return (
    <SimpleFormField
      ref={props.ref}
      value={props.value}
      class={classNames(styles.flexFull, styles.formField, styles.pollOptionInputField)}
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
      <SimpleFormField.SideContent withFixedIcon first last>
        <EmojiDropdownButton inputField={inputField} />
      </SimpleFormField.SideContent>
      <SimpleFormField.WithAutoLengthCounter
        maxLength={maxOptionLength()}
        first={!props.attachment}
        last
        withFixedIcon
      >
        <MediaAttachment
          imgClass={styles.mediaAttachmentImage}
          objectUrl={props.attachment?.objectUrl}
          onAttach={(value) => {
            props.onChange?.({attachment: value});
          }}
        />
      </SimpleFormField.WithAutoLengthCounter>
    </SimpleFormField>
  );
};
