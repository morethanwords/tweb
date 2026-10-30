import {i18n} from '@lib/langPack';
import wrapEmojiText from '@lib/richTextProcessor/wrapEmojiText';
import setInnerHTML from '@helpers/dom/setInnerHTML';

/** The class of the bubble an empty chat shows in place of messages, and the prefix of its parts. */
export const EMPTY_PLACEHOLDER_CLASS = 'empty-bubble-placeholder';

/**
 * The lines of the greeting an empty chat with a user shows: the user's start page (`businessIntro`)
 * where it says something, the default greeting where it does not. The empty chat and the start
 * page's editor, which previews it, build them alike.
 */
export function wrapBusinessIntroLines(intro?: {title?: string, description?: string}) {
  // * the user's own words go the way they are written, whatever the interface's direction
  const wrap = (text: string) => {
    const span = document.createElement('span');
    setInnerHTML(span, wrapEmojiText(text));
    return span;
  };

  const title = intro?.title ? wrap(intro.title) : i18n('NoMessages');
  const subtitle = intro?.description ? wrap(intro.description) : i18n('NoMessagesGreetingsDescription');
  title.classList.add('center', EMPTY_PLACEHOLDER_CLASS + '-title');
  subtitle.classList.add('center', EMPTY_PLACEHOLDER_CLASS + '-subtitle');
  return {title, subtitle};
}
