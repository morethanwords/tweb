/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import { InputFile } from "../layer";
import AvatarEdit from "./avatarEdit";
import AvatarElement from "./avatar";
import InputField from "./inputField";
import ListenerSetter from "../helpers/listenerSetter";
import ButtonCorner from "./buttonCorner";
import safeAssign from "../helpers/object/safeAssign";

export default class EditPeer {
  public nextBtn: HTMLButtonElement;

  public uploadAvatar: () => Promise<InputFile>;
  public avatarEdit: AvatarEdit;
  public avatarElem: AvatarElement;

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
    avatarSize?: number
  }) {
    safeAssign(this, options);

    if(!this.nextBtn) {
      this.nextBtn = ButtonCorner({icon: 'check'});
    } else if(!this.nextBtn.classList.contains('btn-corner')) {
      this.handleChange = () => {
        this.nextBtn.toggleAttribute('disabled', !this.isChanged() || this.disabled);
      };
    }

    if(!options.withoutAvatar) {
      this.avatarElem = document.createElement('avatar-element') as AvatarElement;
      this.avatarElem.classList.add('avatar-placeholder', 'avatar-' + this.avatarSize);
      this.avatarElem.updateWithOptions({peerId: this.peerId});
  
      if(!options.doNotEditAvatar) {
        this.avatarEdit = new AvatarEdit((_upload) => {
          this.uploadAvatar = _upload;
          this.handleChange();
          this.avatarElem.remove();
        });
  
        this.avatarEdit.container.append(this.avatarElem);
      }
    }

    this.inputFields.forEach(inputField => {
      this.listenerSetter.add(inputField.input)('input', this.handleChange);
    });

    this.handleChange();
  }

  public get disabled() {
    return this._disabled;
  }

  public set disabled(value) {
    this._disabled = value;
    this.inputFields.forEach(inputField => inputField.input.toggleAttribute('disabled', value));
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
    this.inputFields.forEach(inputField => {
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
