import {onMount} from 'solid-js';

import I18n, {i18n} from '@lib/langPack';
import {ButtonIconTsx} from '@components/buttonIconTsx';
import ripple from '@components/ripple';

import {useMediaEditorContext} from '@components/mediaEditor/context';
import A11yButton from '@components/a11yButton';

export default function Topbar(props: {onClose: () => void; onFinish: () => void}) {
  const {canFinish, mediaState, actions} = useMediaEditorContext();

  let doneButton: HTMLElement;


  onMount(() => {
    ripple(doneButton);
  });

  return (
    <div class="media-editor__topbar">
      <ButtonIconTsx icon="cross" onClick={props.onClose} aria-label={I18n.format('Close', true)} />
      <div class="media-editor__topbar-title">{i18n('Edit')}</div>
      <div class="media-editor__topbar-history-controls">
        <ButtonIconTsx disabled={!mediaState.history.length} onClick={() => actions.undo()} icon="undo" aria-label={I18n.format('Undo', true)} />
        <ButtonIconTsx disabled={!mediaState.redoHistory.length} onClick={() => actions.redo()} icon="redo" aria-label={I18n.format('KeyboardShortcuts.Action.Redo', true)} />
      </div>
      <A11yButton
        ref={(el: HTMLElement) => doneButton = el}
        class="media-editor__topbar-done"
        classList={{
          'media-editor__topbar-done--disabled': !canFinish()
        }}
        disabled={!canFinish()}
        aria-label={I18n.format('Done', true)}
        onClick={() => {
          if(canFinish()) props.onFinish();
        }}
      >
        {i18n('Done')}
      </A11yButton>
    </div>
  );
}
