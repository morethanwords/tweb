/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {InputFile} from '../layer';
import AvatarEdit from './avatarEdit';
import InputField from './inputField';
import ListenerSetter from '../helpers/listenerSetter';
import ButtonCorner from './buttonCorner';
import safeAssign from '../helpers/object/safeAssign';
import {NULL_PEER_ID} from '../lib/mtproto/mtproto_config';
import {Middleware} from '../helpers/middleware';
import {avatarNew} from './avatarNew';

export default class EditPeer {
  public nextBtn: HTMLButtonElement;

  public uploadAvatar: () => Promise<InputFile>;
  public avatarEdit: AvatarEdit;
  public avatarElem: ReturnType<typeof avatarNew>;

  private inputFields: InputField[];
  private listenerSetter: ListenerSetter;

  private peerId: PeerId;

  private _disabled = false;
  private avatarSize = 120;

  constructor(options: {
    peerId?: EditPeer['peerId'],
    inputFields: EditPeer['inputFields'],
    listenerSetter: ListenerSetter,
    doNotEditAvatar?: boolean,
    withoutAvatar?: boolean,
    nextBtn?: HTMLButtonElement,
    avatarSize?: number,
    popupOptions?: ConstructorParameters<typeof AvatarEdit>[1],
    middleware: Middleware
  }) {
    safeAssign(this, options);

    this.peerId ||= NULL_PEER_ID;

    if(!this.nextBtn) {
      this.nextBtn = ButtonCorner({icon: 'check'});
    } else if(!this.nextBtn.classList.contains('btn-corner')) {
      this.handleChange = () => {
        this.nextBtn.toggleAttribute('disabled', !this.isChanged() || this.disabled);
      };
    }

    if(!options.withoutAvatar) {
      this.avatarElem = avatarNew({
        middleware: options.middleware,
        size: this.avatarSize,
        peerId: this.peerId
      });
      this.avatarElem.node.classList.add('avatar-placeholder');

      if(!options.doNotEditAvatar) {
        this.avatarEdit = new AvatarEdit((_upload) => {
          this.uploadAvatar = _upload;
          this.handleChange();
          this.avatarElem.node.remove();
        }, options.popupOptions);

        this.avatarEdit.container.append(this.avatarElem.node);
      }
    }

    this.inputFields.forEach((inputField) => {
      this.listenerSetter.add(inputField.input)('input', this.handleChange);
    });

    this.handleChange();
  }

  public get disabled() {
    return this._disabled;
  }

  public set disabled(value) {
    this._disabled = value;
    this.inputFields.forEach((inputField) => inputField.input.toggleAttribute('disabled', value));
    this.handleChange();
  }

  public lockWithPromise(promise: Promise<any>, unlockOnSuccess = false) {
    this.disabled = true;
    promise.then(() => {
      if(unlockOnSuccess) {
        this.disabled = false;
      }
    }, () => {
      this.disabled = false;
    });
  }

  public isChanged = () => {
    if(this.uploadAvatar) {
      return true;
    }

    let changedLength = 0, requiredLength = 0, requiredValidLength = 0;
    this.inputFields.forEach((inputField) => {
      if(inputField.isValid()) {
        if(inputField.isChanged()) {
          ++changedLength;
        }

        if(inputField.required) {
          ++requiredValidLength;
        }
      }

      if(inputField.required) {
        ++requiredLength;
      }
    });

    return requiredLength === requiredValidLength && changedLength > 0;
  };

  public handleChange = () => {
    this.nextBtn.classList.toggle('is-visible', this.isChanged());
  };
}
