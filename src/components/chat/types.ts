import type ChatThreadSeparator from '@components/chat/bubbleParts/chatThreadSeparator';
import ContinueLastTopicReplyMarkupContent from '@components/chat/bubbleParts/continueLastTopicReplyMarkup/content';

export type BubbleElementAddons = {
  chatThreadSeparator?: InstanceType<typeof ChatThreadSeparator>;
  continueLastTopicReplyMarkup?: InstanceType<typeof ContinueLastTopicReplyMarkupContent>;
};
