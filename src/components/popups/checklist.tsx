import PopupElement from '.';

import Chat from '../chat/chat';
import {I18nTsx} from '../../helpers/solid/i18n';

import css from './checklist.module.scss';
import {createEffect, createSignal, For, on} from 'solid-js';
import InputField from '../inputField';
import Row from '../rowTsx';
import CheckboxFieldTsx from '../checkboxFieldTsx';
import {attachClickEvent} from '../../helpers/dom/clickEvent';
import getRichValueWithCaret from '../../helpers/dom/getRichValueWithCaret';
import {PAYMENT_REJECTED} from '../chat/paidMessagesInterceptor';
import {InputMedia, Message, MessageMedia, TodoItem} from '../../layer';
import {MTAppConfig} from '../../lib/mtproto/appConfig';
import safeAssign from '../../helpers/object/safeAssign';
import {wrapEmojiTextWithEntities} from '../../lib/richTextProcessor/wrapEmojiText';
import {ButtonIconTsx} from '../buttonIconTsx';
import Scrollable from '../scrollable2';
import Button from '../buttonTsx';
import classNames from '../../helpers/string/classNames';
import {fastRaf} from '../../helpers/schedulers';
import {toastNew} from '../toast';

export class PopupChecklist extends PopupElement {
  private chat: Chat;
  private editMessage?: Message.message & {media: MessageMedia.messageMediaToDo};
  private focusItemId?: number;
  private appending?: boolean;

  constructor(options: {
    chat: Chat,
    editMessage?: Message.message & {media: MessageMedia.messageMediaToDo}
    appending?: boolean
  }) {
    super(`${css.popup} popup-new-media`, {
      overlayClosable: true,
      body: true,
      withConfirm: options.editMessage ? 'Save' : 'Create',
      title: options.appending ? 'ChecklistAddTasks' : options.editMessage ? 'EditChecklist' : 'NewChecklist'
    });

    safeAssign(this, options);

    this.construct();
  }

  private async construct() {
    const appConfig = await this.managers.apiManager.getAppConfig();
    this.appendSolidBody(() => this._construct({appConfig}));
  }

  protected _construct(props: {appConfig: MTAppConfig}) {
    const maxItems = props.appConfig.todo_items_max ?? 10;
    const titleInput = new InputField({
      placeholder: 'NewChecklist.TitlePlaceholder',
      name: 'title',
      canBeEdited: !this.appending
    });

    const [pending, setPending] = createSignal(false);
    const [items, setItems] = createSignal<{id: number, existing: boolean, field: InputField}[]>([]);
    const [allowOthersToMarkAsDone, setAllowOthersToMarkAsDone] = createSignal(this.editMessage?.media.todo.pFlags.others_can_complete ?? false);
    const [allowOthersToAddTasks, setAllowOthersToAddTasks] = createSignal(this.editMessage?.media.todo.pFlags.others_can_append ?? false);

    const updateConfirmButton = () => {
      const valid = (() => {
        if(!titleInput.value) return false;
        let items$ = items();
        if(this.appending) {
          items$ = items$.filter(v => !v.existing);
        }

        if(items$.length === 0) return false;
        return items$.every(v => {
          const val = v.field.value.trim();
          return val.length > 0 && val.length <= props.appConfig.todo_item_length_max;
        });
      })();

      this.btnConfirm.disabled = !valid;
    };

    this.listenerSetter.add(titleInput.input)('input', updateConfirmButton);

    const addItem = (existing?: TodoItem) => {
      if(items().length >= maxItems) return;

      const field = new InputField({
        placeholder: 'NewChecklist.TaskPlaceholder',
        name: 'item',
        maxLength: props.appConfig.todo_item_length_max ?? 255,
        canBeEdited: !(existing && this.appending)
      })
      if(existing) {
        field.setValueSilently(wrapEmojiTextWithEntities(existing.title), true);
      }
      this.listenerSetter.add(field.input)('input', updateConfirmButton);
      setItems(v => {
        let id
        if(existing) id = existing.id
        else if(v.length > 0) id = v[v.length - 1].id + 1
        else id = 0

        return [...v, {id, existing: !!existing, field}];
      });
      updateConfirmButton();
      if(!existing || existing.id === this.focusItemId) {
        fastRaf(() => {
          field.input.focus();
        });
      }
    }

    const removeItem = (id: number) => {
      setItems(v => v.filter(v => v.id !== id));
      updateConfirmButton();
    };

    if(this.editMessage) {
      titleInput.setValueSilently(wrapEmojiTextWithEntities(this.editMessage.media.todo.title), true);
      for(const item of this.editMessage.media.todo.list) {
        addItem(item);
      }
      if(this.appending) addItem();
    } else {
      addItem();
    }

    const handleConfirm = async() => {
      let promise: Promise<any>;
      if(this.appending) {
        const maxId = this.editMessage?.media.todo.list.reduce((max, item) => Math.max(max, item.id), 0) ?? 0;
        const newItems = items().filter(v => !v.existing);

        promise = this.managers.appMessagesManager.appendTodo({
          peerId: this.chat.peerId,
          mid: this.editMessage.mid,
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
        const title = getRichValueWithCaret(titleInput.input, true, false);

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
                id: this.editMessage ? v.id : idx + 1,
                title: {
                  _: 'textWithEntities',
                  text: richValue.value,
                  entities: richValue.entities
                }
              };
            })
          }
        }

        if(this.editMessage) {
          promise = this.managers.appMessagesManager.editMessage(this.editMessage, this.editMessage.message, {
            newMedia: inputMedia
          });
        } else {
          const sendingParams = this.chat.getMessageSendingParams();

          const preparedPaymentResult = await this.chat.input.paidMessageInterceptor.prepareStarsForPayment(1);
          if(preparedPaymentResult === PAYMENT_REJECTED) return;

          sendingParams.confirmedPaymentResult = preparedPaymentResult;

          this.hide();

          this.managers.appMessagesManager.sendOther({
            ...sendingParams,
            inputMedia
          });

          if(this.chat.input.helperType === 'reply') {
            this.chat.input.clearHelper();
          }

          this.chat.input.onMessageSent(false, false);
        }
      }

      if(promise) {
        setPending(true);
        promise.then(() => {
          setPending(false);
          this.hide();
        }).catch(() => {
          setPending(false);
          toastNew({langPackKey: 'Error.AnError'});
        });
      }
    }

    attachClickEvent(this.btnConfirm, handleConfirm, {listenerSetter: this.listenerSetter});

    createEffect(on(pending, (pending) => {
      this.btnConfirm.disabled = pending;
    }));

    return (
      <>
        <div class={css.header}>
          {titleInput.container}
        </div>

        <Scrollable class={css.body}>
          <div class={css.checklist}>
            <I18nTsx class={css.groupTitle} key="Checklist" />
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
                  {!(item.existing && this.appending) && (
                    <ButtonIconTsx
                      class={css.itemRemoveButton}
                      icon="close"
                      onClick={() => removeItem(item.id)}
                    />
                  )}
                </div>
              )}
            </For>
            {items().length < maxItems && (
              <Button
                class={`btn-transparent ${css.addTaskButton}`}
                icon="add"
                onClick={() => addItem()}
                text="ChecklistAddTask"
              />
            )}
          </div>

          {!this.appending && (
            <div class={css.options}>
              <I18nTsx class={css.groupTitle} key="ChecklistOptions" />
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
            </div>
          )}
        </Scrollable>
      </>
    );
  }
}
