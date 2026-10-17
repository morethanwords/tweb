import type ChatThreadSeparator from '@components/chat/bubbleParts/chatThreadSeparator';
import ContinueLastTopicReplyMarkupContent from '@components/chat/bubbleParts/continueLastTopicReplyMarkup/content';

export type BubbleElementAddons = {
  chatThreadSeparator?: InstanceType<typeof ChatThreadSeparator>;
  continueLastTopicReplyMarkup?: InstanceType<typeof ContinueLastTopicReplyMarkupContent>;
  /** how many items of its album the bubble was rendered with */
  groupedLength?: number;
};
