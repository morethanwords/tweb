import {createEffect, createSignal, onCleanup, onMount} from 'solid-js';
import {addShortcutListener} from '@helpers/shortcutListener';
import {useMediaEditorContext} from '@components/mediaEditor/context';
import isTargetAnInput from '@helpers/dom/isTargetAnInput';
import Modes from '@config/modes';
import appNavigationController, {NavigationItem} from '@components/appNavigationController';
import createLayerObjectActions from '@components/mediaEditor/layerObjectActions';
import isKeyboardControl from '@helpers/dom/isKeyboardControl';

type DesktopCommands = {
  enabled: () => boolean;
  available: () => boolean;
  onDone: () => void;
};

/** The session, not either responsive toolbar, owns history and object shortcuts. */
export default function useHistoryShortcuts(desktop?: DesktopCommands) {
  const context = useMediaEditorContext();
  const {actions, editorState} = context;
  const objectActions = createLayerObjectActions(context);
  const [helpOpen, setHelpOpen] = createSignal(false);
  let helpNavigation: NavigationItem;
  const closeHelp = () => { setHelpOpen(false); };
  const toggleHelp = () => {
    if(!Modes.a11y) return;
    if(!helpOpen() && (!desktop?.enabled() || !desktop.available())) return;
    if(!helpOpen() && (!editorState.isReady || editorState.isMoving || editorState.editingTextLayer !== undefined)) return;
    setHelpOpen(!helpOpen());
  };
  createEffect(() => {
    if(!Modes.a11y || !desktop?.enabled()) closeHelp();
  });
  createEffect(() => {
    if(!Modes.a11y || !helpOpen()) return;
    const item: NavigationItem = {
      type: 'menu', noHistory: true, noBlurOnPop: true,
      onPop: closeHelp
    };
    helpNavigation = item;
    appNavigationController.pushItem(item);
    onCleanup(() => {
      helpNavigation = undefined;
      appNavigationController.removeItem(item);
    });
  });
  onMount(() => {
    let navigationItem: NavigationItem;
    let disposed = false;
    // The editor registers its popup during mount; take it after the mount tree settles.
    queueMicrotask(() => {
      if(!disposed) navigationItem = appNavigationController.findItemByType('popup')?.item;
    });
    const removeListener = addShortcutListener(['Ctrl+KeyZ', 'Ctrl+Shift+KeyZ', 'Ctrl+KeyY'], (combo, event) => {
      if(helpOpen() || event.defaultPrevented || isTargetAnInput(event.target as HTMLElement)) return;
      event.preventDefault();
      if(combo === 'Ctrl+KeyZ') actions.undo();
      else actions.redo();
    }, false);
    onCleanup(removeListener);
    const removeObjectListener = addShortcutListener(['Ctrl+KeyD', 'Delete', 'Backspace', 'Enter', 'Return', '?'], (combo, event) => {
      const desktopCommand = combo === '?' || combo === 'Enter' || combo === 'Return';
      if(!Modes.a11y || event.defaultPrevented || event.isComposing || event.altKey || event.metaKey || (event.shiftKey && combo !== '?')) return;
      if(combo !== 'Ctrl+KeyD' && event.ctrlKey || desktopCommand && event.repeat) return;
      const target = event.target as HTMLElement;
      const overlay = editorState.resizeHandlesContainer?.closest<HTMLElement>('.media-editor__overlay');
      // Never consume the app's, a text field's, or a menu/modal's shortcuts.
      const navigation = appNavigationController.findItem(item => item === navigationItem);
      const help = combo === '?' && helpOpen() && appNavigationController.findItem(item => item === helpNavigation);
      if((help || navigation)?.index !== appNavigationController.getNextIndex() - 1) return;
      if(!overlay?.contains(target) || overlay.closest('[inert]') || overlay.getAttribute('aria-hidden') === 'true') return;
      if(target.closest('[inert], [hidden], [aria-hidden="true"]')) return;
      if(isTargetAnInput(target) || target.closest('input, textarea, select, [contenteditable="true"], [role="menu"]')) return;
      if(target.closest('[role="dialog"]') !== overlay && !(help && target.closest('[data-editor-shortcut-help]'))) return;
      if(editorState.editingTextLayer !== undefined || !editorState.isReady || editorState.isMoving) return;
      if(desktopCommand) {
        if(!desktop?.enabled() || !desktop.available()) return;
        // A focused button/link owns its native Enter activation. Do not submit twice.
        if(combo !== '?' && (helpOpen() || isKeyboardControl(target))) return;
        event.preventDefault();
        if(combo === '?') toggleHelp();
        else desktop.onDone();
        return;
      }
      const handled = combo === 'Ctrl+KeyD' ? objectActions.duplicate() : objectActions.delete();
      if(handled) {
        event.preventDefault();
        // Deletion removes its focused control; duplication hides the old actions
        // button. Keep focus in this editor, never on the document body.
        if(!overlay.contains(target) || target.classList.contains('media-editor__layer-actions')) overlay.focus({preventScroll: true});
      }
    }, false);
    onCleanup(() => {
      disposed = true;
      removeObjectListener();
    });
  });
  return {helpOpen, toggleHelp, closeHelp};
}
