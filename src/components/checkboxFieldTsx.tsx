import {createEffect, createSignal, JSX, on, Signal, untrack} from 'solid-js';
import {subscribeOn} from '@helpers/solid/subscribeOn';
import CheckboxField, {CheckboxFieldOptions} from '@components/checkboxField';
import {attachClassName} from '@helpers/solid/classname';

/** The control only — put the label in a `Row.Title` next to `Row.CheckboxField` */
export default function CheckboxFieldTsx(props: Omit<CheckboxFieldOptions, 'toggleLockIcon'> & {
  class?: string,
  signal?: Signal<boolean>,
  /** Shows a lock inside the toggle's circle. Requires `toggle` */
  lockIcon?: Icon,
  onChange?: (checked: boolean) => void,
  ref?: (checkboxField: CheckboxField) => void
}): JSX.Element {
  const [checked, setChecked] = props.signal ?? createSignal(props.checked ?? false);

  const checkboxField = new CheckboxField({
    toggle: props.toggle,
    toggleLockIcon: props.lockIcon,
    round: props.round,
    color: props.color,
    name: props.name,
    stateValues: props.stateValues,
    stateValueReverse: props.stateValueReverse,
    restriction: props.restriction,
    listenerSetter: props.listenerSetter,
    asRadio: props.asRadio,
    stateKey: props.stateKey,
    ...(props.signal || props.checked !== undefined ? {checked: checked()} : {})
  });
  props.ref?.(checkboxField);

  createEffect(on(checked, () => {
    checkboxField.setValueSilently(checked());
  }, {defer: true}));

  createEffect(on(() => props.lockIcon, (icon) => {
    checkboxField.setToggleLockIcon(icon);
  }, {defer: true}));

  createEffect(on(() => props.checked, (value) => {
    if(value === undefined) {
      return;
    }

    setChecked(value);
  }));

  createEffect(() => {
    checkboxField.toggleDisability(!!props.disabled);
  });

  subscribeOn(checkboxField.input)('change', () => {
    setChecked(checkboxField.input.checked);
    untrack(() => props.onChange?.(checked()));
  });

  attachClassName(checkboxField.label, () => props.class);

  return checkboxField.label;
}
