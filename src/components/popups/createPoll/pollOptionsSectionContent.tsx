import {AutoHeight} from '@components/autoHeight';
import Button from '@components/buttonTsx';
import {IconTsx} from '@components/iconTsx';
import InputField from '@components/inputField';
import SimpleFormField from '@components/simpleFormField';
import Space from '@components/space';
import {StaticCheckbox} from '@components/staticCheckbox';
import StaticRadio from '@components/staticRadio';
import blurActiveElement from '@helpers/dom/blurActiveElement';
import focusInput from '@helpers/dom/focusInput';
import getRichValueWithCaret from '@helpers/dom/getRichValueWithCaret';
import {createDelayed} from '@helpers/solid/createDelayed';
import {createSortableList} from '@helpers/solid/createSortableList';
import {HeightTransition} from '@helpers/solid/heightTransition';
import {I18nTsx} from '@helpers/solid/i18n';
import classNames from '@helpers/string/classNames';
import {batch, children, createEffect, createMemo, createSignal, For, JSX, mapArray, onMount, Ref, Show} from 'solid-js';
import {Transition, TransitionGroup} from 'solid-transition-group';
import {EmojiButtonWithOpacity as EmojiDropdownButton} from './emojiButtonWithOpacity';
import {useSupportsMedia} from './utils';
import {MediaAttachment} from './mediaAttachment';
import {AttachedMedia, StorePollOption, useCreatePollContext} from './storeContext';
import styles from './styles.module.scss';
import {useCreatePollLimits} from './useCreatePollLimits';


type MappedItem = {
  type: 'mappedItem',
  id: number;
  option: StorePollOption;
  inputField?: InputField;
};

export const PollOptionsSectionContent = (props: {
  scrollable: HTMLElement
}) => {
  const {maxOptions} = useCreatePollLimits();

  let idSeed = 0;

  const context = useCreatePollContext();

  const rawMappedItems = mapArray(() => context.store.pollOptions, (option): MappedItem => ({
    type: 'mappedItem',
    id: idSeed++,
    option
  }));

  const mappedItems = createMemo(rawMappedItems);

  const optionsLeft = createMemo(() => Math.max(0, maxOptions() - mappedItems().length));
  /* Prevent flickering to 1 when being removed and do not include the unfilled last option */
  const visibleOptionsLeft = createMemo(() => Math.max(2, optionsLeft() + 1));
  const canShowOptionLeft = createMemo(() => optionsLeft() > 0);

  const sortable = createSortableList({
    container: () => props.scrollable,
    items: mappedItems,
    getId: item => item.id,
    onReorder: (newItems) => {
      context.setStore('pollOptions', newItems.map(item => item.option));
    }
  });

  const isDragging = createDelayed(sortable.isDragging, false, (value) => value ? -1 : 100);

  const delayedCanShowOptionLeft = createDelayed(canShowOptionLeft, canShowOptionLeft(), value => value ? 200 : 0);

  const TransitionGroupWhenNotDragging = (props: { children: JSX.Element }) => {
    const resolved = children(() => props.children);
    return (
      <Show when={!isDragging()} fallback={resolved()}>
        <TransitionGroup name='fade-2' moveClass='t-move'>
          {resolved()}
        </TransitionGroup>
      </Show>
    );
  };

  type MappedItemOrOptionsLeft = MappedItem | {
    type: 'optionsLeft';
  };

  const optionsLeftItem: MappedItemOrOptionsLeft = {
    type: 'optionsLeft'
  };

  const items = createMemo(() => {
    const result: MappedItemOrOptionsLeft[] = [...mappedItems()];

    if(delayedCanShowOptionLeft()) {
      result.push(optionsLeftItem);
    }

    return result;
  });

  return (
    <AutoHeight>
      <TransitionGroupWhenNotDragging>
        <For each={items()}>
          {(item, index) => (
            <Show when={item.type === 'mappedItem' && item} keyed fallback={
              <div style={{height: !canShowOptionLeft() ? '0' : undefined}}>
                <Space amount='0.5rem' />
                <div class={styles.caption} style={{overflow: 'hidden'}}>
                  <I18nTsx key='NewPoll.OptionsLeft' args={visibleOptionsLeft().toString()} />
                </div>
              </div>
            }>
              {item => <>
                {index() > 0 && <Space amount='0.75rem' />}
                <PollOptionFullField
                  index={index()}
                  mappedItem={item}
                  mappedItems={mappedItems()}
                  sortable={sortable}
                  optionsLeft={optionsLeft()}
                />
              </>}
            </Show>
          )}
        </For>
      </TransitionGroupWhenNotDragging>
    </AutoHeight>
  );
};

const PollOptionFullField = (props: {
  index: number;
  mappedItem: MappedItem;
  mappedItems: MappedItem[];
  sortable: ReturnType<typeof createSortableList>;
  optionsLeft: number;
}) => {
  const {store, setStore} = useCreatePollContext();

  const [container, setContainer] = createSignal<HTMLElement>();
  const value = () => props.mappedItem.option.text;

  const isDuplicate = createMemo(() => {
    const text = value();
    if(!text) return false;
    return store.pollOptions.filter((option) => option.text === text).length > 1;
  });

  const canBeReordered = createMemo(() => props.index < store.pollOptions.length - 1 || !!props.mappedItem.option.text);

  createEffect(() => {
    if(!container() || !canBeReordered()) return;

    props.sortable.itemRef(props.mappedItem.id)(container());
  });

  const onRadioClick = () => {
    batch(() => {
      setStore('pollOptions', (option) => option.checked, 'checked', false);
      setStore('pollOptions', props.index, 'checked', true);
    });
  };

  return (
    <div
      ref={setContainer}
      class={styles.pollOptionRow}
      style={props.sortable.itemStyle(props.mappedItem.id)}
    >
      <Show when={store.hasCorrectAnswer}>
        <div class={styles.pollOptionCheckWrapper} classList={{[styles.disabled]: !canBeReordered()}}>
          <Transition name='fade-2' duration={200} mode='outin'>
            <Show when={!store.allowMultipleAnswers}>
              <div class={styles.checkButtonWrapper} onClick={onRadioClick}>
                <StaticRadio checked={props.mappedItem.option.checked} />
              </div>
            </Show>
            <Show when={store.allowMultipleAnswers}>
              <div class={styles.checkButtonWrapper} onClick={() => setStore('pollOptions', props.index, 'checked', (v) => !v)}>
                <StaticCheckbox checked={props.mappedItem.option.checked} />
              </div>
            </Show>
          </Transition>
        </div>
      </Show>
      <PollOptionInputField
        value={value()}
        attachment={props.mappedItem.option.attachment}
        isError={isDuplicate()}
        canBeReordered={canBeReordered()}
        onPointerDown={(e) => {
          if(!canBeReordered()) return;
          blurActiveElement();
          props.sortable.dragHandleProps(props.mappedItem.id).onPointerDown(e);
        }}
        hoverDisabled={props.sortable.draggingId() !== null}
        inputFieldRef={(inputField) => {
          props.mappedItem.inputField = inputField;
        }}
        onChange={(option) => {
          setStore('pollOptions', props.index, option);
        }}
        onEnter={() => {
          for(const item of props.mappedItems.slice(props.index + 1)) {
            if(!item.inputField?.value) {
              focusInput(item.inputField?.input);
              return;
            }
          }
        }}
        onEmptyBackspace={() => {
          if(props.mappedItems.length === 1) return;

          if(props.index < props.mappedItems.length - 1) {
            setStore('pollOptions', prev => prev.filter((_, i) => i !== props.index));
          }

          focusInput(props.mappedItems[Math.max(0, props.index - 1)]?.inputField?.input);
        }}
      />
    </div>
  );
};

const PollOptionInputField = (props: {
  ref?: Ref<HTMLDivElement>;
  inputFieldRef: (value: InputField) => void;

  value: string;
  hoverDisabled?: boolean;
  isError?: boolean;
  attachment?: AttachedMedia;
  style?: JSX.CSSProperties;
  canBeReordered?: boolean;

  onChange: (option: Partial<StorePollOption>) => void;
  onEnter?: () => void;
  onEmptyBackspace?: () => void;
  onPointerDown?: JSX.HTMLAttributes<HTMLElement>['onPointerDown'];
}) => {
  const {maxOptionLength} = useCreatePollLimits();
  const supportsMedia = useSupportsMedia();


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
      isError={props.isError}
      style={props.style}
    >
      <SimpleFormField.SideContent
        class={styles.draggableSideContent}
        classList={{
          [styles.disabled]: !props.canBeReordered
        }}
        first
        last
        onPointerDown={props.onPointerDown}
      >
        <IconTsx class={styles.draggableIconScaffold} icon='menu' />
        <Transition name='fade'>
          <Show when={props.canBeReordered} fallback={<IconTsx class={styles.draggableIconFloating} icon='plusround' />}>
            <IconTsx class={styles.draggableIconFloating} icon='menu' />
          </Show>
        </Transition>
      </SimpleFormField.SideContent>
      <SimpleFormField.InputStub>
        {inputField.input}
        {inputField.placeholder}
      </SimpleFormField.InputStub>
      <SimpleFormField.SideContent withFixedIcon first last>
        <EmojiDropdownButton inputField={inputField} />
      </SimpleFormField.SideContent>
      <Show when={supportsMedia('photo') || supportsMedia('sticker')}>
        <SimpleFormField.WithAutoLengthCounter
          maxLength={maxOptionLength()}
          first={!props.attachment}
          last
          withFixedIcon
        >
          <MediaAttachment
            supportedMediaTypes={[
              ...(supportsMedia('photo') ? ['photo'] as const : []),
              ...(supportsMedia('sticker') ? ['sticker'] as const : [])
            ]}
            imgClass={styles.mediaAttachmentImage}
            attachedMedia={props.attachment}
            onAttach={(value) => {
              props.onChange?.({attachment: value});
            }}
          />
        </SimpleFormField.WithAutoLengthCounter>
      </Show>
    </SimpleFormField>
  );
};
