import type {
  ChatInputEditor,
  ChatInputRichMessage
} from '@components/chat/inputEditor/types';

export type ChatInputEditorDraftContent = {
  legacyValue?: ReturnType<ChatInputEditor['getLegacyValueIfLossless']>,
  richMessage?: ChatInputRichMessage
};

export default function deriveEditorDraftContent(
  editor?: ChatInputEditor
): ChatInputEditorDraftContent {
  if(!editor) return {};

  const hasSendableContent = !editor.isEmpty();
  const hasDraftContent = !editor.isPlaceholderEmpty();
  const legacyValue = hasSendableContent ?
    editor.getLegacyValueIfLossless() :
    undefined;
  let richMessage = hasDraftContent && !legacyValue ?
    editor.getRichMessage({draft: true}) :
    undefined;
  if(!richMessage?.input.blocks.length) richMessage = undefined;

  return {legacyValue, richMessage};
}
