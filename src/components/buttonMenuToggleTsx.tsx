import {splitProps} from 'solid-js'
import ButtonMenuToggle from './buttonMenuToggle'
import {attachClassName} from '../helpers/solid/classname'

export type ButtonMenuToggleProps = Parameters<typeof ButtonMenuToggle>[0] & {
  class?: string
}

export const ButtonMenuToggleTsx = (props: ButtonMenuToggleProps) => {
  const [, rest] = splitProps(props, ['class'])
  const res = ButtonMenuToggle(rest)

  attachClassName(res, () => props.class)

  return res
}
