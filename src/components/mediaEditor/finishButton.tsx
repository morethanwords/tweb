import {onMount} from 'solid-js';

import I18n from '@lib/langPack';
import ripple from '@components/ripple';

import {useMediaEditorContext} from '@components/mediaEditor/context';
import A11yButton from '@components/a11yButton';


export default function FinishButton(props: {onClick: () => void}) {
  let container: HTMLElement;
  const {canFinish} = useMediaEditorContext();

  onMount(() => {
    ripple(container);
  });

  return (
    <A11yButton
      ref={(el: HTMLElement) => container = el}
      onClick={props.onClick}
      disabled={!canFinish()}
      aria-label={I18n.format('Done', true)}
      class="media-editor__finish-button"
      classList={{
        'media-editor__finish-button--hidden': !canFinish()
      }}
    >
      <svg aria-hidden="true" width="18" height="16" viewBox="0 0 18 16" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M2 9L6.5 14L16 2" stroke="white" stroke-width="2.66" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
    </A11yButton>
  );
}
