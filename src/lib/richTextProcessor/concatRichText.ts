import type {RichText} from '@layer';

const EMPTY_RICH_TEXT: RichText.textEmpty = {_: 'textEmpty'};

export default function concatRichText(texts: RichText[]): RichText {
  const compact: RichText[] = [];
  texts.forEach((text) => {
    if(text._ === 'textEmpty') return;

    const previous = compact[compact.length - 1];
    if(previous?._ === 'textPlain' && text._ === 'textPlain') {
      compact[compact.length - 1] = {_: 'textPlain', text: previous.text + text.text};
    } else if(text._ === 'textConcat') {
      text.texts.forEach((child) => compact.push(child));
    } else {
      compact.push(text);
    }
  });

  if(!compact.length) return EMPTY_RICH_TEXT;
  if(compact.length === 1) return compact[0];
  return {_: 'textConcat', texts: compact};
}
