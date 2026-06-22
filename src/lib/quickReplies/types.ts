export const QUICK_REPLIES_STORAGE_KEY = 'quickReplies';

export const QUICK_REPLIES_MAX = 200;
export const QUICK_REPLY_MAX_TITLE_LENGTH = 64;
export const QUICK_REPLY_MAX_TEXT_LENGTH = 4096;

export type QuickReply = {
  id: string,
  // short label / the FAQ question, shown in lists
  title: string,
  // the prepared answer that gets inserted into the message input
  text: string,
  date: number
};

export type QuickRepliesData = {
  replies: QuickReply[]
};
