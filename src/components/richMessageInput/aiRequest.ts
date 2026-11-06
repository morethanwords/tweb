import type {ChatInputEditor, ChatInputRichMessage} from '@components/chat/inputEditor/types';
import getRichValueWithCaret from '@helpers/dom/getRichValueWithCaret';
import type {TextWithEntities} from '@layer';
import {flattenRichMessageSummary} from '@lib/richMessage';
import trimRichText from '@lib/richTextProcessor/trimRichText';

/**
 * What of a field the AI editor is asked to rewrite, whole or its selection. Only content a plain message cannot
 * carry goes to the structured endpoints, judged as on send; the rest, and all of a field that sends only plain
 * messages (a caption, the composer with rich posting off), goes to the plain ones and gets text back, as on Android.
 * A rich result may hold a block a plain field has no room for (a translation's footer), and an account that may not
 * post rich messages is refused the structured endpoints (RICH_MESSAGE_UNSUPPORTED). Plain content goes as the field
 * sends it, and a selection as itself serialized the same way.
 */
export default function getAiEditorRequest(
  input: HTMLElement,
  editor: ChatInputEditor | undefined,
  selected?: boolean
): {text: TextWithEntities.textWithEntities, richMessage?: ChatInputRichMessage} {
  const richEditor = editor && !editor.plainOnly && editor.getMode() === 'rich' ? editor : undefined;
  const richMessage = richEditor && ((selected && richEditor.getSelectedRichMessage()) || richEditor.getRichMessage());
  if(richMessage) {
    return {text: flattenRichMessageSummary(richMessage.output), richMessage};
  }

  if(selected) {
    const {value, entities} = editor.getSelectedRichValue();
    return {text: {_: 'textWithEntities', text: value, entities}};
  }

  const {value, entities} = getRichValueWithCaret(input, true, false);
  return {text: {_: 'textWithEntities', ...trimRichText(value, entities)}};
}
