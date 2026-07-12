import cancelEvent from '@helpers/dom/cancelEvent';
import Icon from '@components/icon';
import InputField, {InputFieldOptions} from '@components/inputField';

export type PasswordInputFieldOptions = InputFieldOptions & {
  /**
   * Keep the field as `type="text"` and mask characters with CSS instead of
   * using `type="password"`. Chrome's password manager keys off
   * `type="password"`, so this stops the "Save/Update password?" doorhanger
   * (which ignores `autocomplete`/`name` hints) from ever appearing.
   *
   * Falls back to a real `type="password"` when the browser lacks
   * `-webkit-text-security` (e.g. Firefox), so the value is never rendered as
   * plaintext.
   */
  preventBrowserSave?: boolean
};

// Chromium & Safari support `-webkit-text-security`; Firefox does not.
const CAN_MASK_WITH_CSS = typeof CSS !== 'undefined' &&
  !!CSS.supports?.('-webkit-text-security', 'disc');

export class PasswordInputHelpers {
  public passwordVisible = false;
  public toggleVisible: HTMLElement;
  public onVisibilityClickAdditional: () => void;

  private maskWithCss: boolean;

  constructor(public container: HTMLElement, public input: HTMLInputElement, preventBrowserSave?: boolean) {
    this.maskWithCss = !!preventBrowserSave && CAN_MASK_WITH_CSS;

    input.setAttribute('required', '');
    input.name = 'notsearch_password';

    if(this.maskWithCss) {
      // Stay `type="text"` so Chrome never treats this as a password field.
      input.classList.add('password-masked');
      input.autocomplete = 'off';
    } else {
      input.type = 'password';

      // * https://stackoverflow.com/a/35949954/6758968
      const stealthy = document.createElement('input');
      stealthy.classList.add('stealthy');
      stealthy.tabIndex = -1;
      stealthy.type = 'password';
      input.parentElement.prepend(stealthy);
      input.parentElement.insertBefore(stealthy.cloneNode(), input.nextSibling);
    }

    /* if(IS_SAFARI && !IS_MOBILE_SAFARI) {
      input.setAttribute('readonly', '');
      input.addEventListener('focus', () => {
        input.removeAttribute('readonly');
      }, {once: true});
    } */

    const toggleVisible = this.toggleVisible = document.createElement('span');
    toggleVisible.classList.add('toggle-visible');
    toggleVisible.append(Icon('eye1'));

    container.classList.add('input-field-password');
    container.append(toggleVisible);

    toggleVisible.addEventListener('click', this.onVisibilityClick);
    toggleVisible.addEventListener('touchend', this.onVisibilityClick);
  }

  public onVisibilityClick = (e: Event) => {
    cancelEvent(e);
    this.passwordVisible = !this.passwordVisible;

    this.toggleVisible.replaceChildren(Icon(this.passwordVisible ? 'eye2' : 'eye1'));
    if(this.maskWithCss) {
      this.input.classList.toggle('password-masked', !this.passwordVisible);
    } else {
      (this.input as HTMLInputElement).type = this.passwordVisible ? 'text' : 'password';
    }
    this.onVisibilityClickAdditional?.();
  };
}

export default class PasswordInputField extends InputField {
  public helpers: PasswordInputHelpers;

  constructor(options: PasswordInputFieldOptions = {}) {
    const {preventBrowserSave, ...inputFieldOptions} = options;

    super({
      plainText: true,
      allowStartingSpace: true,
      ...inputFieldOptions
    });

    this.helpers = new PasswordInputHelpers(this.container, this.input as HTMLInputElement, preventBrowserSave);
  }
}
