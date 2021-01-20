import appStateManager from "../lib/appManagers/appStateManager";
import { getDeepProperty } from "../helpers/object";

const CheckboxField = (text?: string, name?: string, round = false, stateKey?: string) => {
  const label = document.createElement('label');
  label.classList.add('checkbox-field');

  if(round) {
    label.classList.add('checkbox-field-round');
  }

  const input = document.createElement('input');
  input.type = 'checkbox';
  if(name) {
    input.id = 'input-' + name;
  }

  if(stateKey) {
    appStateManager.getState().then(state => {
      input.checked = getDeepProperty(state, stateKey);
    });

    input.addEventListener('change', () => {
      appStateManager.setByKey(stateKey, input.checked);
    });
  }

  let span: HTMLSpanElement;
  if(text) {
    span = document.createElement('span');
    span.classList.add('checkbox-caption');

    if(text) {
      span.innerText = text;
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