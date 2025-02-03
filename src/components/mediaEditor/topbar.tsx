import {onCleanup, onMount, useContext} from 'solid-js';

import {i18n} from '../../lib/langPack';
import {ButtonIconTsx} from '../buttonIconTsx';
import ripple from '../ripple';

import MediaEditorContext from './context';
import {useCanFinish} from './finishButton';
import {addShortcutListener} from './shortcutListener';

export default function Topbar(props: {onClose: () => void; onFinish: () => void}) {
  let doneButton: HTMLDivElement;

  const context = useContext(MediaEditorContext);
  const [history, setHistory] = context.history;
  const [redoHistory, setRedoHistory] = context.redoHistory;

  function onUndo() {
    if(!history().length) return;
    const item = history()[history().length - 1];
    setRedoHistory((prev) => [...prev, item]);
    setHistory((prev) => {
      prev.pop();
      return [...prev];
    });
    item.undo();
  }

  function onRedo() {
    if(!redoHistory().length) return;
    const item = redoHistory()[redoHistory().length - 1];
    setHistory((prev) => [...prev, item]);
    setRedoHistory((prev) => {
      prev.pop();
      return [...prev];
    });
    item.redo();
  }

  const canFinish = useCanFinish();

  onMount(() => {
    ripple(doneButton);

    const removeListeners = addShortcutListener(['ctrl+z', 'ctrl+shift+z', 'ctrl+y'], (combo) => {
      if(combo === 'ctrl+z') {
        onUndo();
      } else {
        onRedo();
      }
    });

    onCleanup(() => removeListeners());
  });

  return (
    <div class="media-editor__topbar">
      <ButtonIconTsx icon="cross" onClick={props.onClose} />
      <div class="media-editor__topbar-title">{i18n('Edit')}</div>
      <div class="media-editor__topbar-history-controls">
        <ButtonIconTsx disabled={!history().length} onClick={onUndo} icon="undo" />
        <ButtonIconTsx disabled={!redoHistory().length} onClick={onRedo} icon="redo" />
      </div>
      <div
        ref={doneButton}
        class="media-editor__topbar-done"
        classList={{
          'media-editor__topbar-done--disabled': !canFinish()
        }}
        onClick={() => {
          if(canFinish()) props.onFinish();
        }}
      >
        {i18n('Done')}
      </div>
    </div>
  );
}
