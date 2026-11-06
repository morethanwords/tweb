import type {AiEditorSendOptions} from '@components/popups/aiEditorPopup/aiEditorPopup';
import type {ChatInputRichMessage} from '@components/chat/inputEditor/types';
import type {LocalTextWithEntities} from '@types';
import type {AiSendStyle} from '@components/chat/aiSendStyles';

export type AiEditorSession = {
  peerId: PeerId,
  isCurrent: () => boolean,
  isScheduled?: boolean,
  clear: () => void,
  canSendWhenOnline?: () => MaybePromise<boolean>,
  send?: (text: LocalTextWithEntities, options?: AiEditorSendOptions, richMessage?: ChatInputRichMessage) => Promise<boolean>,
  /** the request saved to be made on every message the chat's composer sends, if one is */
  sendStyle?: AiSendStyle,
  /** where the composer sends: saves the request (or drops it, given none) */
  saveSendStyle?: (style: AiSendStyle | undefined) => boolean
};

export type AiEditorContext = {
  capture: () => AiEditorSession
};
