import {createEffect, mergeProps, on, splitProps} from 'solid-js';

import {LangPackKey} from '../lib/langPack';

import InputField, {InputFieldOptions, InputState} from './inputField';

export interface InputFieldTsxProps extends InputFieldOptions {
  InputFieldClass?: typeof InputField

  class?: string
  value?: string
  onRawInput?: (value: string) => void
  errorLabel?: LangPackKey
}

export const InputFieldTsx = (inProps: InputFieldTsxProps) => {
  const props = mergeProps({InputFieldClass: InputField}, inProps);

  const [, rest] = splitProps(props, ['class', 'value', 'InputFieldClass', 'errorLabel'])
  const obj = new props.InputFieldClass(rest)

  createEffect(on(
    () => props.class,
    (value, prev) => {
      obj.container.classList.remove(prev)
      obj.container.classList.add(value)
    }
  ))

  createEffect(on(
    () => props.errorLabel,
    (value, prev) => {
      if(!value && !prev) return // Prevent setting error first render

      if(value) obj.setError(value)
      else obj.setState(InputState.Neutral)
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
