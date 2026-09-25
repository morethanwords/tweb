import MarkupTooltip from '@components/chat/markupTooltip';
import cancelEvent from '@helpers/dom/cancelEvent';
import {MarkdownType} from '@helpers/dom/getRichElementValue';
import isSelectionEmpty from '@helpers/dom/isSelectionEmpty';
import {getChatInputEditor} from '@components/chat/inputEditor/registry';
import openCreateLinkPopupForInput from '@components/popups/createLinkForInput';

/**
 * Formatting is applied by the editor mounted on the input.
 *
 * Every field that can be formatted mounts one — the chat composer, media
 * captions, forward comments, poll descriptions, fact checks — so there is no
 * second implementation to keep in step. This used to fall back to
 * `document.execCommand` with its own markup bookkeeping.
 */
export function applyMarkdown({input, type, href, dateSuffix}: {
  input: HTMLElement,
  type: MarkdownType,
  href?: string,
  dateSuffix?: string
}) {
  const editor = getChatInputEditor(input);
  if(!editor) return false;

  const applied = editor.applyMarkup({type, href, dateSuffix});
  MarkupTooltip.getInstance().setActiveMarkupButton();
  return applied;
}

export function handleMarkdownShortcut(input: HTMLElement, e: KeyboardEvent) {
  const formatKeys: {[key: string]: MarkdownType} = {
    'KeyB': 'bold',
    'KeyI': 'italic',
    'KeyU': 'underline',
    'KeyS': 'strikethrough',
    'KeyM': 'monospace',
    'KeyP': 'spoiler',
    'KeyK': 'link'
  };

  const markdownType = formatKeys[e.code];
  const selection = input.ownerDocument.defaultView.getSelection();
  if(isSelectionEmpty(selection) || !markdownType) return;

  if(e.code === 'KeyK') void openCreateLinkPopupForInput(input);
  else applyMarkdown({input, type: markdownType});

  cancelEvent(e); // cancel the browser's own formatting shortcut
}
