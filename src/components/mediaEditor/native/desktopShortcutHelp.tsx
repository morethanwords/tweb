import {For, onCleanup, onMount} from 'solid-js';
import A11yButton from '@components/a11yButton';
import createFocusTrap from '@helpers/dom/focusTrap';
import I18n, {i18n, LangPackKey} from '@lib/langPack';

// These are the Web editor's keys, not the native client's larger legend.
const shortcuts: {keys: string; label: LangPackKey}[] = [
  {keys: 'Enter', label: 'Done'},
  {keys: '?', label: 'KeyboardShortcuts.Title'},
  {keys: 'Esc', label: 'KeyboardShortcuts.Action.ClosePopup'},
  {keys: 'Ctrl+Z', label: 'KeyboardShortcuts.Action.Undo'},
  {keys: 'Ctrl+Shift+Z / Ctrl+Y', label: 'KeyboardShortcuts.Action.Redo'},
  {keys: 'Ctrl+D', label: 'Copy'},
  {keys: 'Delete / Backspace', label: 'Delete'}
];

export default function DesktopShortcutHelp(props: {onClose: () => void}) {
  let dialog: HTMLDivElement;
  let close: HTMLElement;
  onMount(() => {
    const trap = createFocusTrap(dialog);
    trap.activate(dialog.ownerDocument.activeElement as HTMLElement, close);
    onCleanup(() => trap.deactivate());
  });
  return <div class="media-editor-desktop__color-overlay" onPointerDown={event => {
    if(event.target === event.currentTarget) props.onClose();
  }}>
    <div ref={dialog} class="media-editor-desktop__color-dialog media-editor-desktop__shortcut-help" data-editor-shortcut-help
      role="dialog" aria-modal="true" aria-label={I18n.format('KeyboardShortcuts.Title', true)}>
      <h3>{i18n('KeyboardShortcuts.Title')}</h3>
      <For each={shortcuts}>{item => <div class="media-editor-desktop__shortcut-row">
        <span>{i18n(item.label)}</span><kbd dir="ltr">{item.keys}</kbd>
      </div>}</For>
      <A11yButton ref={close} class="media-editor-desktop__edge" onClick={props.onClose}>{i18n('Close')}</A11yButton>
    </div>
  </div>;
}
