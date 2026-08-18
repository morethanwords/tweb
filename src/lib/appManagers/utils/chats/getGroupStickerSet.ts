import {ChatFull, StickerSet} from '@layer';

/**
 * The sticker set (or custom emoji pack) a group offers to everyone chatting in it.
 * Only supergroups can have one, so anything else resolves to nothing.
 */
export default function getGroupStickerSet(chatFull: ChatFull, isEmoji?: boolean) {
  const channelFull = chatFull as ChatFull.channelFull;
  return (isEmoji ? channelFull?.emojiset : channelFull?.stickerset) as StickerSet.stickerSet;
}
