import createChatInputEditor from '@components/chat/inputEditor';
import {openCreateLinkPopupForEditor} from '@components/popups/createLinkForInput';

/**
 * Give a field that can only ever produce a plain message — a caption, a forward
 * comment, a poll description, a fact check, a poll option, a checklist item, a
 * folder name — the composer's engine on the plain schema.
 *
 * Formatting, undo and the clipboard then behave exactly as in the chat input,
 * and a block the field cannot send has no way into the document. Caller keeps
 * ownership: `destroy` it before the field it is mounted on goes away.
 *
 * A field built without linebreaks gets the one-line schema: that flag is the
 * field already saying it holds one line, so the schema follows it instead of
 * every call site repeating the same thing.
 */
export default function attachPlainMessageEditor(input: HTMLElement) {
  // The view writes its own `contenteditable` onto the element, so a field that
  // was built read-only says so through the attribute it publishes for that.
  const editable = input.getAttribute('aria-readonly') !== 'true';
  const editor = createChatInputEditor(input, {
    enableBlockSelection: false,
    onLinkEditor: (selection) => void openCreateLinkPopupForEditor(editor, selection),
    plainOnly: true,
    singleLine: !!input.dataset.noLinebreaks
  });
  if(!editable) editor.setEditable(false);

  return editor;
}
