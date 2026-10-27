import type {EMOJI_VERSION} from '@environment/emojiVersionsSupport';
import {EmojiVersions} from '@config/emoji';
import IS_EMOJI_SUPPORTED from '@environment/emojiSupport';
import EMOJI_VERSIONS_SUPPORTED from '@environment/emojiVersionsSupport';

/**
 * Whether the platform draws this emoji itself. Apple's font does, up to the
 * emoji versions it has; everywhere else the app draws its own image, so an
 * emoji looks the same in a message, a field and a list.
 */
export function isEmojiNative(unicode: string) {
  if(!IS_EMOJI_SUPPORTED) return false;
  for(const version in EmojiVersions) {
    if(!version) continue;
    if(
      EmojiVersions[version as EMOJI_VERSION].hasOwnProperty(unicode) &&
      !EMOJI_VERSIONS_SUPPORTED[version as EMOJI_VERSION]
    ) return false;
  }

  return true;
}

/** Every emoji there is is drawn by the platform: nothing ever needs an image. */
export function areAllEmojiNative() {
  return IS_EMOJI_SUPPORTED &&
    Object.keys(EmojiVersions).every((version) => !version || EMOJI_VERSIONS_SUPPORTED[version as EMOJI_VERSION]);
}

export function getEmojiImageUrl(unicode: string) {
  return `assets/img/emoji/${unicode}.png`;
}
