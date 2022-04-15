/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

// import { IS_MOBILE_SAFARI, IS_SAFARI } from "../environment/userAgent";
import cancelEvent from "../helpers/dom/cancelEvent";
import InputField, { InputFieldOptions } from "./inputField";

export default class PasswordInputField extends InputField {
  public passwordVisible = false;
  public toggleVisible: HTMLElement;
  public onVisibilityClickAdditional: () => void;

  constructor(options: InputFieldOptions = {}) {
    super({
      plainText: true,
      ...options
    });

    const input = this.input as HTMLInputElement;
    input.type = 'password';
    input.setAttribute('required', '');
    input.name = 'notsearch_password';
    input.autocomplete = 'off';

    /* if(IS_SAFARI && !IS_MOBILE_SAFARI) {
      input.setAttribute('readonly', '');
      input.addEventListener('focus', () => {
        input.removeAttribute('readonly');
      }, {once: true});
    } */

    // * https://stackoverflow.com/a/35949954/6758968
    const stealthy = document.createElement('input');
    stealthy.classList.add('stealthy');
    stealthy.tabIndex = -1;
    stealthy.type = 'password';
    input.parentElement.prepend(stealthy);
    input.parentElement.insertBefore(stealthy.cloneNode(), input.nextSibling);

    const toggleVisible = this.toggleVisible = document.createElement('span');
    toggleVisible.classList.add('toggle-visible', 'tgico');

    this.container.classList.add('input-field-password');
    this.container.append(toggleVisible);

    toggleVisible.addEventListener('click', this.onVisibilityClick);
    toggleVisible.addEventListener('touchend', this.onVisibilityClick);
  }

  public onVisibilityClick = (e: Event) => {
    cancelEvent(e);
    this.passwordVisible = !this.passwordVisible;

    this.toggleVisible.classList.toggle('eye-hidden', this.passwordVisible);
    (this.input as HTMLInputElement).type = this.passwordVisible ? 'text' : 'password';
    this.onVisibilityClickAdditional && this.onVisibilityClickAdditional();
  };
}
