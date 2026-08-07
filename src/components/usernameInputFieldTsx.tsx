import {createEffect, on, splitProps} from 'solid-js';
import type {AppManagers} from '@lib/managers';
import {
  UsernameInputField
} from '@components/usernameInputField';

export default function UsernameInputFieldTsx(props: {
  managers: AppManagers,
  instanceRef?: (field: UsernameInputField) => void,
  originalValue: string
} & UsernameInputField['options']) {
  const [, options] = splitProps(
    props,
    ['managers', 'instanceRef', 'originalValue']
  );
  const field = new UsernameInputField(options, props.managers);
  field.setOriginalValue(props.originalValue, true);
  props.instanceRef?.(field);

  createEffect(on(() => props.originalValue, (value) => {
    if(value !== field.originalValue) {
      field.setOriginalValue(value, true);
    }
  }));

  return field.container;
}
