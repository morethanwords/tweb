import {JSX, splitProps} from 'solid-js';
import A11yButton from '@components/a11yButton';

export type MediaEditorLargeButtonProps = JSX.HTMLAttributes<HTMLElement> & {
  active?: boolean;
  disabled?: boolean;
};

export default function LargeButton(inProps: MediaEditorLargeButtonProps) {
  const [props, rest] = splitProps(inProps, ['active', 'disabled', 'class', 'classList']);
  return (
    <A11yButton
      {...rest}
      ripple
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
