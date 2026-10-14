import createChatInputEditor from '@components/chat/inputEditor';
import isSendShortcutPressed, {isNewLineShortcutPressed, leaveSendShortcut} from '@helpers/dom/isSendShortcutPressed';
import {openCreateLinkPopupForEditor} from '@components/popups/createLinkForInput';
import getInputFormattingTypes from '@helpers/dom/getInputFormattingTypes';

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
 * every call site repeating the same thing. The formatting the field declared
 * (`can-format`, or a message field's all of it) narrows the schema the same way.
 */
export default function attachPlainMessageEditor(
  input: HTMLElement,
  options: {
    /**
     * The field's popup sends on the send shortcut (`confirmShortcutIsSendShortcut`): the shortcut
     * breaks no line, and the event is marked so the popup still sends on it.
     */
    leaveSendShortcut?: boolean
  } = {}
) {
  // The view writes its own `contenteditable` onto the element, so a field that
  // was built read-only says so through the attribute it publishes for that.
  const editable = input.getAttribute('aria-readonly') !== 'true';
  const singleLine = !!input.dataset.noLinebreaks;
  const editor = createChatInputEditor(input, {
    onKeyDown: (event) => {
      // A one-line field takes no line break, and the editor prevents Enter's default on
      // keydown — where the field used to do it on keypress, after everyone else's keydown
      // listener. Leave the Enter to what the field is in: a poll option moving to the next
      // one, a popup confirming on it (the checklist's Create).
      if(singleLine && event.key === 'Enter' && !event.defaultPrevented) leaveSendShortcut(event);
      if(!options.leaveSendShortcut) return false;
      // taken already (a suggestion picked with Enter): nothing is left for the popup to send on
      if(event.defaultPrevented || !isSendShortcutPressed(event)) return false;
      leaveSendShortcut(event);
      return true;
    },
    enableBlockSelection: false,
    formatting: getInputFormattingTypes(input),
    // where Enter sends, the new-line shortcut is the field's Enter, as in the chat input: a second
    // one leaves a quote that ends the caption, a third leaves code
    isNewLineShortcutPressed: options.leaveSendShortcut ? isNewLineShortcutPressed : undefined,
    onLinkEditor: (selection) => void openCreateLinkPopupForEditor(editor, selection),
    plainOnly: true,
    singleLine
  });
  if(!editable) editor.setEditable(false);

  return editor;
}
