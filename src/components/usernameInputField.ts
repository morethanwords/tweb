/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import ListenerSetter from "../helpers/listenerSetter";
import debounce from "../helpers/schedulers/debounce";
import { LangPackKey } from "../lib/langPack";
import InputField, { InputFieldOptions, InputState } from "./inputField";
import isUsernameValid from "../lib/richTextProcessor/isUsernameValid";
import { AppManagers } from "../lib/appManagers/managers";

export class UsernameInputField extends InputField {
  private checkUsernamePromise: Promise<any>;
  private checkUsernameDebounced: (username: string) => void;
  public options: InputFieldOptions & {
    peerId?: PeerId,
    listenerSetter: ListenerSetter,
    onChange?: () => void,
    invalidText: LangPackKey,
    takenText: LangPackKey,
    availableText: LangPackKey,
    head?: string
  };

  constructor(
    options: UsernameInputField['options'], 
    private managers: AppManagers
  ) {
    super(options);

    this.checkUsernameDebounced = debounce(this.checkUsername.bind(this), 150, false, true);

    options.listenerSetter.add(this.input)('input', () => {
      const value = this.getValue();

      //console.log('userNameInput:', value);
      if(value === this.originalValue || !value.length) {
        this.setState(InputState.Neutral);
        this.options.onChange && this.options.onChange();
        return;
      } else if(!isUsernameValid(value)) { // does not check the last underscore
        this.setError(this.options.invalidText);
      } else {
        this.setState(InputState.Neutral);
      }

      if(this.input.classList.contains('error')) {
        this.options.onChange && this.options.onChange();
        return;
      }

      this.checkUsernameDebounced(value);
    });
  }

  public getValue() {
    let value = this.value;
    if(this.options.head) {
      value = value.slice(this.options.head.length);
      this.setValueSilently(this.options.head + value);
    }

    return value;
  }

  private checkUsername(username: string) {
    if(this.checkUsernamePromise) return;

    if(this.options.peerId) {
      this.checkUsernamePromise = this.managers.appChatsManager.checkUsername(this.options.peerId.toChatId(), username);
    } else {
      this.checkUsernamePromise = this.managers.appUsersManager.checkUsername(username);
    }

    this.checkUsernamePromise.then((available) => {
      if(this.getValue() !== username) return;

      if(available) {
        this.setState(InputState.Valid, this.options.availableText);
      } else {
        this.setError(this.options.takenText);
      }
    }, (err) => {
      if(this.getValue() !== username) return;

      switch(err.type) {
        case 'USERNAME_INVALID': {
          this.setError(this.options.invalidText);
          break;
        }
      }
    }).then(() => {
      this.checkUsernamePromise = undefined;
      this.options.onChange && this.options.onChange();

      const value = this.getValue();
      if(value !== username && this.isValidToChange() && isUsernameValid(value)) {
        this.checkUsername(value);
      }
    });
  };
}
