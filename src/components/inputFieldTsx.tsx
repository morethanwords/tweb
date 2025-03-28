import {createEffect, mergeProps, on, splitProps} from 'solid-js';

import {LangPackKey} from '../lib/langPack';
import {InstanceOf} from '../types';

import InputField, {InputFieldOptions, InputState} from './inputField';

export interface InputFieldTsxProps<T extends typeof InputField> extends InputFieldOptions {
  InputFieldClass?: T

  instanceRef?: (value: InstanceOf<T>) => void

  class?: string
  value?: string
  onRawInput?: (value: string) => void
  errorLabel?: LangPackKey
}

export const InputFieldTsx = <T extends typeof InputField>(inProps: InputFieldTsxProps<T>) => {
  const props = mergeProps({InputFieldClass: InputField}, inProps);

  const [, options] = splitProps(props, ['class', 'value', 'InputFieldClass', 'errorLabel'])

  const obj = new props.InputFieldClass(options)
  props.instanceRef?.(obj as InstanceOf<T>)

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
      if(value !== obj.value && value !== undefined) {
        obj.value = value
      }
    }
  ))

  return obj.container
}
