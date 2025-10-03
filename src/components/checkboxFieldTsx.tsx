import {createEffect, createSignal, JSX, on, Signal, untrack} from 'solid-js';
import {subscribeOn} from '../helpers/solid/subscribeOn';
import CheckboxField from './checkboxField';
import {LangPackKey} from '../lib/langPack';
import {attachClassName} from '../helpers/solid/classname';

export default function CheckboxFieldTsx(props: {
  class?: string,
  text?: LangPackKey
  signal?: Signal<boolean>,
  checked?: boolean,
  toggle?: boolean,
  round?: boolean,
  onChange?: (checked: boolean) => void
}): JSX.Element {
  const [checked, setChecked] = props.signal ?? createSignal(props.checked);

  const checkboxField = new CheckboxField({
    text: props.text,
    toggle: props.toggle,
    round: props.round
  });

  let first = true;
  createEffect(() => {
    checkboxField.setValueSilently(checked());

    if(!first && props.onChange) {
      untrack(() => props.onChange(checked()));
    }
    first = false;
  });

  createEffect(on(() => props.checked, (value) => {
    setChecked(value);
  }));

  subscribeOn(checkboxField.input)('change', () => {
    setChecked(checkboxField.input.checked);
  });

  attachClassName(checkboxField.label, () => props.class);

  return checkboxField.label;
}
