import {createEffect, on, splitProps} from 'solid-js'
import ButtonMenuToggle from './buttonMenuToggle'

export type ButtonMenuToggleProps = Parameters<typeof ButtonMenuToggle>[0] & {
  class?: string
}

export const ButtonMenuToggleTsx = (props: ButtonMenuToggleProps) => {
  const [, rest] = splitProps(props, ['class'])
  const res = ButtonMenuToggle(rest)

  createEffect(on(
    () => props.class,
    (value, prev) => {
      res.classList.remove(prev)
      res.classList.add(value)
    }
  ))

  return res
}
