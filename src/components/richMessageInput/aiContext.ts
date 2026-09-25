import type {AiEditorSendOptions} from '@components/popups/aiEditorPopup/aiEditorPopup';
import type {ChatInputRichMessage} from '@components/chat/inputEditor/types';
import type {LocalTextWithEntities} from '@types';

export type AiEditorSession = {
  peerId: PeerId,
  isCurrent: () => boolean,
  isScheduled?: boolean,
  clear: () => void,
  canSendWhenOnline?: () => MaybePromise<boolean>,
  send?: (text: LocalTextWithEntities, options?: AiEditorSendOptions, richMessage?: ChatInputRichMessage) => Promise<boolean>
};

export type AiEditorContext = {
  capture: () => AiEditorSession
};
