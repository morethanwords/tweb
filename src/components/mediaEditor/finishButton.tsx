import {onMount} from 'solid-js';

import ripple from '../ripple';

import {useMediaEditorContext} from './context';


export default function FinishButton(props: {onClick: () => void}) {
  let container: HTMLDivElement;
  const {hasModifications} = useMediaEditorContext();

  onMount(() => {
    ripple(container);
  });

  return (
    <div
      ref={container}
      onClick={props.onClick}
      class="media-editor__finish-button"
      classList={{
        'media-editor__finish-button--hidden': !hasModifications()
      }}
    >
      <svg width="18" height="16" viewBox="0 0 18 16" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M2 9L6.5 14L16 2" stroke="white" stroke-width="2.66" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
    </div>
  );
}
