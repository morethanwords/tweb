import {createSignal, For, onCleanup, onMount, Show, untrack, useContext} from 'solid-js';
import PopupElement, {createPopup, PopupContext} from '@components/popups/indexTsx';

import Chat from '@components/chat/chat';
import Button from '@components/buttonTsx';
import CheckboxFieldTsx from '@components/checkboxFieldTsx';
import {ButtonIconTsx} from '@components/buttonIconTsx';
import InputField from '@components/inputField';
import Row from '@components/rowTsx';
import Section from '@components/section';
import {PAYMENT_REJECTED} from '@components/chat/paidMessagesInterceptor';
import {toastNew} from '@components/toast';
import {attachClickEvent} from '@helpers/dom/clickEvent';
import getRichValueWithCaret from '@helpers/dom/getRichValueWithCaret';
import {fastRaf} from '@helpers/schedulers';
import ListenerSetter from '@helpers/listenerSetter';
import {I18nTsx} from '@helpers/solid/i18n';
import classNames from '@helpers/string/classNames';
import {InputMedia, Message, MessageMedia, TodoItem} from '@layer';
import {i18n, LangPackKey} from '@lib/langPack';
import {wrapEmojiTextWithEntities} from '@lib/richTextProcessor/wrapEmojiText';

import css from '@components/popups/checklist.module.scss';

export type ChecklistPopupOptions = {
  chat: Chat,
  editMessage?: Message.message & {media: MessageMedia.messageMediaToDo},
  focusItemId?: number,
  appending?: boolean
};

export default function showChecklistPopup(options: ChecklistPopupOptions): void {
  const {chat, editMessage, focusItemId, appending} = options;

  const titleKey: LangPackKey = appending ? 'ChecklistAddTasks' :
    editMessage ? 'EditChecklist' : 'NewChecklist';
  const confirmKey: LangPackKey = editMessage ? 'Save' : 'Create';

  type Item = {id: number, existing: boolean, field: InputField};

  function Inner() {
    const context = useContext(PopupContext);
    const middleware = untrack(() => context.middlewareHelper).get();
    const managers = untrack(() => context.managers);
    const listenerSetter = new ListenerSetter();

    onCleanup(() => listenerSetter.removeAll());

    const [items, setItems] = createSignal<Item[]>([]);
    const [valid, setValid] = createSignal(false);
    const [pending, setPending] = createSignal(false);
    const [titleInput, setTitleInput] = createSignal<InputField>();
    const [maxItems, setMaxItems] = createSignal(10);
    const [allowOthersToMarkAsDone, setAllowOthersToMarkAsDone] = createSignal(
      editMessage?.media.todo.pFlags.others_can_complete ?? false
    );
    const [allowOthersToAddTasks, setAllowOthersToAddTasks] = createSignal(
      editMessage?.media.todo.pFlags.others_can_append ?? false
    );

    let addItem: ((existing?: TodoItem) => void) | undefined;
    let removeItem: ((id: number) => void) | undefined;
    let handleConfirm: (() => Promise<void>) | undefined;

    let btnConfirmEl!: HTMLButtonElement;

    managers.apiManager.getAppConfig().then((appConfig) => {
      if(!middleware()) return;

      const itemLengthMax = appConfig.todo_item_length_max ?? 255;
      setMaxItems(appConfig.todo_items_max ?? 10);

      const _titleInput = new InputField({
        placeholder: 'NewChecklist.TitlePlaceholder',
        name: 'title',
        canBeEdited: !appending
      });

      const updateConfirmButton = () => {
        const ok = (() => {
          if(!_titleInput.value) return false;
          let items$ = items();
          if(appending) {
            items$ = items$.filter((v) => !v.existing);
          }

          if(items$.length === 0) return false;
          return items$.every((v) => {
            const val = v.field.value.trim();
            return val.length > 0 && val.length <= itemLengthMax;
          });
        })();

        setValid(ok);
      };

      listenerSetter.add(_titleInput.input)('input', updateConfirmButton);

      addItem = (existing?: TodoItem) => {
        if(items().length >= maxItems()) return;

        const field = new InputField({
          placeholder: 'NewChecklist.TaskPlaceholder',
          name: 'item',
          maxLength: itemLengthMax,
          canBeEdited: !(existing && appending)
        });
        if(existing) {
          field.setValueSilently(wrapEmojiTextWithEntities(existing.title), true);
        }
        listenerSetter.add(field.input)('input', updateConfirmButton);
        setItems((v) => {
          let id: number;
          if(existing) id = existing.id;
          else if(v.length > 0) id = v[v.length - 1].id + 1;
          else id = 0;
          return [...v, {id, existing: !!existing, field}];
        });
        updateConfirmButton();
        if(!existing || existing.id === focusItemId) {
          fastRaf(() => {
            field.input.focus();
          });
        }
      };

      removeItem = (id: number) => {
        setItems((v) => v.filter((it) => it.id !== id));
        updateConfirmButton();
      };

      handleConfirm = async() => {
        let promise: Promise<any>;
        if(appending) {
          const maxId = editMessage?.media.todo.list.reduce((max, item) => Math.max(max, item.id), 0) ?? 0;
          const newItems = items().filter((v) => !v.existing);

          promise = managers.appMessagesManager.appendTodo({
            peerId: chat.peerId,
            mid: editMessage.mid,
            tasks: newItems.map((v, idx) => {
              const richValue = getRichValueWithCaret(v.field.input, true, false);
              return {
                _: 'todoItem',
                // ids must be consecutive when creating
                id: maxId + idx + 1,
                title: {
                  _: 'textWithEntities',
                  text: richValue.value,
                  entities: richValue.entities
                }
              };
            })
          });
        } else {
          const title = getRichValueWithCaret(_titleInput.input, true, false);

          const inputMedia: InputMedia = {
            _: 'inputMediaTodo',
            todo: {
              _: 'todoList',
              pFlags: {
                others_can_append: allowOthersToAddTasks() ? true : undefined,
                others_can_complete: allowOthersToMarkAsDone() ? true : undefined
              },
              title: {
                _: 'textWithEntities',
                text: title.value,
                entities: title.entities
              },
              list: items().map((v, idx) => {
                const richValue = getRichValueWithCaret(v.field.input, true, false);
                return {
                  _: 'todoItem',
                  // ids must be consecutive when creating
                  id: editMessage ? v.id : idx + 1,
                  title: {
                    _: 'textWithEntities',
                    text: richValue.value,
                    entities: richValue.entities
                  }
                };
              })
            }
          };

          if(editMessage) {
            promise = managers.appMessagesManager.editMessage(editMessage, editMessage.message, {
              newMedia: inputMedia
            });
          } else {
            const sendingParams = chat.getMessageSendingParams();

            const preparedPaymentResult = await chat.input.paidMessageInterceptor.prepareStarsForPayment(1);
            if(preparedPaymentResult === PAYMENT_REJECTED) return;

            sendingParams.confirmedPaymentResult = preparedPaymentResult;

            context.hide();

            managers.appMessagesManager.sendOther({
              ...sendingParams,
              inputMedia
            });

            if(chat.input.helperType === 'reply') {
              chat.input.clearHelper();
            }

            chat.input.onMessageSent(false, false);
          }
        }

        if(promise) {
          setPending(true);
          promise.then(() => {
            setPending(false);
            context.hide();
          }).catch(() => {
            setPending(false);
            toastNew({langPackKey: 'Error.AnError'});
          });
        }
      };

      if(editMessage) {
        _titleInput.setValueSilently(wrapEmojiTextWithEntities(editMessage.media.todo.title), true);
        for(const item of editMessage.media.todo.list) {
          addItem(item);
        }
        if(appending) addItem();
      } else {
        addItem();
      }

      setTitleInput(_titleInput);
    });

    onMount(() => {
      attachClickEvent(btnConfirmEl, () => {
        handleConfirm?.();
      }, {listenerSetter});
      context.setBtnConfirmOnEnter(btnConfirmEl);
    });

    return (
      <>
        <PopupElement.Header>
          <PopupElement.CloseButton />
          <PopupElement.Title title={titleKey} />
          <button
            ref={btnConfirmEl}
            class="btn-primary btn-color-primary"
            disabled={!valid() || pending() || !titleInput()}
          >
            {i18n(confirmKey)}
          </button>
        </PopupElement.Header>
        <PopupElement.Scrollable>
          <Show when={titleInput()}>
            <Section class={css.titleSection} noShadow noDelimiter>
              {titleInput().container}
            </Section>
            <Section name="Checklist">
              <For each={items()}>
                {(item, idx) => (
                  <div
                    class={classNames(
                      css.item,
                      idx() === 0 && css.itemFirst,
                      idx() === items().length - 1 && css.itemLast
                    )}
                  >
                    {item.field.container}
                    {!(item.existing && appending) && (
                      <ButtonIconTsx
                        class={css.itemRemoveButton}
                        icon="close"
                        onClick={() => removeItem?.(item.id)}
                      />
                    )}
                  </div>
                )}
              </For>
              <Show when={items().length < maxItems()}>
                <Button
                  class={`btn-transparent ${css.addTaskButton}`}
                  icon="add"
                  onClick={() => addItem?.()}
                  text="ChecklistAddTask"
                />
              </Show>
            </Section>

            <Show when={!appending}>
              <Section name="ChecklistOptions">
                <Row>
                  <Row.CheckboxFieldToggle>
                    <CheckboxFieldTsx
                      checked={allowOthersToMarkAsDone()}
                      toggle
                      onChange={setAllowOthersToMarkAsDone}
                    />
                  </Row.CheckboxFieldToggle>
                  <Row.Title><I18nTsx key="ChecklistAllowOthersDone" /></Row.Title>
                </Row>
                <Row>
                  <Row.CheckboxFieldToggle>
                    <CheckboxFieldTsx
                      checked={allowOthersToAddTasks()}
                      toggle
                      onChange={setAllowOthersToAddTasks}
                    />
                  </Row.CheckboxFieldToggle>
                  <Row.Title><I18nTsx key="ChecklistAllowOthersAdd" /></Row.Title>
                </Row>
              </Section>
            </Show>
          </Show>
        </PopupElement.Scrollable>
      </>
    );
  }

  createPopup(() => (
    <PopupElement class={`${css.popup} popup-new-media`}>
      <Inner />
    </PopupElement>
  ));
}
