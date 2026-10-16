import {MessageEntity, TextWithEntities} from '@layer';
import wrapRichText from '@lib/richTextProcessor/wrapRichText';
import parseEntities from '@lib/richTextProcessor/parseEntities';
import documentFragmentToHTML from '@helpers/dom/documentFragmentToHTML';
import encodeEntities from '@helpers/string/encodeEntities';

type TextWithEntitiesForCopying = Omit<TextWithEntities, '_'>;

/**
 * The text and entities of what was copied, next to the HTML other apps read. The draft markup
 * cannot hold all of it — a code block is inline code there, a date has lost its format — so the
 * composer pastes a copy from these, as it opens a message for editing.
 */
const COPIED_ATTRIBUTE = 'data-text-with-entities';

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

/**
 * The draft markup's formatting in HTML any app reads (a document, a mail): a draft span's format
 * is its font family, which nothing but this client knows. A spoiler and a date have no such tag
 * and stay the client's own.
 */
const MARKUP_ELEMENTS: {[markup: string]: string} = {
  'markup-bold': 'strong',
  'markup-italic': 'em',
  'markup-underline': 'u',
  'markup-strikethrough': 's',
  'markup-monospace': 'code',
  'markup-quote': 'blockquote'
};

function markupToElements(fragment: DocumentFragment) {
  fragment.querySelectorAll<HTMLElement>('[data-markup]').forEach((element) => {
    const tagName = MARKUP_ELEMENTS[element.dataset.markup];
    if(!tagName) {
      return;
    }

    const replacement = document.createElement(tagName);
    const {language, collapsed} = element.dataset;
    if(language) replacement.dataset.language = language;
    if(collapsed) replacement.dataset.collapsed = collapsed;
    // a quote in an RTL language reads right to left anywhere
    if(element.dir) replacement.dir = element.dir;
    replacement.append(...Array.from(element.childNodes));
    element.replaceWith(replacement);

    // a quote is a block, its edges are its line breaks: a <br> beside it would be one more, so it
    // goes, and the quote says where it stood
    if(tagName === 'blockquote') {
      if(replacement.previousSibling?.nodeName === 'BR') {
        replacement.previousSibling.remove();
        replacement.dataset.breakBefore = '';
      }

      if(replacement.nextSibling?.nodeName === 'BR') {
        replacement.nextSibling.remove();
        replacement.dataset.breakAfter = '';
      }
    }
  });
}

type CopiedTextWithEntities = TextWithEntitiesForCopying & {shape: string};

/**
 * What a copy's HTML says: its text (a <br> a line break, an image its alt) and the formatting around
 * it, each element's tag and data and a link's address — what survives the browser writing it to
 * the clipboard, where styles and handlers may not. The metadata keeps the shape it was written
 * with: an app that keeps the wrapper while editing its text or formatting (a line more, bold taken
 * off, a link pointed elsewhere) makes the HTML, not the metadata, the content.
 */
function getCopiedShape(node: Node): string {
  if(node.nodeType === node.TEXT_NODE) return (node as Text).data;
  if(node.nodeType !== node.ELEMENT_NODE) return '';
  const element = node as HTMLElement;
  if(element.tagName === 'BR') return '\n';
  const attributes = Array.from(element.attributes)
  .filter(({name}) => name.startsWith('data-'))
  .map(({name, value}) => `${name}="${value}"`);
  // a mention's address is its user's id, which it carries as data
  const href = element.tagName === 'A' && element.dataset.follow === undefined && element.getAttribute('href');
  if(href) {
    let url = href;
    try {
      url = new URL(href).href;
    } catch(err) {}
    attributes.push(`href="${url}"`);
  }

  const content = element.tagName === 'IMG' ?
    (element as HTMLImageElement).alt :
    Array.from(element.childNodes).map(getCopiedShape).join('');
  return `<${element.tagName.toLowerCase()} ${attributes.sort().join(' ')}>${content}</>`;
}

const getContentShape = (parent: Node) => Array.from(parent.childNodes).map(getCopiedShape).join('');

/**
 * What a copy made by `prepareTextWithEntitiesForCopying` in `root` carries, while its HTML is still
 * as it was written: a part of it, or one edited in another app, is read as its HTML.
 */
export function getCopiedTextWithEntities(root: ParentNode) {
  const element = root.querySelector(`[${COPIED_ATTRIBUTE}]`);
  if(!element) {
    return;
  }

  let copied: CopiedTextWithEntities;
  try {
    copied = JSON.parse(element.getAttribute(COPIED_ATTRIBUTE));
  } catch(err) {
    return;
  }

  // any page can put this on the clipboard: an entity off the text's characters would not be the
  // message's, and a fractional range never ends a loop over it
  const isPlaced = (entity: MessageEntity) => typeof(entity?._) === 'string' &&
    Number.isInteger(entity.offset) &&
    Number.isInteger(entity.length) &&
    entity.offset >= 0 &&
    entity.length > 0 &&
    entity.offset + entity.length <= copied.text.length;
  if(
    typeof(copied?.text) !== 'string' ||
    !Array.isArray(copied.entities) ||
    !copied.entities.every(isPlaced) ||
    copied.shape !== getContentShape(element)
  ) {
    return;
  }

  return {element, text: copied.text, entities: copied.entities};
}

export default function prepareTextWithEntitiesForCopying(
  textWithEntities: TextWithEntitiesForCopying | TextWithEntitiesForCopying[],
  meta?: string[]
) {
  if(!Array.isArray(textWithEntities)) {
    textWithEntities = [textWithEntities];
  }

  const copied: TextWithEntitiesForCopying = {text: '', entities: []};
  const htmlParts = textWithEntities.map(({text, entities}, idx) => {
    // every line break is the character, a <br> below: the draft drops the ones around a quote,
    // which only its block layout shows
    entities = (entities ?? parseEntities(text)).filter((entity) => entity._ !== 'messageEntityLinebreak');

    if(idx) copied.text += '\n\n';
    if(meta?.[idx]) copied.text += meta[idx] + '\n';
    const offset = copied.text.length;
    copied.text += text;
    copied.entities.push(...entities.map((entity): MessageEntity => ({...entity, offset: entity.offset + offset})));

    const wrapped = wrapRichText(text, {
      entities,
      wrappingDraft: true
    });
    linebreaksToElements(wrapped);
    markupToElements(wrapped);
    return documentFragmentToHTML(wrapped);
  });

  const html = htmlParts.map((str, idx) => {
    return meta?.[idx] ? encodeEntities(meta[idx]) + '<br>' + str : str;
  }).join('<br><br>');

  // read back as a paste reads it
  const template = document.createElement('template');
  template.innerHTML = html;
  const metadata: CopiedTextWithEntities = {...copied, shape: getContentShape(template.content)};

  return {
    text: copied.text,
    // runs of spaces stay as the message shows them
    html: `<span style="white-space: pre-wrap" ${COPIED_ATTRIBUTE}="${encodeEntities(JSON.stringify(metadata))}">${html}</span>`
  };
}
