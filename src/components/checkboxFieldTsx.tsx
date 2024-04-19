import {createEffect, createSignal, JSX, Signal, untrack} from 'solid-js';
import {subscribeOn} from '../helpers/solid/subscribeOn';
import CheckboxField from './checkboxField';

export default function CheckboxFieldTsx(props: {
  signal?: Signal<boolean>,
  checked?: boolean,
  toggle?: boolean,
  onChange?: (checked: boolean) => void
}): JSX.Element {
  const [checked, setChecked] = props.signal ?? createSignal(props.checked);

  const checkboxField = new CheckboxField({
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
