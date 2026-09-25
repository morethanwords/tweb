import type {ChatInputEditorSelection} from '@components/chat/inputEditor/types';

export default function shouldOpenCreateWithAi(
  expanded: boolean,
  selection?: ChatInputEditorSelection
) {
  return expanded &&
    !!selection &&
    selection.type !== 'cell' &&
    selection.from === selection.to;
}
