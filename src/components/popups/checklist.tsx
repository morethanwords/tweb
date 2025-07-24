import PopupElement from '.';

import Chat from '../chat/chat';
import {InputFieldTsx} from '../inputFieldTsx';
import {I18nTsx} from '../../helpers/solid/i18n';

import css from './checklist.module.scss';
import {createSignal, For} from 'solid-js';
import InputField from '../inputField';
import RowTsx from '../rowTsx';
import CheckboxFieldTsx from '../checkboxFieldTsx';
import {attachClickEvent} from '../../helpers/dom/clickEvent';
import getRichValueWithCaret from '../../helpers/dom/getRichValueWithCaret';
import {PAYMENT_REJECTED} from '../chat/paidMessagesInterceptor';
import {InputMedia, Message, MessageMedia, TextWithEntities, TodoItem, TodoList} from '../../layer';
import {MTAppConfig} from '../../lib/mtproto/appConfig';
import safeAssign from '../../helpers/object/safeAssign';
import wrapEmojiText from '../../lib/richTextProcessor/wrapEmojiText';
import {ButtonIconTsx} from '../buttonIconTsx';
import Scrollable from '../scrollable2';
import Button from '../buttonTsx';
import classNames from '../../helpers/string/classNames';
import {toastNew} from '../toast';

export class PopupChecklist extends PopupElement {
  private chat: Chat;
  private editMessage?: Message.message & {media: MessageMedia.messageMediaToDo};

  constructor(options: {
    chat: Chat,
    editMessage?: Message.message & {media: MessageMedia.messageMediaToDo}
  }) {
    super(`${css.popup} popup-new-media`, {
      overlayClosable: true,
      body: true,
      withConfirm: options.editMessage ? 'Save' : 'Create',
      title: options.editMessage ? 'EditChecklist' : 'NewChecklist'
    });

    safeAssign(this, options);

    this.construct();
  }

  private async construct() {
    const appConfig = await this.managers.apiManager.getAppConfig();
    this.appendSolidBody(() => this._construct({appConfig}))
  }

  protected _construct(props: { appConfig: MTAppConfig }) {
    const maxItems = props.appConfig.todo_items_max ?? 10;
    const titleInput = new InputField({
      placeholder: 'NewChecklist.TitlePlaceholder',
      name: 'title'
    });

    const [items, setItems] = createSignal<{id: number, field: InputField}[]>([]);
    const [allowOthersToMarkAsDone, setAllowOthersToMarkAsDone] = createSignal(this.editMessage?.media.todo.pFlags.others_can_complete ?? false);
    const [allowOthersToAddTasks, setAllowOthersToAddTasks] = createSignal(this.editMessage?.media.todo.pFlags.others_can_append ?? false);

    const updateConfirmButton = () => {
      const valid = (() => {
        if(!titleInput.value) return false;
        const items$ = items();
        if(items$.length === 0) return false;
        return items$.every(v => v.field.value.trim());
      })()

      this.btnConfirm.disabled = !valid;
    };

    this.listenerSetter.add(titleInput.input)('input', updateConfirmButton);

    const addItem = (existing?: TodoItem) => {
      if(items().length >= maxItems) return;

      const field = new InputField({
        placeholder: 'NewChecklist.TaskPlaceholder',
        name: 'item',
        maxLength: props.appConfig.todo_item_length_max ?? 255
      })
      if(existing) {
        field.setValueSilently(wrapEmojiText(existing.title.text, false, existing.title.entities), true);
      }
      this.listenerSetter.add(field.input)('input', updateConfirmButton);
      setItems(v => {
        let id
        if(existing) id = existing.id
        else if(v.length > 0) id = v[v.length - 1].id + 1
        else id = 0

        return [...v, {id, field}];
      });
      updateConfirmButton();
    }

    const removeItem = (id: number) => {
      setItems(v => v.filter(v => v.id !== id));
      updateConfirmButton();
    }

    if(this.editMessage) {
      titleInput.setValueSilently(wrapEmojiText(this.editMessage.media.todo.title.text, false, this.editMessage.media.todo.title.entities), true);
      for(const item of this.editMessage.media.todo.list) {
        addItem(item);
      }
    } else {
      addItem()
    }

    const handleConfirm = async() => {
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
        await this.managers.appMessagesManager.editMessage(this.editMessage, this.editMessage.message, {
          newMedia: inputMedia
        });
        this.hide();
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

    attachClickEvent(this.btnConfirm, handleConfirm, {listenerSetter: this.listenerSetter});

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
                  <ButtonIconTsx
                    class={css.itemRemoveButton}
                    icon="close"
                    onClick={() => removeItem(item.id)}
                  />
                </div>
              )}
            </For>
            {items().length < maxItems && (
              <Button
                class={`btn-transparent ${css.addTaskButton}`}
                icon="add"
                onClick={() => addItem()}
              >
                Add task
              </Button>
            )}
          </div>

          <div class={css.options}>
            <I18nTsx class={css.groupTitle} key="ChecklistOptions" />
            <RowTsx
              title="Allow Others to Mark as Done"
              checkboxFieldToggle={
                <CheckboxFieldTsx
                  checked={allowOthersToMarkAsDone()}
                  toggle
                  onChange={setAllowOthersToMarkAsDone}
                />
              }
            />
            <RowTsx
              title="Allow Others to Add Tasks"
              checkboxFieldToggle={
                <CheckboxFieldTsx
                  checked={allowOthersToAddTasks()}
                  toggle
                  onChange={setAllowOthersToAddTasks}
                />
              }
            />
          </div>
        </Scrollable>
      </>
    )
  }
}

export class PopupChecklistAppend extends PopupElement {
  private chat: Chat;
  private editMessage?: Message.message & {media: MessageMedia.messageMediaToDo};

  constructor(options: {
    chat: Chat,
    editMessage?: Message.message & {media: MessageMedia.messageMediaToDo}
  }) {
    super(`${css.popup} popup-new-media`, {
      overlayClosable: true,
      body: true,
      withConfirm: 'Save',
      title: 'ChecklistAddTasks'
    });

    safeAssign(this, options);

    this.construct();
  }

  private async construct() {
    const appConfig = await this.managers.apiManager.getAppConfig();
    this.appendSolidBody(() => this._construct({appConfig}))
  }

  protected _construct(props: { appConfig: MTAppConfig }) {
    const maxItems = props.appConfig.todo_items_max ?? 10;

    const [items, setItems] = createSignal<InputField[]>([]);

    const updateConfirmButton = () => {
      const valid = (() => {
        const items$ = items();
        if(items$.length === 0) return false;
        return items$.every(v => v.value.trim());
      })()

      this.btnConfirm.disabled = !valid;
    };

    const addItem = () => {
      if(items().length >= maxItems) return;

      const field = new InputField({
        placeholder: 'NewChecklist.TaskPlaceholder',
        name: 'item',
        maxLength: props.appConfig.todo_item_length_max ?? 255
      })
      this.listenerSetter.add(field.input)('input', updateConfirmButton);
      setItems(v => [...v, field]);
      updateConfirmButton();
    }

    const removeItem = (idx: number) => {
      setItems(v => v.filter((_, i) => i !== idx));
      updateConfirmButton();
    }

    addItem()

    const handleConfirm = () => {
      const maxId = this.editMessage?.media.todo.list.reduce((max, item) => Math.max(max, item.id), 0) ?? 0;
      this.hide();
      this.managers.appMessagesManager.appendTodo({
        peerId: this.chat.peerId,
        mid: this.editMessage.mid,
        tasks: items().map((v, idx) => {
          const richValue = getRichValueWithCaret(v.input, true, false);
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
      })
    }

    attachClickEvent(this.btnConfirm, handleConfirm, {listenerSetter: this.listenerSetter});

    return (
      <>
        <Scrollable class={css.appendList}>
          <For each={items()}>
            {(item, idx) => (
              <div
                class={classNames(
                  css.item,
                  idx() === 0 && css.itemFirst,
                  idx() === items().length - 1 && css.itemLast
                )}
              >
                {item.container}
                <ButtonIconTsx
                  class={css.itemRemoveButton}
                  icon="close"
                  onClick={() => removeItem(idx())}
                />
              </div>
            )}
          </For>
          {items().length < maxItems && (
            <Button
              class={`btn-transparent ${css.addTaskButton}`}
              icon="add"
              onClick={() => addItem()}
            >
                Add task
            </Button>
          )}
        </Scrollable>
      </>
    )
  }
}
