/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import InputField from '../inputField';
import PopupElement from '.';
import {attachClickEvent} from '../../helpers/dom/clickEvent';
import EditPeer from '../editPeer';
import {_i18n} from '../../lib/langPack';
import TelInputField from '../telInputField';
import {formatPhoneNumber} from '../../helpers/formatPhoneNumber';
import {toastNew} from '../toast';

export default class PopupCreateContact extends PopupElement {
  constructor() {
    super('popup-create-contact popup-send-photo popup-new-media', {closable: true, withConfirm: 'Add', title: 'AddContactTitle'});
    this.construct();
  }

  private async construct() {
    attachClickEvent(this.btnConfirm, () => {
      const promise = this.managers.appUsersManager.importContact(nameInputField.value, lastNameInputField.value, telInputField.value);

      promise.then(() => {
        this.hide();
      }, (err: ApiError) => {
        if(err.type === 'NO_USER') {
          toastNew({langPackKey: 'Contacts.PhoneNumber.NotRegistred'});
          editPeer.disabled = false;
        }
      });

      editPeer.lockWithPromise(promise);
    }, {listenerSetter: this.listenerSetter});

    const inputFields: InputField[] = [];
    const div = document.createElement('div');
    div.classList.add('name-fields');
    const nameInputField = new InputField({
      label: 'FirstName',
      name: 'create-contact-name',
      maxLength: 70,
      required: true
    });
    const lastNameInputField = new InputField({
      label: 'LastName',
      name: 'create-contact-lastname',
      maxLength: 70
    });
    const telInputField = new TelInputField({required: true});
    inputFields.push(nameInputField, lastNameInputField, telInputField);

    const onInput = () => {
      const name = nameInputField.value + ' ' + lastNameInputField.value;
      // const abbr = getAbbreviation(name);
      editPeer.avatarElem.peerTitle = name;
      editPeer.avatarElem.update();
    };

    this.listenerSetter.add(nameInputField.input)('input', onInput);
    this.listenerSetter.add(lastNameInputField.input)('input', onInput);

    telInputField.validate = () => {
      return !!telInputField.value.match(/\d/);
    };

    const user = await this.managers.appUsersManager.getSelf();
    const formatted = formatPhoneNumber(user.phone);
    if(formatted.code) {
      telInputField.value = '+' + formatted.code.country_code;
    }

    const editPeer = new EditPeer({
      inputFields,
      listenerSetter: this.listenerSetter,
      doNotEditAvatar: true,
      nextBtn: this.btnConfirm,
      avatarSize: 100
    });

    div.append(nameInputField.container, lastNameInputField.container, editPeer.avatarElem);
    this.container.append(div, telInputField.container);

    this.show();
  }
}
