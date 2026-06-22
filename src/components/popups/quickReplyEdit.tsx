import PopupElement, {createPopup, PopupContext} from '@components/popups/indexTsx';
import {onMount, untrack, useContext} from 'solid-js';
import InputField from '@components/inputField';
import {attachClickEvent} from '@helpers/dom/clickEvent';
import {i18n} from '@lib/langPack';
import {toastNew} from '@components/toast';
import classNames from '@helpers/string/classNames';
import {QUICK_REPLY_MAX_TEXT_LENGTH, QUICK_REPLY_MAX_TITLE_LENGTH, QuickReply} from '@lib/quickReplies/types';
import styles from './quickReplyEdit.module.scss';

export default function showQuickReplyEditPopup(options: {
  reply?: QuickReply
} = {}): void {
  const editing = !!options.reply;

  function Inner() {
    const context = useContext(PopupContext);
    const managers = untrack(() => context.managers);

    const titleInputField = new InputField({
      label: 'QuickReplies.TitleLabel',
      name: 'quick-reply-title',
      maxLength: QUICK_REPLY_MAX_TITLE_LENGTH,
      required: true
    });
    titleInputField.container.classList.add(styles.field);

    const textInputField = new InputField({
      label: 'QuickReplies.TextLabel',
      name: 'quick-reply-text',
      maxLength: QUICK_REPLY_MAX_TEXT_LENGTH,
      withLinebreaks: true,
      required: true
    });
    textInputField.container.classList.add('input-field-textarea', styles.field);

    if(options.reply) {
      titleInputField.setValueSilently(options.reply.title);
      textInputField.setValueSilently(options.reply.text);
    }

    let confirmBtn!: HTMLButtonElement;

    const onConfirm = () => {
      const title = titleInputField.value.trim();
      const text = textInputField.value.trim();

      if(!title || !text) {
        toastNew({langPackKey: 'QuickReplies.EmptyError'});
        return;
      }

      const promise = editing ?
        managers.appQuickRepliesManager.updateQuickReply(options.reply.id, title, text) :
        managers.appQuickRepliesManager.addQuickReply(title, text);

      promise.then(() => {
        context.hide();
      }, () => {
        toastNew({langPackKey: 'QuickReplies.LimitError'});
      });
    };

    onMount(() => {
      attachClickEvent(confirmBtn, onConfirm);
      context.setBtnConfirmOnEnter(confirmBtn);
    });

    return (
      <>
        <PopupElement.Header>
          <PopupElement.CloseButton />
          <PopupElement.Title title={editing ? 'QuickReplies.EditTitle' : 'QuickReplies.AddTitle'} />
          <button ref={confirmBtn} class="btn-primary btn-color-primary">{i18n('Save')}</button>
        </PopupElement.Header>
        <PopupElement.Body class={styles.body}>
          {titleInputField.container}
          {textInputField.container}
        </PopupElement.Body>
      </>
    );
  }

  createPopup(() => (
    <PopupElement
      class={classNames('popup-quick-reply-edit', styles.popup)}
      closable={false}
      old
    >
      <Inner />
    </PopupElement>
  ));
}
