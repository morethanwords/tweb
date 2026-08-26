import simulateEvent from '@helpers/dom/dispatchEvent';
import getDeepProperty from '@helpers/object/getDeepProperty';
import apiManagerProxy from '@lib/apiManagerProxy';
import rootScope from '@lib/rootScope';
import Icon from '@components/icon';
import {RADIO_FIELD_RIGHT_CLASS} from '@components/rowFieldClasses';

/**
 * The radio control only. Any visible label belongs to the hosting Row.Title.
 */
export default class RadioField {
  public input: HTMLInputElement;
  public container: HTMLSpanElement;
  public main: HTMLElement;
  public lockIcon: HTMLElement;

  constructor(options: {
    name: string,
    value?: string,
    valueForState?: any,
    stateKey?: string,
    alignRight?: boolean
  }) {
    const container = this.container = document.createElement('span');
    container.classList.add('radio-field');

    if(options.alignRight) {
      container.classList.add(RADIO_FIELD_RIGHT_CLASS);
    }

    const input = this.input = document.createElement('input');
    input.type = 'radio';
    input.name = 'input-radio-' + options.name;

    if(options.value !== undefined) {
      input.value = options.value;

      const getValueForState = () => 'valueForState' in options ? options.valueForState : options.value;

      if(options.stateKey) {
        apiManagerProxy.getState().then((state) => {
          input.checked = getDeepProperty(state, options.stateKey) === getValueForState();
        });

        input.addEventListener('change', () => {
          rootScope.managers.appStateManager.setByKey(options.stateKey, getValueForState());
        });
      }
    }

    const main = this.main = document.createElement('div');
    main.classList.add('radio-field-main');

    container.append(input, main);
  }

  get checked() {
    return this.input.checked;
  }

  set checked(checked: boolean) {
    this.setValueSilently(checked);
    simulateEvent(this.input, 'change');
  }

  get locked() {
    return !!this.lockIcon;
  }

  set locked(locked: boolean) {
    if(!locked) {
      this.lockIcon?.remove();
      this.lockIcon = undefined;
      this.main.classList.remove('is-locked');
      return;
    }

    if(this.lockIcon) {
      return;
    }

    this.main.prepend(this.lockIcon = Icon('premium_lock', 'radio-field-lock'));
    this.main.classList.add('is-locked');
  }

  public setValueSilently(checked: boolean) {
    this.input.checked = checked;
  }
}
