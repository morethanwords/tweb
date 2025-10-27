import type ChatThreadSeparator from './bubbleParts/chatThreadSeparator';
import ContinueLastTopicReplyMarkupContent from './bubbleParts/continueLastTopicReplyMarkup/content';

export type BubbleElementAddons = {
  chatThreadSeparator?: InstanceType<typeof ChatThreadSeparator>;
  continueLastTopicReplyMarkup?: InstanceType<typeof ContinueLastTopicReplyMarkupContent>;
};
