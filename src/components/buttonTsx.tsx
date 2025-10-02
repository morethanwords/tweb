import {JSX, Ref} from 'solid-js';
import {FormatterArguments, i18n, LangPackKey} from '../lib/langPack';
import {IconTsx} from './iconTsx';
import classNames from '../helpers/string/classNames';
import RippleElement from './rippleElement';

const Button = (props: Partial<{
  ref: Ref<HTMLElement>,
  as: 'a' | 'div' | 'button',
  class: string,
  disabled: boolean,
  children: JSX.Element,
  icon: Icon,
  iconAfter: Icon,
  iconClass: string,
  onClick: (e: MouseEvent) => void,
  text: LangPackKey,
  textArgs: FormatterArguments,
  noRipple: boolean,
  rippleSquare: boolean,
  onlyMobile: boolean
  tabIndex: number,
}> = {}): JSX.Element => {
  return (
    <RippleElement
      ref={props.ref as Ref<any>}
      component={props.as || 'button'}
      class={classNames(
        props.class,
        props.onlyMobile && 'only-handhelds'
      )}
      disabled={props.disabled}
      onClick={props.onClick}
      noRipple={props.noRipple}
      rippleSquare={props.rippleSquare}
      tabIndex={props.tabIndex}
    >
      {props.icon && <IconTsx icon={props.icon} class={classNames('button-icon', props.iconClass)} />}
      {props.text ? i18n(props.text, props.textArgs) : props.children}
      {props.iconAfter && <IconTsx icon={props.iconAfter} class={classNames('button-icon', props.iconClass)} />}
    </RippleElement>
  );
};

Button.Corner = (props: Partial<{
  ref: Ref<HTMLElement>,
  children: JSX.Element,
  onClick: (e: MouseEvent) => void,
  class: string
}>) => {
  return (
    <Button {...props} class={classNames('btn-circle', 'btn-corner', 'z-depth-1', props.class)} tabIndex={-1} />
  );
};

Button.Icon = (props: Partial<{
  ref: Ref<HTMLElement>,
  children: JSX.Element,
  onClick: (e: MouseEvent) => void,
  class: string
}>) => {
  return (
    <Button {...props} class={classNames('btn-icon', props.class)} tabIndex={-1} />
  )
};

export default Button;
