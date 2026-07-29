import getServerMessageId from '@appManagers/utils/messageId/getServerMessageId';
import wrapTelegramUrlToAnchor from '@lib/richTextProcessor/wrapTelegramUrlToAnchor';

type WrapTopicThreadAnchorArgs = {
  peerId: PeerId;
  threadId: number;
  lastMsgId: number;
};

const shortDomain = import.meta.env.VITE_SHORT_DOMAIN || 't.me';
export default function wrapTopicThreadAnchor({peerId, threadId, lastMsgId}: WrapTopicThreadAnchorArgs) {
  return wrapTelegramUrlToAnchor(
    `${shortDomain}/c/` +
    peerId.toChatId() +
    (threadId ? '/' + getServerMessageId(threadId) : '') +
    (lastMsgId ? '/' + getServerMessageId(lastMsgId) : '')
  );
}
