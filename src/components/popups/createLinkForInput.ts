import type {MessageEntity} from '@layer';
import type {
  ChatInputEditor,
  ChatInputEditorSelection
} from '@components/chat/inputEditor/types';
import captureInputContent from '@components/chat/inputEditor/captureInputContent';
import {getChatInputEditor} from '@components/chat/inputEditor/registry';
import {
  type CreateLinkPopupOptions,
  getCreateLinkPopupOptionsForSelection
} from '@components/popups/createLinkModel';

async function requestCreateLink(options: CreateLinkPopupOptions) {
  let showCreateLinkPopup: typeof import('@components/popups/createLink')['default'];
  try {
    ({default: showCreateLinkPopup} = await import('@components/popups/createLink'));
  } catch{
    return;
  }

  return showCreateLinkPopup(options).catch((): undefined => undefined);
}

export async function openCreateLinkPopupForEditor(
  editor: ChatInputEditor,
  selection: ChatInputEditorSelection = editor.captureSelection(),
  isContextCurrent: () => boolean = () => true
) {
  const input = editor.input;
  const contentIsCurrent = captureInputContent(input, editor);
  const isCurrent = () => isContextCurrent() && input.isConnected && contentIsCurrent(getChatInputEditor(input));
  if(!isCurrent() || selection.revision !== undefined &&
    selection.revision !== editor.captureSelection().revision) return false;
  editor.restoreSelection(selection, false);
  const selectedLink = editor.getSelectedLink();

  const result = await requestCreateLink(getCreateLinkPopupOptionsForSelection(
    selectedLink,
    editor.getSelectedText()
  ));
  if(!result || !isCurrent()) return false;

  editor.restoreSelection(selection, false);
  const entities: MessageEntity[] = [{
    _: 'messageEntityTextUrl',
    length: result.text.length,
    offset: 0,
    url: result.url
  }];
  if(selectedLink) {
    if(result.text === selectedLink.text) {
      editor.updateLinkRange(selectedLink.from, selectedLink.to, result.url);
    } else {
      editor.replaceDocumentRange(
        selectedLink.from,
        selectedLink.to,
        result.text,
        entities
      );
    }
  } else {
    editor.replaceSelection(result.text, entities);
  }

  return true;
}

/** Resolves the editor the input carries — every formattable field mounts one. */
export default function openCreateLinkPopupForInput(input: HTMLElement) {
  const editor = getChatInputEditor(input);
  if(!editor) return Promise.resolve(false);
  if(editor.requestLinkEditor()) return Promise.resolve(true);
  return openCreateLinkPopupForEditor(editor);
}
