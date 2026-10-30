import {Document, InputStickerSet, MessageEntity, Reaction, StickerSet, StoryItem} from '@layer';
import type {AppManagers} from '@lib/managers';
import {i18n} from '@lib/langPack';
import wrapEmojiText from '@lib/richTextProcessor/wrapEmojiText';
import {getStickerSetInputById} from '@appManagers/utils/stickers/getStickerSetInput';
import getStickeredMedia from '@appManagers/utils/stickers/getStickeredMedia';

// * the packs a story takes its stickers and emoji from - those put on its media, which the server
// * names, and those of the custom emoji in its caption and reaction areas - for "This story contains
// * stickers from …" at the end of its menu (iOS getLinkedStickerPacks, Android StoryContainsEmojiButton).
// * Stickers and emoji are told apart: the packs popup shows, sends and links one kind at a time
export type StoryContainedPacksKind = 'stickers' | 'emoji';
export type StoryContainedPacks = {
  inputs: InputStickerSet.inputStickerSetID[],
  // * of the only pack
  title?: string
};

const getCustomEmojiIds = (story: StoryItem.storyItem) => {
  const ids = new Set<DocId>();
  story.entities?.forEach((entity) => {
    if(entity._ === 'messageEntityCustomEmoji') {
      ids.add((entity as MessageEntity.messageEntityCustomEmoji).document_id);
    }
  });

  story.media_areas?.forEach((mediaArea) => {
    if(mediaArea._ === 'mediaAreaSuggestedReaction' && mediaArea.reaction._ === 'reactionCustomEmoji') {
      ids.add((mediaArea.reaction as Reaction.reactionCustomEmoji).document_id);
    }
  });

  return [...ids];
};

export const storyHasContainedPacks = (story: StoryItem.storyItem) => {
  return !!getStickeredMedia(story.media) || !!getCustomEmojiIds(story).length;
};

export async function getStoryContainedPacks(
  story: StoryItem.storyItem,
  managers: AppManagers
): Promise<Record<StoryContainedPacksKind, StoryContainedPacks>> {
  const stickeredMedia = getStickeredMedia(story.media);
  const emojiIds = getCustomEmojiIds(story);
  const [attachedSets, cachedEmojiDocs] = await Promise.all([
    stickeredMedia ? managers.appStickersManager.getAttachedStickers(stickeredMedia.type, stickeredMedia.id).catch((): StickerSet.stickerSet[] => []) : [],
    managers.appEmojiManager.getCachedCustomEmojiDocuments(emojiIds)
  ]);

  const emojiDocs = cachedEmojiDocs.some((doc) => !doc) ?
    await managers.appEmojiManager.getCustomEmojiDocuments(emojiIds).catch((): Document.document[] => []) :
    cachedEmojiDocs;

  const inputs: Record<StoryContainedPacksKind, Map<Long, InputStickerSet.inputStickerSetID>> = {stickers: new Map(), emoji: new Map()};
  const titles: Map<Long, string> = new Map();
  attachedSets.forEach((set) => {
    inputs[set.pFlags.emojis ? 'emoji' : 'stickers'].set(set.id, getStickerSetInputById(set));
    titles.set(set.id, set.title);
  });

  emojiDocs.forEach((doc) => {
    const input = doc?.stickerSetInput as InputStickerSet.inputStickerSetID;
    if(input && !inputs.emoji.has(input.id)) {
      inputs.emoji.set(input.id, input);
    }
  });

  const getPacks = async(map: Map<Long, InputStickerSet.inputStickerSetID>): Promise<StoryContainedPacks> => {
    const packs: StoryContainedPacks = {inputs: [...map.values()]};
    if(packs.inputs.length === 1) {
      const [input] = packs.inputs;
      packs.title = titles.get(input.id) ?? (await managers.appStickersManager.getStickerSet(input))?.set.title;
    }

    return packs;
  };

  const [stickers, emoji] = await Promise.all([getPacks(inputs.stickers), getPacks(inputs.emoji)]);
  return {stickers, emoji};
}

export function wrapStoryContainedPacks(kind: StoryContainedPacksKind, packs: StoryContainedPacks) {
  const key = kind === 'emoji' ? 'Emoji' : 'Stickers';
  return packs.inputs.length === 1 && packs.title !== undefined ?
    i18n(`Story.Contains${key}From`, [wrapEmojiText(packs.title)]) :
    i18n(`Story.Contains${key}`, [packs.inputs.length]);
}
