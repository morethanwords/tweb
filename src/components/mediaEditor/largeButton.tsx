import {JSX, splitProps} from 'solid-js';
import RippleElement from '@components/rippleElement';

export type MediaEditorLargeButtonProps = JSX.ButtonHTMLAttributes<HTMLButtonElement> & {
  active?: boolean;
  disabled?: boolean;
};

export default function LargeButton(inProps: MediaEditorLargeButtonProps) {
  const [props, rest] = splitProps(inProps, ['active', 'disabled', 'class', 'classList']);
  return (
    <RippleElement
      {...rest}
      component="button"
      type="button"
      disabled={props.disabled}
      aria-pressed={props.active}
      class="media-editor__large-button"
      classList={{
        'media-editor__large-button--active': props.active,
        'media-editor__large-button--disabled': props.disabled,
        [props.class]: !!props.class,
        ...props.classList
      }}
    />
  );
}
