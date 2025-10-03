import {Component, Show} from 'solid-js';
import {IconTsx} from '../../../../iconTsx';
import ripple from '../../../../ripple';
import AppearZoomTransition from './appearZoomTransition';
ripple; // keep


const SaveButton: Component<{
  hasChanges: boolean;
  onClick: () => void;
}> = (props) => {
  return (
    <AppearZoomTransition>
      <Show when={props.hasChanges}>
        <button
          use:ripple
          class="btn-icon blue"
          onClick={props.onClick}
        >
          <IconTsx icon="check" />
        </button>
      </Show>
    </AppearZoomTransition>
  )
};

export default SaveButton;
