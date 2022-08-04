import Emoji from '../../config/emoji';
import {encodeEmoji} from '../../vendor/emoji';

export default function getEmojiUnified(emojiCode: string) {
  const unified = encodeEmoji(emojiCode).replace(/-?fe0f/g, '');

  /* if(unified === '1f441-200d-1f5e8') {
    //unified = '1f441-fe0f-200d-1f5e8-fe0f';
    unified = '1f441-fe0f-200d-1f5e8';
  } */

  if(!Emoji.hasOwnProperty(unified)
  // && !emojiData.hasOwnProperty(unified.replace(/-?fe0f$/, ''))
  ) {
    // console.error('lol', unified);
    return;
  }

  return unified;
}
