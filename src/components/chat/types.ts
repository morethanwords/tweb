import type ChatThreadSeparator from './bubbleParts/chatThreadSeparator';

export type BubbleElementAddons = {
  chatThreadSeparator?: InstanceType<typeof ChatThreadSeparator>;
};
