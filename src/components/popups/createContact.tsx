import PopupElement, {createPopup, PopupContext} from '@components/popups/indexTsx';
import {createSignal, onCleanup, onMount, untrack, useContext} from 'solid-js';
import InputField from '@components/inputField';
import TelInputField from '@components/telInputField';
import EditPeer from '@components/editPeer';
import {attachClickEvent} from '@helpers/dom/clickEvent';
import {formatPhoneNumber} from '@helpers/formatPhoneNumber';
import {toastNew} from '@components/toast';
import {i18n} from '@lib/langPack';
import ListenerSetter from '@helpers/listenerSetter';

export default function showCreateContactPopup(): void {
  function Inner() {
    const context = useContext(PopupContext);
    const middleware = untrack(() => context.middlewareHelper).get();
    const managers = untrack(() => context.managers);
    const listenerSetter = new ListenerSetter();

    const nameInputField = new InputField({
      label: 'FirstName',
      name: 'create-contact-name',
      maxLength: 70,
      required: true
    });
    nameInputField.container.classList.add('input-field-name');

    const lastNameInputField = new InputField({
      label: 'LastName',
      name: 'create-contact-lastname',
      maxLength: 70
    });

    const telInputField = new TelInputField({required: true});
    telInputField.validate = () => {
      return !!telInputField.value.match(/\d/);
    };

    const inputFields: InputField[] = [nameInputField, lastNameInputField, telInputField];

    let editPeer: EditPeer;
    let confirmBtn!: HTMLButtonElement;

    const [avatarNode, setAvatarNode] = createSignal<HTMLElement>();

    const onInput = () => {
      const name = nameInputField.value + ' ' + lastNameInputField.value;
      editPeer.avatarElem.render({peerTitle: name});
    };

    listenerSetter.add(nameInputField.input)('input', onInput);
    listenerSetter.add(lastNameInputField.input)('input', onInput);

    const onConfirm = () => {
      const promise = managers.appUsersManager.importContact(nameInputField.value, lastNameInputField.value, telInputField.value);

      promise.then(() => {
        context.hide();
      }, (err: ApiError) => {
        if(err.type === 'NO_USER') {
          toastNew({langPackKey: 'Contacts.PhoneNumber.NotRegistred'});
          editPeer.disabled = false;
        }
      });

      editPeer.lockWithPromise(promise);
    };

    onCleanup(() => {
      listenerSetter.removeAll();
    });

    onMount(() => {
      editPeer = new EditPeer({
        inputFields,
        listenerSetter,
        doNotEditAvatar: true,
        nextBtn: confirmBtn,
        avatarSize: 100,
        middleware
      });
      setAvatarNode(editPeer.avatarElem.node);

      attachClickEvent(confirmBtn, onConfirm, {listenerSetter});
      context.setBtnConfirmOnEnter(confirmBtn);

      managers.appUsersManager.getSelf().then((user) => {
        if(!middleware()) return;
        const formatted = formatPhoneNumber(user.phone);
        if(formatted.code) {
          telInputField.value = '+' + formatted.code.country_code;
        }
      });
    });

    return (
      <>
        <PopupElement.Header>
          <PopupElement.CloseButton />
          <PopupElement.Title title="AddContactTitle" />
          <button ref={confirmBtn} class="btn-primary btn-color-primary">{i18n('Add')}</button>
        </PopupElement.Header>
        <div class="name-fields">
          {nameInputField.container}
          {lastNameInputField.container}
          {avatarNode()}
        </div>
        {telInputField.container}
      </>
    );
  }

  createPopup(() => (
    <PopupElement
      class="popup-create-contact"
      closable={false}
      old
    >
      <Inner />
    </PopupElement>
  ));
}
