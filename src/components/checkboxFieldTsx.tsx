import {createEffect, createSignal, JSX, on, Signal, untrack} from 'solid-js';
import {subscribeOn} from '@helpers/solid/subscribeOn';
import CheckboxField from '@components/checkboxField';
import {LangPackKey} from '@lib/langPack';
import {attachClassName} from '@helpers/solid/classname';

export default function CheckboxFieldTsx(props: {
  class?: string,
  text?: LangPackKey
  signal?: Signal<boolean>,
  checked?: boolean,
  toggle?: boolean,
  round?: boolean,
  onChange?: (checked: boolean) => void,
  stateKey?: string
}): JSX.Element {
  const [checked, setChecked] = props.signal ?? createSignal(props.checked ?? false);

  const checkboxField = new CheckboxField({
    text: props.text,
    toggle: props.toggle,
    round: props.round,
    stateKey: props.stateKey,
    checked: checked()
  });

  createEffect(on(checked, () => {
    checkboxField.setValueSilently(checked());
  }, {defer: true}));

  createEffect(on(() => props.checked, (value) => {
    if(value === undefined) {
      return;
    }

    setChecked(value);
  }));

  subscribeOn(checkboxField.input)('change', () => {
    setChecked(checkboxField.input.checked);
    untrack(() => props.onChange(checked()));
  });

  attachClassName(checkboxField.label, () => props.class);

  return checkboxField.label;
}
