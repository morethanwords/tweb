import appStateManager from "../lib/appManagers/appStateManager";
import { getDeepProperty } from "../helpers/object";

const CheckboxField = (text: string, name: string, round = false, stateKey?: string) => {
  const label = document.createElement('label');
  label.classList.add(round ? 'checkbox-field-round' : 'checkbox-field');

  const input = document.createElement('input');
  input.type = 'checkbox';
  input.id = 'input-' + name;

  if(stateKey) {
    appStateManager.getState().then(state => {
      input.checked = getDeepProperty(state, stateKey);
    });

    input.addEventListener('change', () => {
      appStateManager.setByKey(stateKey, input.checked);
    });
  }

  const span = document.createElement('span');
  span.classList.add('checkbox-caption');
  if(round) span.classList.add('tgico-check');
  if(text) {
    span.innerText = text;
  }

  label.append(input, span);

  return {label, input, span};
};

export default CheckboxField;