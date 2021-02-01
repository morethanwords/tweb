import appStateManager from "../lib/appManagers/appStateManager";
import { getDeepProperty } from "../helpers/object";

const CheckboxField = (options: {
  text?: string, 
  name?: string, 
  round?: boolean, 
  stateKey?: string,
  disabled?: boolean
} = {}) => {
  const label = document.createElement('label');
  label.classList.add('checkbox-field');

  if(options.round) {
    label.classList.add('checkbox-field-round');
  }

  if(options.disabled) {
    label.classList.add('checkbox-disabled');
  }

  const input = document.createElement('input');
  input.type = 'checkbox';
  if(options.name) {
    input.id = 'input-' + name;
  }

  if(options.stateKey) {
    appStateManager.getState().then(state => {
      input.checked = getDeepProperty(state, options.stateKey);
    });

    input.addEventListener('change', () => {
      appStateManager.setByKey(options.stateKey, input.checked);
    });
  }

  let span: HTMLSpanElement;
  if(options.text) {
    span = document.createElement('span');
    span.classList.add('checkbox-caption');

    if(options.text) {
      span.innerText = options.text;
    }
  } else {
    label.classList.add('checkbox-without-caption');
  }

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

  label.append(input, box);

  if(span) {
    label.append(span);
  }

  return {label, input, span};
};

export default CheckboxField;