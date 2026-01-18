import {Component, Show} from 'solid-js';
import {keepMe} from '@helpers/keepMe';
import {IconTsx} from '@components/iconTsx';
import ripple from '@components/ripple';
import AppearZoomTransition from '@components/sidebarLeft/tabs/privacy/messages/appearZoomTransition';

keepMe(ripple);


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
