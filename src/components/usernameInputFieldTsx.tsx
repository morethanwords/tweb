import {createEffect, on, splitProps} from 'solid-js';
import {attachClassName} from '@helpers/solid/classname';
import type {AppManagers} from '@lib/managers';
import {
  UsernameInputField
} from '@components/usernameInputField';

export default function UsernameInputFieldTsx(props: {
  managers: AppManagers,
  instanceRef?: (field: UsernameInputField) => void,
  originalValue: string,
  containerClass?: string
} & UsernameInputField['options']) {
  const [, options] = splitProps(
    props,
    ['managers', 'instanceRef', 'originalValue', 'containerClass']
  );
  const field = new UsernameInputField(options, props.managers);
  attachClassName(field.container, () => props.containerClass);
  field.setOriginalValue(props.originalValue, true);
  props.instanceRef?.(field);

  createEffect(on(() => props.originalValue, (value) => {
    if(value !== field.originalValue) {
      field.setOriginalValue(value, true);
    }
  }));

  return field.container;
}
