import {IconTsx} from '@components/iconTsx';
import ripple from '@components/ripple';
import AppearZoomTransition from '@components/sidebarLeft/tabs/privacy/messages/appearZoomTransition';
import {keepMe} from '@helpers/keepMe';
import {createThrottled} from '@helpers/solid/createScheduled';
import {Component, Show} from 'solid-js';

keepMe(ripple);


const SaveButton: Component<{
  hasChanges: boolean;
  onClick: () => void;
}> = (props) => {
  // Note: the header is jerking if updating the hasChanges too quickly
  const hasChanges = createThrottled(() => props.hasChanges, 200, true);

  return (
    <AppearZoomTransition>
      <Show when={hasChanges()}>
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
