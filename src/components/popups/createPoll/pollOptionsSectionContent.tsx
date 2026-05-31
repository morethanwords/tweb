import {AutoHeight} from '@components/autoHeight';
import Button from '@components/buttonTsx';
import {IconTsx} from '@components/iconTsx';
import InputField from '@components/inputField';
import SimpleFormField from '@components/simpleFormField';
import Space from '@components/space';
import {StaticCheckbox} from '@components/staticCheckbox';
import StaticRadio from '@components/staticRadio';
import lastItem from '@helpers/array/lastItem';
import blurActiveElement from '@helpers/dom/blurActiveElement';
import focusInput from '@helpers/dom/focusInput';
import getRichValueWithCaret from '@helpers/dom/getRichValueWithCaret';
import {createDelayed} from '@helpers/solid/createDelayed';
import createMiddleware from '@helpers/solid/createMiddleware';
import {createSortableList} from '@helpers/solid/createSortableList';
import {I18nTsx} from '@helpers/solid/i18n';
import {subscribeOn} from '@helpers/solid/subscribeOn';
import classNames from '@helpers/string/classNames';
import I18n from '@lib/langPack';
import wrapDraftText from '@lib/richTextProcessor/wrapDraftText';
import {batch, children, createEffect, createMemo, createSignal, For, JSX, mapArray, Match, on, Ref, Show, Switch} from 'solid-js';
import {Transition, TransitionGroup} from 'solid-transition-group';
import {EmojiButtonWithOpacity as EmojiDropdownButton} from './emojiButtonWithOpacity';
import {MediaAttachment} from './mediaAttachment';
import {AttachedMedia, StorePollOption, useCreatePollContext} from './storeContext';
import styles from './styles.module.scss';
import {useCreatePollLimits} from './useCreatePollLimits';
import {checkOptionHasValue, createFormFieldClickHandler, interactableClass, useSupportsMedia} from './utils';


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

  const visibleOptionsLeft = createMemo(() => {
    if(context.store.pollOptions.length === 2 && !checkOptionHasValue(context.store.pollOptions[0])) {
      return maxOptions();
    }

    return (
      optionsLeft() +
      (context.store.pollOptions.length && checkOptionHasValue(lastItem(context.store.pollOptions)) ? 0 : 1)
    );
  });

  const canShowAddOption = createMemo(() => optionsLeft() > 0);

  const sortable = createSortableList({
    container: () => props.scrollable,
    items: mappedItems,
    getId: item => item.id,
    onReorder: (newItems) => {
      context.setStore('pollOptions', newItems.map(item => item.option));
    }
  });

  const isDragging = createDelayed(sortable.isDragging, false, (value) => value ? -1 : 100);

  // const delayedCanShowAddOption = createDelayed(canShowAddOption, canShowAddOption(), value => value ? 200 : 0);

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
  } | {
    type: 'addOption'
  };

  const optionsLeftItem: MappedItemOrOptionsLeft = {
    type: 'optionsLeft'
  };

  // Discarded add button
  // const addOptionItem: MappedItemOrOptionsLeft = {
  //   type: 'addOption'
  // };

  const items = createMemo(() => {
    const result: MappedItemOrOptionsLeft[] = [...mappedItems(), optionsLeftItem];

    // if(delayedCanShowAddOption()) {
    //   result.push(addOptionItem);
    // }

    return result;
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
    <AutoHeight>
      <TransitionGroupWhenNotDragging>
        <For each={items()}>
          {(item, index) => (
            <Switch>
              <Match when={item.type === 'mappedItem' && item} keyed>
                {item => (
                  <>
                    {index() > 0 && <Space amount='0.75rem' />}
                    <PollOptionFullField
                      index={index()}
                      mappedItem={item}
                      mappedItems={mappedItems()}
                      sortable={sortable}
                      optionsLeft={optionsLeft()}
                    />
                  </>
                )}
              </Match>
              <Match when={item.type === 'optionsLeft'}>
                <div class={styles.caption}>
                  <Space amount='0.5rem' />
                  <Show when={visibleOptionsLeft() > 0} fallback={<I18nTsx key='NewPoll.MaxOptions' />}>
                    <I18nTsx key='NewPoll.OptionsLeft' args={visibleOptionsLeft().toString()} />
                  </Show>
                </div>
              </Match>
              <Match when={item.type === 'addOption'}>
                <div style={{height: !canShowAddOption() ? '0' : undefined}}>
                  <Button class={styles.addOptionButton} primary onClick={onAdd}>
                    <IconTsx class={styles.addOptionButtonIcon} icon='plus' />
                    <I18nTsx key='NewPoll.OptionsAddOption' />
                  </Button>
                </div>
              </Match>
            </Switch>
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
  const middleware = createMiddleware().get();

  const [container, setContainer] = createSignal<HTMLElement>();
  const value = () => props.mappedItem.option.text;

  const isDuplicate = createMemo(() => {
    const text = value();
    if(!text) return false;
    return store.pollOptions.filter((option) => option.text === text).length > 1;
  });

  const noIcon = createMemo(() => store.pollOptions.length === 2 && !props.mappedItem.option.text && props.index === 0);
  const isAdd = createMemo(() => props.index === store.pollOptions.length - 1 && !checkOptionHasValue(lastItem(store.pollOptions)));
  const canBeReordered = createMemo(() => !noIcon() && !isAdd());

  const noEmojiPicker = createMemo(() => isAdd() && !checkOptionHasValue(props.mappedItems[0].option));
  const noAttachment = createMemo(() => noEmojiPicker() || noIcon() || isAdd());

  const onPointerDown = createMemo(() => props.sortable.dragHandleProps(props.mappedItem.id).onPointerDown);

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


  const focusToEmptyInputCallback = createMemo(() => {
    if(!isAdd() || store.pollOptions.length !== 2 || checkOptionHasValue(store.pollOptions[0])) return;

    return () => {
      props.mappedItems[0]?.inputField?.input.focus();
    };
  });

  return (
    <div
      ref={setContainer}
      class={styles.pollOptionRow}
      style={props.sortable.itemStyle(props.mappedItem.id)}
    >
      <Show when={store.hasCorrectAnswer}>
        <div class={styles.pollOptionCheckWrapper} classList={{[styles.disabled]: !canBeReordered()}}>
          <Transition name='t-zoom' duration={200} mode='outin'>
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
        noIcon={noIcon()}
        isAdd={isAdd()}
        noEmojiPicker={noEmojiPicker()}
        noAttachment={noAttachment()}
        onPointerDown={(e) => {
          if(!canBeReordered()) return;
          blurActiveElement();
          onPointerDown()(e);
        }}
        hoverDisabled={props.sortable.draggingId() !== null}
        inputFieldRef={(inputField) => {
          props.mappedItem.inputField = inputField;
          if(import.meta.hot) {
            inputField.setValueSilently(wrapDraftText(value(), {entities: props.mappedItem.option.entities, middleware}));
          }
        }}
        onChange={(option) => {
          setStore('pollOptions', props.index, option);
        }}
        onEnter={() => {
          if(noIcon()) return;
          for(const item of props.mappedItems.slice(props.index + 1)) {
            if(!item.inputField?.value) {
              focusInput(item.inputField?.input);
              return;
            }
          }
        }}
        onEmptyBackspace={() => {
          if(store.pollOptions.length <= 1) return;

          if(store.pollOptions.length > 2 && props.index < store.pollOptions.length - 1) {
            setStore('pollOptions', prev => prev.filter((_, i) => i !== props.index));
          }

          focusInput(props.mappedItems[Math.max(0, props.index - 1)]?.inputField?.input);
        }}
        onClickOverride={focusToEmptyInputCallback()}
        onFocus={focusToEmptyInputCallback()}
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
  isAdd?: boolean;
  noIcon?: boolean;
  noEmojiPicker?: boolean;
  noAttachment?: boolean;

  onChange: (option: Partial<StorePollOption>) => void;
  onFocus?: () => void;
  onEnter?: () => void;
  onEmptyBackspace?: () => void;
  onClickOverride?: JSX.EventHandler<HTMLDivElement, MouseEvent>;
  onPointerDown?: JSX.HTMLAttributes<HTMLElement>['onPointerDown'];
}) => {
  const {maxOptionLength} = useCreatePollLimits();
  const supportsMedia = useSupportsMedia();

  const inputField = new InputField({
    placeholder: props.isAdd ? 'NewPoll.OptionsAddOption' : 'NewPoll.Option',
    canWrapCustomEmojis: true,
    onRawInput: () => {
      const {value, entities} = getRichValueWithCaret(inputField.input);
      props.onChange({text: value, entities});
    }
  });

  createEffect(on(() => props.isAdd, () => {
    const element = I18n.weakMap.get(inputField.placeholder);
    if(element instanceof I18n.IntlElement) {
      element.update({key: props.isAdd ? 'NewPoll.OptionsAddOption' : 'NewPoll.Option'});
    }
  }, {defer: true}));

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

  createEffect(() => {
    if(!props.onFocus) return;
    subscribeOn(inputField.input)('focus', props.onFocus);
  });

  const onFormFieldClickOriginal = createFormFieldClickHandler(inputField);

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
      onClick={(e) => {
        if(props.onClickOverride) {
          props.onClickOverride(e);
        } else {
          onFormFieldClickOriginal(e);
        }
      }}
    >
      <SimpleFormField.SideContent
        class={styles.draggableSideContent}
        classList={{
          [interactableClass]: props.canBeReordered,
          [styles.disabled]: !props.canBeReordered
        }}
        first
        last
        onPointerDown={props.onPointerDown}
      >
        <div class={styles.pollOptionIconContainer}>
          <Transition name='t-var-zoom'>
            <Show when={!props.noIcon}>
              <Show when={props.isAdd} fallback={<IconTsx icon='menu' class={styles.pollOptionIconFloating} />}>
                <IconTsx icon='plus' class={styles.pollOptionIconFloating} />
              </Show>
            </Show>
          </Transition>
        </div>
      </SimpleFormField.SideContent>
      <SimpleFormField.InputStub>
        {inputField.input}
        {inputField.placeholder}
      </SimpleFormField.InputStub>

      <TransitionGroup name='t-zoom' moveClass='t-move'>
        <Show when={!props.noEmojiPicker}>
          <SimpleFormField.SideContent withFixedIcon first last>
            <EmojiDropdownButton class={interactableClass} inputField={inputField} />
          </SimpleFormField.SideContent>
        </Show>
        <Show when={!props.noAttachment && (supportsMedia('photo') || supportsMedia('video') || supportsMedia('sticker'))}>
          <SimpleFormField.WithAutoLengthCounter
            maxLength={maxOptionLength()}
            first={!props.attachment}
            last
            withFixedIcon
          >
            <MediaAttachment
              btnClass={interactableClass}
              supportedMediaTypes={[
                ...(supportsMedia('photo') ? ['photo'] as const : []),
                ...(supportsMedia('video') ? ['video'] as const : []),
                ...(supportsMedia('gif') ? ['gif'] as const : []), // GIF is additional to photo
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
      </TransitionGroup>
    </SimpleFormField>
  );
};
