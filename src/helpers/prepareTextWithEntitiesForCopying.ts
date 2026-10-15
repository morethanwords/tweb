import {TextWithEntities} from '@layer';
import wrapRichText from '@lib/richTextProcessor/wrapRichText';
import documentFragmentToHTML from '@helpers/dom/documentFragmentToHTML';
import encodeEntities from '@helpers/string/encodeEntities';

type TextWithEntitiesForCopying = Omit<TextWithEntities, '_'>;

/**
 * The draft markup keeps a line break as the character itself, which shows as one only where
 * `white-space` preserves it: whatever reads the clipboard's HTML — the composer, a document, a
 * mail — folds it into a space. A <br> is a line break to every reader.
 */
function linebreaksToElements(fragment: DocumentFragment) {
  const walker = document.createTreeWalker(fragment, NodeFilter.SHOW_TEXT);
  const texts: Text[] = [];
  while(walker.nextNode()) {
    texts.push(walker.currentNode as Text);
  }

  for(const text of texts) {
    const lines = text.data.split('\n');
    if(lines.length === 1) {
      continue;
    }

    const nodes: (Node | string)[] = [];
    lines.forEach((line, idx) => {
      if(idx) nodes.push(document.createElement('br'));
      if(line) nodes.push(line);
    });
    text.replaceWith(...nodes);
  }
}

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
    linebreaksToElements(wrapped);
    return documentFragmentToHTML(wrapped);
  });

  const parts: string[] = textWithEntities.map(({text}) => {
    return text;
  });

  const prepare = (smth: string[], linebreak: string, heads = meta) => {
    return smth.map((str, idx) => {
      return heads?.[idx] ? heads[idx] + linebreak + str : str;
    }).join(linebreak + linebreak);
  };

  return {
    text: prepare(parts, '\n'),
    // runs of spaces stay as the message shows them
    html: '<span style="white-space: pre-wrap">' + prepare(htmlParts, '<br>', meta?.map(encodeEntities)) + '</span>'
  };
}
