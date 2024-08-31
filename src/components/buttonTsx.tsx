import {JSX} from 'solid-js';
import {Dynamic} from 'solid-js/web';
import {FormatterArguments, i18n, LangPackKey} from '../lib/langPack';
import {IconTsx} from './iconTsx';

export default function Button(props: Partial<{
  asLink: boolean,
  asDiv: boolean,
  class: string,
  disabled: boolean,
  children: JSX.Element,
  icon: Icon,
  onClick: (e: MouseEvent) => void,
  text: LangPackKey,
  textArgs: FormatterArguments
}> = {}): JSX.Element {
  return (
    <Dynamic
      component={props.asLink ? 'a' : (props.asDiv ? 'div' : 'button')}
      class={props.class}
      disabled={props.disabled}
      onClick={props.onClick}
    >
      {props.icon && <IconTsx icon={props.icon} class="button-icon" />}
      {props.text ? i18n(props.text, props.textArgs) : props.children}
    </Dynamic>
  );
}
