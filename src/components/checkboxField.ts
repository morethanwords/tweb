import type ListenerSetter from '@helpers/listenerSetter';
import Icon from '@components/icon';
import getDeepProperty from '@helpers/object/getDeepProperty';
import rootScope from '@lib/rootScope';
import apiManagerProxy from '@lib/apiManagerProxy';
import simulateEvent from '@helpers/dom/dispatchEvent';

export type CheckboxFieldColor = 'white' | 'secondary';

/**
 * A checkbox is only ever the control — it carries no label of its own. Anything the user reads
 * (caption, subtitle, icon) belongs to the `Row` that hosts it: `Row.Title` + `Row.CheckboxField`
 * in `rowTsx`, or the corresponding options in `rowTsxController` for imperative callers.
 */
export type CheckboxFieldOptions = {
  name?: string,
  round?: boolean,
  color?: CheckboxFieldColor,
  toggle?: boolean,
  stateKey?: string,
  stateValues?: any[],
  stateValueReverse?: boolean,
  disabled?: boolean,
  checked?: boolean,
  toggleLockIcon?: Icon,
  restriction?: boolean,
  listenerSetter?: ListenerSetter,
  asRadio?: boolean
};
export default class CheckboxField {
  public input: HTMLInputElement;
  public label: HTMLSpanElement;
  public toggleCircle: HTMLElement;
  public listenerSetter: ListenerSetter;

  constructor(options: CheckboxFieldOptions = {}) {
    const label = this.label = document.createElement('span');
    label.classList.add('checkbox-field');

    if(options.restriction && !options.toggle) {
      label.classList.add('checkbox-field-restriction');
    }

    if(options.round) {
      label.classList.add('checkbox-field-round');
    }

    if(options.color && options.color !== 'secondary') {
      label.classList.add('checkbox-color-' + options.color);
    }

    if(options.disabled) {
      this.toggleDisability(true);
    }

    this.listenerSetter = options.listenerSetter;

    const input = this.input = document.createElement('input');
    input.classList.add('checkbox-field-input');
    input.type = options.asRadio ? 'radio' : 'checkbox';
    if(options.name) {
      input[options.asRadio ? 'name' : 'id'] = 'input-' + options.name;
    }

    if(options.checked) {
      input.checked = true;
    }

    if(options.stateKey) {
      let loaded = options.checked !== undefined;
      const onChange = () => {
        if(!loaded) {
          return;
        }

        let value: any;
        if(options.stateValues) {
          value = options.stateValues[input.checked ? 1 : 0];
        } else {
          value = input.checked;

          if(options.stateValueReverse) {
            value = !value;
          }
        }

        rootScope.managers.appStateManager.setByKey(options.stateKey, value);
      };

      !loaded && apiManagerProxy.getState().then((state) => {
        loaded = true;
        const stateValue = getDeepProperty(state, options.stateKey);
        let checked: boolean;
        if(options.stateValues) {
          checked = options.stateValues.indexOf(stateValue) === 1;
        } else {
          checked = stateValue;

          if(options.stateValueReverse) {
            checked = !checked;
          }
        }

        this.setValueSilently(checked);
      });

      if(options.listenerSetter) options.listenerSetter.add(input)('change', onChange);
      else input.addEventListener('change', onChange);
    }

    label.append(input);

    if(options.toggle) {
      label.classList.add('checkbox-field-toggle');

      if(options.restriction) {
        label.classList.add('checkbox-field-toggle-restriction');
      }

      const toggle = document.createElement('div');
      toggle.classList.add('checkbox-toggle');
      const circle = this.toggleCircle = document.createElement('div');
      circle.classList.add('checkbox-toggle-circle');
      toggle.append(circle);
      label.append(toggle);

      this.setToggleLockIcon(options.toggleLockIcon);
    } else {
      const box = document.createElement('div');
      box.classList.add('checkbox-box');

      const checkSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      checkSvg.classList.add('checkbox-box-check');
      checkSvg.setAttributeNS(null, 'viewBox', '0 0 24 24');
      const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
      use.setAttributeNS(null, 'href', '#check');
      use.setAttributeNS(null, 'x', '-1');
      checkSvg.append(use);

      const bg = document.createElement('div');
      bg.classList.add('checkbox-box-background');

      const border = document.createElement('div');
      border.classList.add('checkbox-box-border');

      box.append(border, bg, checkSvg);

      label.append(box);
    }
  }

  get checked() {
    return this.input.checked;
  }

  set checked(checked: boolean) {
    /* if(this.checked === checked) {
      return;
    } */

    this.setValueSilently(checked);
    simulateEvent(this.input, 'change');
  }

  /** Puts a lock inside the toggle's circle, or clears it when no icon is given. Toggle-only. */
  public setToggleLockIcon(icon?: Icon) {
    const circle = this.toggleCircle;
    if(!circle) {
      return;
    }

    circle.classList.toggle('with-lock', !!icon);
    circle.replaceChildren(...(icon ? [Icon(icon)] : []));
  }

  public setValueSilently(checked: boolean) {
    this.input.checked = checked;
  }

  public isDisabled() {
    return this.label.classList.contains('checkbox-disabled');
  }

  public toggleDisability(disable: boolean) {
    this.label.classList.toggle('checkbox-disabled', disable);
    this.input.disabled = disable;
    return () => this.toggleDisability(!disable);
  }
}
