import {JSX, onMount} from 'solid-js';

import ripple from '../ripple';

export type MediaEditorLargeButtonProps = JSX.HTMLAttributes<HTMLDivElement> & {
  active?: boolean;
};

export default function LargeButton(props: MediaEditorLargeButtonProps) {
  let element: HTMLDivElement;

  onMount(() => {
    ripple(element);
  });

  return (
    <div
      {...props}
      ref={element}
      class="media-editor__large-button"
      classList={{
        'media-editor__large-button--active': props.active,
        [props.class]: !!props.class
      }}
    />
  );
}
