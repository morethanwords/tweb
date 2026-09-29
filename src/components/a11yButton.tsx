import {JSX, splitProps} from 'solid-js';
import {Dynamic} from 'solid-js/web';
import RippleElement from '@components/rippleElement';
import Modes from '@config/modes';

/**
 * A control that is a native `<button>` with the a11y layer (`?a11y=1`) and, without it, the element
 * it was before the layer (`as`): a native button brings the browser's own box, takes the focus on
 * a click and answers Enter and Space. `disabled` counts only with the layer too, as a div ignores
 * it; `ripple` draws the control through RippleElement.
 */
export default function A11yButton(props: JSX.HTMLAttributes<HTMLElement> & {
  as?: 'div' | 'span' | 'a',
  disabled?: boolean,
  ripple?: boolean
}) {
  const [local, rest] = splitProps(props, ['as', 'disabled', 'ripple']);
  const component = Modes.a11y ? 'button' : local.as || 'div';
  const type = Modes.a11y ? 'button' : undefined;
  return local.ripple ? (
    <RippleElement {...rest} component={component} type={type} disabled={Modes.a11y ? local.disabled : undefined} />
  ) : (
    <Dynamic {...rest} component={component} type={type} disabled={Modes.a11y ? local.disabled : undefined} />
  );
}
