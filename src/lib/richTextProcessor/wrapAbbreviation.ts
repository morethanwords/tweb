import wrapEmojiText from '@lib/richTextProcessor/wrapEmojiText';
import getAbbreviation from '@lib/richTextProcessor/getAbbreviation';

export default function wrapAbbreviation(str: string, onlyFirst?: boolean) {
  const {text, entities} = getAbbreviation(str, onlyFirst);
  return wrapEmojiText(text, undefined, entities);
}
