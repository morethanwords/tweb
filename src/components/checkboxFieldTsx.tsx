import {createEffect, createSignal, JSX, Signal, untrack} from 'solid-js';
import {subscribeOn} from '../helpers/solid/subscribeOn';
import CheckboxField from './checkboxField';
import {LangPackKey} from '../lib/langPack';

export default function CheckboxFieldTsx(props: {
  text?: LangPackKey
  signal?: Signal<boolean>,
  checked?: boolean,
  toggle?: boolean,
  onChange?: (checked: boolean) => void
}): JSX.Element {
  const [checked, setChecked] = props.signal ?? createSignal(props.checked);

  const checkboxField = new CheckboxField({
    text: props.text,
    toggle: props.toggle
  });

  let first = true;
  createEffect(() => {
    checkboxField.setValueSilently(checked());

    if(!first && props.onChange) {
      untrack(() => props.onChange(checked()));
    }
    first = false;
  });

  subscribeOn(checkboxField.input)('change', () => {
    setChecked(checkboxField.input.checked);
  });

  return checkboxField.label;
}
