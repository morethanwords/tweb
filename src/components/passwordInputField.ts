import { cancelEvent } from "../helpers/dom";
import InputField from "./inputField";

export default class PasswordInputField extends InputField {
  public passwordVisible = false;
  public toggleVisible: HTMLElement;
  public onVisibilityClickAdditional: () => void;

  constructor(options: {
    label?: string,
    name?: string,
    labelText?: string,
  } = {}) {
    super({
      plainText: true,
      ...options
    });

    const input = this.input as HTMLInputElement;
    input.type = 'password';
    input.setAttribute('required', '');
    input.autocomplete = 'off';

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
