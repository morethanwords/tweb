import {createUniqueId, JSX} from 'solid-js';
import {i18n, LangPackKey} from '@lib/langPack';
import classNames from '@helpers/string/classNames';
import Icon from '@components/icon';
import ripple from '@components/ripple';

export function setCallButtonLabel(button: HTMLButtonElement, key: LangPackKey) {
  const label = i18n(key).textContent;
  button.setAttribute('aria-label', label);
  button.title = label;
}

/**
 * A round control of a call panel with its name under it — the row at the bottom of a private
 * call and of a video chat (tdesktop's `CallButton`, macOS's `CallControl`). `class` is the
 * panel's prefix: 'call' gives `.call-button`, 'group-call' `.group-call-button`, and `color` its
 * `-red` / `-green` fill. The name under the button is its accessible name as well.
 */
export default function CallButton(props: {
  class: string,
  label: LangPackKey,
  icon?: Icon,
  color?: 'red' | 'green',
  // filled white, the way a private call shows what is on
  active?: boolean,
  // `aria-pressed`, for a toggle whose name stays the same
  pressed?: boolean,
  disabled?: boolean,
  // an action of the button's is still running: it cannot be pressed again meanwhile
  busy?: boolean,
  noRipple?: boolean,
  buttonClass?: string,
  containerClass?: string,
  onClick: () => void,
  ref?: (button: HTMLButtonElement) => void,
  children?: JSX.Element
}) {
  const labelId = createUniqueId();
  const isDisabled = () => !!(props.disabled || props.busy);
  const buttonClassName = props.class + '-button';
  // read once, the state goes through classList: a reactive `class` would wipe the one ripple adds
  const buttonClassNames = classNames(
    buttonClassName,
    'call-button',
    'rp-overflow',
    props.color && buttonClassName + '-' + props.color,
    props.buttonClass
  );

  let button: HTMLButtonElement;
  const element = (
    <div class={classNames(
      'call-button-container',
      buttonClassName + '-container',
      props.containerClass,
      isDisabled() && 'btn-disabled'
    )}>
      <button
        ref={(element) => {
          button = element;
          props.ref?.(element);
        }}
        type="button"
        class={buttonClassNames}
        classList={{active: !!props.active}}
        disabled={isDisabled()}
        aria-busy={props.busy ? 'true' : undefined}
        aria-pressed={props.pressed === undefined ? undefined : (props.pressed ? 'true' : 'false')}
        aria-labelledby={labelId}
        // A native click: a keyboard-generated activation emits no `mousedown`,
        // which attachClickEvent listens for on touch-capable devices.
        onClick={() => props.onClick()}
      >
        {props.icon && Icon(props.icon)}
        {props.children}
      </button>
      <span id={labelId} class={classNames('call-button-text', buttonClassName + '-text')}>
        {i18n(props.label)}
      </span>
    </div>
  );

  // once the element has its classes, or they would replace the one ripple adds
  ripple(button, () => !props.noRipple);
  return element;
}
