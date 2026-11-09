import {IconTsx} from '@components/iconTsx';
import ripple from '@components/ripple';
import {PreloaderTsx} from '@components/putPreloader';
import AppearZoomTransition from '@components/sidebarLeft/tabs/privacy/messages/appearZoomTransition';
import {keepMe} from '@helpers/keepMe';
import {createThrottled} from '@helpers/solid/createScheduled';
import I18n from '@lib/langPack';
import {Component, Show} from 'solid-js';

keepMe(ripple);


const SaveButton: Component<{
  hasChanges: boolean;
  /** The save is in flight: a preloader takes the check's place in the button, which takes no clicks */
  saving?: boolean;
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
          aria-label={I18n.format('Save', true)}
          aria-busy={props.saving || undefined}
          aria-disabled={props.saving || undefined}
          onClick={() => !props.saving && props.onClick()}
        >
          <Show when={props.saving}>
            <PreloaderTsx />
          </Show>
          {/* stays, unseen, so the button keeps its size under the preloader */}
          <IconTsx icon="check" style={{visibility: props.saving ? 'hidden' : undefined}} />
        </button>
      </Show>
    </AppearZoomTransition>
  )
};

export default SaveButton;
