import {TextWithEntities} from '@layer';
import wrapRichText from '@lib/richTextProcessor/wrapRichText';
import documentFragmentToHTML from '@helpers/dom/documentFragmentToHTML';

type TextWithEntitiesForCopying = Omit<TextWithEntities, '_'>;
export default function prepareTextWithEntitiesForCopying(
  textWithEntities: TextWithEntitiesForCopying | TextWithEntitiesForCopying[],
  meta?: string[]
) {
  if(!Array.isArray(textWithEntities)) {
    textWithEntities = [textWithEntities];
  }

  const htmlParts = textWithEntities.map(({text, entities}) => {
    const wrapped = wrapRichText(text, {
      entities,
      wrappingDraft: true
    });
    return documentFragmentToHTML(wrapped);
  });

  const parts: string[] = textWithEntities.map(({text}) => {
    return text;
  });

  const prepare = (smth: string[]) => {
    return smth.map((str, idx) => {
      return meta?.[idx] ? meta[idx] + '\n' + str : str;
    }).join('\n\n');
  };

  return {
    text: prepare(parts),
    html: prepare(htmlParts)
  };
}
