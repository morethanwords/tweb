/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import ripple from "./ripple";
import { LangPackKey, _i18n } from "../lib/langPack";
import getDeepProperty from "../helpers/object/getDeepProperty";
import rootScope from "../lib/rootScope";
import apiManagerProxy from "../lib/mtproto/mtprotoworker";
import ListenerSetter from "../helpers/listenerSetter";

export type CheckboxFieldOptions = {
  text?: LangPackKey,
  textArgs?: any[],
  name?: string, 
  round?: boolean, 
  toggle?: boolean,
  stateKey?: string,
  stateValues?: any[],
  disabled?: boolean,
  checked?: boolean,
  restriction?: boolean,
  withRipple?: boolean,
  withHover?: boolean,
  listenerSetter?: ListenerSetter
};
export default class CheckboxField {
  public input: HTMLInputElement;
  public label: HTMLLabelElement;
  public span: HTMLSpanElement;

  constructor(options: CheckboxFieldOptions = {}) {
    const label = this.label = document.createElement('label');
    label.classList.add('checkbox-field');

    if(options.restriction) {
      label.classList.add('checkbox-field-restriction');
    }

    if(options.round) {
      label.classList.add('checkbox-field-round');
    }

    if(options.disabled) {
      this.toggleDisability(true);
    }

    const input = this.input = document.createElement('input');
    input.classList.add('checkbox-field-input');
    input.type = 'checkbox';
    if(options.name) {
      input.id = 'input-' + options.name;
    }

    if(options.checked) {
      input.checked = true;
    }

    if(options.stateKey) {
      let loaded = false;
      const onChange = () => {
        if(!loaded) {
          return;
        }

        let value: any;
        if(options.stateValues) {
          value = options.stateValues[input.checked ? 1 : 0];
        } else {
          value = input.checked;
        }

        rootScope.managers.appStateManager.setByKey(options.stateKey, value);
      };

      apiManagerProxy.getState().then((state) => {
        loaded = true;
        const stateValue = getDeepProperty(state, options.stateKey);
        let checked: boolean;
        if(options.stateValues) {
          checked = options.stateValues.indexOf(stateValue) === 1;
        } else {
          checked = stateValue;
        }

        this.setValueSilently(checked);
      });

      if(options.listenerSetter) options.listenerSetter.add(input)('change', onChange);
      else input.addEventListener('change', onChange);
    }

    let span: HTMLSpanElement;
    if(options.text) {
      span = this.span = document.createElement('span');
      span.classList.add('checkbox-caption');
      _i18n(span, options.text, options.textArgs);
    } else {
      label.classList.add('checkbox-without-caption');
    }

    label.append(input);

    if(options.toggle) {
      label.classList.add('checkbox-field-toggle');

      const toggle = document.createElement('div');
      toggle.classList.add('checkbox-toggle');
      label.append(toggle);
    } else {
      const box = document.createElement('div');
      box.classList.add('checkbox-box');
  
      const checkSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      checkSvg.classList.add('checkbox-box-check');
      checkSvg.setAttributeNS(null, 'viewBox', '0 0 24 24');
      const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
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

    if(span) {
      label.append(span);
    }

    if(options.withRipple) {
      label.classList.add('checkbox-ripple', 'hover-effect');
      ripple(label, undefined, undefined, true);
      //label.prepend(input);
    } else if(options.withHover) {
      label.classList.add('hover-effect');
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

    const event = new Event('change', {bubbles: true, cancelable: true});
    this.input.dispatchEvent(event);
  }

  public setValueSilently(checked: boolean) {
    this.input.checked = checked;
  }

  public toggleDisability(disable: boolean) {
    this.label.classList.toggle('checkbox-disabled', disable);
    return () => this.toggleDisability(!disable);
  }
}
