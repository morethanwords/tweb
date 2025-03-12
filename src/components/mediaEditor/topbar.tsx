import {onCleanup, onMount} from 'solid-js';

import {addShortcutListener} from '../../helpers/shortcutListener';
import {i18n} from '../../lib/langPack';
import {ButtonIconTsx} from '../buttonIconTsx';
import ripple from '../ripple';

import {useMediaEditorContext} from './context';

export default function Topbar(props: {onClose: () => void; onFinish: () => void}) {
  let doneButton: HTMLDivElement;

  const {hasModifications, mediaState} = useMediaEditorContext();

  function onUndo() {
    // if(!history().length) return;
    // const item = history()[history().length - 1];
    // setRedoHistory((prev) => [...prev, item]);
    // setHistory((prev) => {
    //   prev.pop();
    //   return [...prev];
    // });
    // item.undo();
  }

  function onRedo() {
    // if(!redoHistory().length) return;
    // const item = redoHistory()[redoHistory().length - 1];
    // setHistory((prev) => [...prev, item]);
    // setRedoHistory((prev) => {
    //   prev.pop();
    //   return [...prev];
    // });
    // item.redo();
  }

  // const canFinish = useCanFinish();

  onMount(() => {
    ripple(doneButton);

    const removeListeners = addShortcutListener(['ctrl+z', 'ctrl+shift+z', 'ctrl+y'], (combo) => {
      // if(combo === 'ctrl+z') {
      //   onUndo();
      // } else {
      //   onRedo();
      // }
    });

    onCleanup(() => removeListeners());
  });

  return (
    <div class="media-editor__topbar">
      <ButtonIconTsx icon="cross" onClick={props.onClose} />
      <div class="media-editor__topbar-title">{i18n('Edit')}</div>
      <div class="media-editor__topbar-history-controls">
        <ButtonIconTsx disabled={!mediaState.history.length} onClick={onUndo} icon="undo" />
        <ButtonIconTsx disabled={!mediaState.redoHistory.length} onClick={onRedo} icon="redo" />
      </div>
      <div
        ref={doneButton}
        class="media-editor__topbar-done"
        classList={{
          'media-editor__topbar-done--disabled': !hasModifications()
        }}
        onClick={() => {
          if(hasModifications()) props.onFinish();
        }}
      >
        {i18n('Done')}
      </div>
    </div>
  );
}
