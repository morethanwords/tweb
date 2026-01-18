import {Accessor, createMemo, createSignal, JSX, Ref, Setter} from 'solid-js';
import {FormatterArguments, i18n, LangPackKey} from '@lib/langPack';
import {IconTsx} from '@components/iconTsx';
import classNames from '@helpers/string/classNames';
import RippleElement from '@components/rippleElement';

const Button = (props: Partial<{
  ref: Ref<HTMLElement>,
  as: 'a' | 'div' | 'button',
  class: string,
  disabled: boolean,
  primaryFilled: boolean,
  primary: boolean,
  primaryTransparent: boolean,
  large: boolean,
  children: JSX.Element,
  icon: Icon,
  iconAfter: Icon,
  iconClass: string,
  onClick: (e: MouseEvent) => any,
  text: LangPackKey,
  textArgs: FormatterArguments,
  noRipple: boolean,
  rippleSquare: boolean,
  onlyMobile: boolean
  tabIndex: number,
}> = {}): JSX.Element => {
  let disabled: Accessor<boolean>, setDisabled: Setter<boolean>;
  if(props.disabled !== undefined) {
    disabled = createMemo(() => props.disabled);
  } else {
    [disabled, setDisabled] = createSignal(false);
  }

  return (
    <RippleElement
      ref={props.ref as Ref<any>}
      component={props.as || 'button'}
      class={classNames(
        props.class,
        props.primaryFilled && 'btn-primary btn-color-primary',
        props.primary && 'btn btn-primary primary',
        props.primaryTransparent && 'btn-primary primary btn-transparent',
        props.large && 'btn-large',
        props.onlyMobile && 'only-handhelds'
      )}
      disabled={disabled()}
      onClick={props.onClick && setDisabled ? ((e: any) => {
        try {
          const result = props.onClick(e);
          if(result instanceof Promise) {
            setDisabled(true);
            result.finally(() => {
              setDisabled(false);
            });
          }
        } catch(err) {
          throw err;
        }
      }) : props.onClick}
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

Button.Icon = (props: {icon: Icon} & Partial<{
  ref: Ref<HTMLElement>,
  children: JSX.Element,
  onClick: (e: MouseEvent) => void,
  class: string
}>) => {
  return (
    <Button {...props} class={classNames('btn-icon', props.icon, props.class)} tabIndex={-1} />
  )
};

export default Button;
