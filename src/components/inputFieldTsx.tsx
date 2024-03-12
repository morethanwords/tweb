import {createEffect, on, splitProps} from 'solid-js';
import InputField, {InputFieldOptions} from './inputField';

export interface InputFieldTsxProps extends InputFieldOptions {
  class?: string
  value?: string
  onRawInput?: (value: string) => void
}

export const InputFieldTsx = (props: InputFieldTsxProps) => {
  const [, rest] = splitProps(props, ['class', 'value'])
  const obj = new InputField(rest)

  createEffect(on(
    () => props.class,
    (value, prev) => {
      obj.container.classList.remove(prev)
      obj.container.classList.add(value)
    }
  ))

  createEffect(on(
    () => props.value,
    (value) => {
      if(value !== obj.value) {
        obj.value = value
      }
    }
  ))

  return obj.container
}
