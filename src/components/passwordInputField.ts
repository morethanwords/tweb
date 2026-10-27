import cancelEvent from '@helpers/dom/cancelEvent';
import Icon from '@components/icon';
import Button from '@components/button';
import Modes from '@config/modes';
import InputField, {InputFieldOptions} from '@components/inputField';

export class PasswordInputHelpers {
  public passwordVisible = false;
  public toggleVisible: HTMLElement;
  public onVisibilityClickAdditional: () => void;

  constructor(public container: HTMLElement, public input: HTMLInputElement) {
    input.type = 'password';
    input.setAttribute('required', '');
    input.name = 'notsearch_password';
    input.autocomplete = 'off';

    // * https://stackoverflow.com/a/35949954/6758968
    const stealthy = document.createElement('input');
    stealthy.classList.add('stealthy');
    stealthy.tabIndex = -1;
    stealthy.setAttribute('aria-hidden', 'true');
    stealthy.type = 'password';
    input.parentElement.prepend(stealthy);
    input.parentElement.insertBefore(stealthy.cloneNode(), input.nextSibling);

    /* if(IS_SAFARI && !IS_MOBILE_SAFARI) {
      input.setAttribute('readonly', '');
      input.addEventListener('focus', () => {
        input.removeAttribute('readonly');
      }, {once: true});
    } */

    const toggleVisible = this.toggleVisible = Button('toggle-visible', {noRipple: true, ariaLabel: 'AccDescr.ShowPassword', asDiv: !Modes.a11y});
    toggleVisible.setAttribute('aria-pressed', 'false');
    toggleVisible.append(Icon('eye1_filled'));

    container.classList.add('input-field-password');
    container.append(toggleVisible);

    toggleVisible.addEventListener('click', this.onVisibilityClick);
    toggleVisible.addEventListener('touchend', this.onVisibilityClick);
  }

  public onVisibilityClick = (e: Event) => {
    cancelEvent(e);
    this.passwordVisible = !this.passwordVisible;

    this.toggleVisible.replaceChildren(Icon(this.passwordVisible ? 'eye2_filled' : 'eye1_filled'));
    this.toggleVisible.setAttribute('aria-pressed', String(this.passwordVisible));
    (this.input as HTMLInputElement).type = this.passwordVisible ? 'text' : 'password';
    this.onVisibilityClickAdditional?.();
  };
}

export default class PasswordInputField extends InputField {
  public helpers: PasswordInputHelpers;

  constructor(options: InputFieldOptions = {}) {
    super({
      plainText: true,
      allowStartingSpace: true,
      ...options
    });

    this.helpers = new PasswordInputHelpers(this.container, this.input as HTMLInputElement);
  }
}
