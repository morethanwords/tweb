import {createEffect, mergeProps, on, splitProps} from 'solid-js';

import {i18n, LangPackKey} from '../lib/langPack';
import {InstanceOf} from '../types';

import InputField, {InputFieldOptions, InputState} from './inputField';

export interface InputFieldTsxProps<T extends typeof InputField> extends InputFieldOptions {
  InputFieldClass?: T

  instanceRef?: (value: InstanceOf<T>) => void

  class?: string
  value?: string | Node
  onRawInput?: (value: string) => void
  errorLabel?: LangPackKey
  errorLabelOptions?: any[]
  disabled?: boolean
}

export const InputFieldTsx = <T extends typeof InputField>(inProps: InputFieldTsxProps<T>) => {
  const props = mergeProps({InputFieldClass: InputField}, inProps);

  const [, options] = splitProps(props, ['class', 'value', 'InputFieldClass', 'errorLabel', 'errorLabelOptions', 'disabled'])

  const obj = new props.InputFieldClass(options)
  props.instanceRef?.(obj as InstanceOf<T>)

  createEffect(on(
    () => props.class,
    (value, prev) => {
      prev && obj.container.classList.remove(prev)
      value && obj.container.classList.add(value)
    }
  ))

  createEffect(on(
    () => [props.errorLabel, props.errorLabelOptions] as const,
    ([error, options], prev) => {
      if(!error && !prev) return // Prevent setting error first render

      if(error) obj.setError(error, options)
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

  createEffect(on(
    () => [props.label, props.labelOptions] as const,
    ([value, options]) => {
      if(value !== obj.label?.textContent) {
        obj.label.replaceChildren(i18n(value, options))
      }
    }
  ))

  createEffect(on(
    () => props.disabled,
    (value) => {
      obj.input.toggleAttribute('disabled', !!value)
    }
  ))

  return obj.container
}
