import {Extension} from '@tiptap/core';
import {DOMParser as ProseMirrorDOMParser, DOMSerializer, Fragment, type Node as ProseMirrorNode, type ResolvedPos, type Schema} from '@tiptap/pm/model';
import {Plugin} from '@tiptap/pm/state';
import type {EditorView} from '@tiptap/pm/view';
import {listItemMarkers} from '@components/chat/inputEditor/orderedList';
import {entitiesFittingSchema, telegramTextToTiptap} from '@components/chat/inputEditor/model';
import {getCopiedTextWithEntities} from '@helpers/prepareTextWithEntitiesForCopying';
import instantViewStyles from '@components/instantViewStyles';

function directListItems(list: HTMLOListElement | HTMLUListElement) {
  return Array.from(list.children).filter(
    (child): child is HTMLLIElement => child.tagName === 'LI'
  );
}

function directCheckbox(item: HTMLLIElement) {
  return Array.from(item.children).find((child): child is HTMLInputElement => (
    child.tagName === 'INPUT' && (child as HTMLInputElement).type === 'checkbox'
  ));
}

function normalizeChecklist(list: HTMLOListElement | HTMLUListElement) {
  const items = directListItems(list);
  const checkboxes = items.map(directCheckbox);
  if(!checkboxes.some(Boolean)) return;

  const taskList = list.tagName === 'UL' && checkboxes.every(Boolean);
  if(taskList) list.dataset.type = 'taskList';
  items.forEach((item, index) => {
    const checkbox = checkboxes[index];
    if(!checkbox) return;

    const checked = checkbox.checked || checkbox.hasAttribute('checked');
    if(taskList) {
      item.dataset.type = 'taskItem';
    } else {
      item.dataset.checkbox = 'true';
    }
    item.dataset.checked = checked ? 'true' : 'false';
    checkbox.remove();
  });
}

function normalizeDetails(details: HTMLDetailsElement) {
  if(details.hasAttribute('data-rich-message-details')) return;

  const ownerDocument = details.ownerDocument;
  const nativeSummary = Array.from(details.children).find(
    (child): child is HTMLElement => child.tagName === 'SUMMARY'
  );
  const summary = nativeSummary || ownerDocument.createElement('div');
  const body = ownerDocument.createElement('div');
  const bodyNodes = Array.from(details.childNodes).filter((child) => child !== nativeSummary);

  details.setAttribute('data-rich-message-details', '');
  details.setAttribute('data-editor-open', details.open ? 'true' : 'false');
  summary.setAttribute('data-details-summary', '');
  body.setAttribute('data-details-body', '');
  body.append(...bodyNodes);
  if(!body.textContent?.trim() && !body.children.length) {
    body.append(ownerDocument.createElement('p'));
  }
  details.replaceChildren(summary, body);
}

function normalizeBlockquoteCaption(blockquote: HTMLQuoteElement) {
  const caption = Array.from(blockquote.children).find((child) => child.tagName === 'CITE');
  caption?.setAttribute('data-blockquote-caption-content', '');
}

function normalizePullquote(aside: HTMLElement) {
  if(aside.hasAttribute('data-pullquote')) return;

  const ownerDocument = aside.ownerDocument;
  const caption = Array.from(aside.children).find((child) => child.tagName === 'CITE');
  const text = ownerDocument.createElement('div');
  const textNodes = Array.from(aside.childNodes).filter((child) => child !== caption);
  text.setAttribute('data-pullquote-text', '');
  text.append(...textNodes);
  aside.setAttribute('data-pullquote', '');
  if(caption) caption.setAttribute('data-pullquote-caption', '');
  aside.replaceChildren(text, ...(caption ? [caption] : []));
}

function normalizeRenderedMathBlock(container: Element) {
  const source = Array.from(container.children).find(
    (child) => child.tagName === 'TG-MATH-BLOCK'
  );
  if(source) container.replaceWith(source);
}

export function normalizeChatInputRichClipboardHTML(
  html: string,
  ownerDocument: Document = document
) {
  const template = ownerDocument.createElement('template');
  template.innerHTML = html;
  template.content.querySelectorAll('details').forEach(normalizeDetails);
  template.content.querySelectorAll<HTMLQuoteElement>('blockquote').forEach(normalizeBlockquoteCaption);
  template.content.querySelectorAll<HTMLElement>('aside').forEach(normalizePullquote);
  template.content.querySelectorAll('.math').forEach(normalizeRenderedMathBlock);
  template.content.querySelectorAll<HTMLOListElement | HTMLUListElement>('ol, ul')
  .forEach(normalizeChecklist);
  return template.innerHTML;
}

const LIST_NODE_NAMES = new Set(['bulletList', 'orderedList', 'taskList']);

/**
 * A list's lines as its plain text writes them (`tiptapToTelegram`): an item's first line behind
 * its marker, indented by depth, and the item's other lines after it.
 */
function listAsLines(list: ProseMirrorNode, depth: number, serializer: DOMSerializer, ownerDocument: Document) {
  const lines: HTMLParagraphElement[] = [];
  const markers = listItemMarkers(list);
  list.forEach((item, _offset, index) => {
    let prefix = '  '.repeat(depth) + markers[index];
    const addLines = (node: ProseMirrorNode) => {
      if(LIST_NODE_NAMES.has(node.type.name)) {
        lines.push(...listAsLines(node, depth + 1, serializer, ownerDocument));
      } else if(node.isTextblock) {
        const line = ownerDocument.createElement('p');
        if(prefix) {
          // the parser collapses leading spaces anywhere but in preformatted text
          const marker = ownerDocument.createElement('span');
          marker.style.whiteSpace = 'pre';
          marker.textContent = prefix;
          line.append(marker);
          prefix = '';
        }
        line.append(serializer.serializeFragment(node.content, {document: ownerDocument}));
        lines.push(line);
      } else {
        node.forEach(addLines);
      }
    };
    item.forEach(addLines);
  });
  return lines;
}

/**
 * A field without lists parses a pasted one into its bare lines. Its markers are part of what the
 * reader sees, so the lines keep them. The list is read by the composer's own rules — a task list,
 * a reversed or lettered one, checkboxes, the composer's clipboard — and written as it is sent.
 */
function pastedListsAsText(html: string, richSchema: Schema, ownerDocument: Document) {
  const template = ownerDocument.createElement('template');
  template.innerHTML = html;
  const lists = template.content.querySelectorAll<HTMLOListElement | HTMLUListElement>('ol, ul');
  if(!lists.length) return html;

  lists.forEach(normalizeChecklist);
  const parser = ProseMirrorDOMParser.fromSchema(richSchema);
  const serializer = DOMSerializer.fromSchema(richSchema);
  lists.forEach((list) => {
    // an inner list goes with its outer one
    if(list.parentElement?.closest('ol, ul')) return;
    const wrapper = ownerDocument.createElement('div');
    list.replaceWith(wrapper);
    wrapper.append(list);
    const lines: HTMLParagraphElement[] = [];
    parser.parse(wrapper).forEach((node) => {
      if(LIST_NODE_NAMES.has(node.type.name)) lines.push(...listAsLines(node, 0, serializer, ownerDocument));
    });
    wrapper.replaceWith(...lines);
  });
  return template.innerHTML;
}

export const ChatPlainListPaste = Extension.create<{richSchema: () => Schema}>({
  name: 'chatPlainListPaste',

  addOptions() {
    return {richSchema: undefined};
  },

  addProseMirrorPlugins() {
    const {richSchema} = this.options;
    return [new Plugin({
      props: {
        transformPastedHTML: (html, view) => view.state.schema.nodes.listItem ?
          html :
          pastedListsAsText(html, richSchema(), view.dom.ownerDocument)
      }
    })];
  }
});

// whitespace HTML collapses, and only that: a no-break space is text
const COLLAPSIBLE_SPACE = /^[\t\n\f\r ]*$/;

// what a copy may hold beside its content: whitespace, comments, metadata, the browser's line break
// for a selection that ended past a line
function isClipboardFiller(node: Node) {
  return node.nodeType === node.COMMENT_NODE ||
    (node.nodeType === node.TEXT_NODE && COLLAPSIBLE_SPACE.test(node.textContent)) ||
    (node.nodeType === node.ELEMENT_NODE && (node as Element).matches('meta, style, link, br.Apple-interchange-newline'));
}

function previousContent(node: Node) {
  let previous = node.previousSibling;
  while(previous && isClipboardFiller(previous)) previous = previous.previousSibling;
  return previous;
}

function lastContent(parent: Node) {
  const last = parent.lastChild;
  return last && isClipboardFiller(last) ? previousContent(last) : last;
}

// the blocks a browser copies the element of when a selection ends at their start, and the elements
// that copy can hold
const EDGE_BLOCKS = 'ol, ul, li, blockquote, table, details';
const EDGE_BLOCK_PARTS = new Set([
  'OL', 'UL', 'LI', 'BLOCKQUOTE', 'DETAILS', 'SUMMARY', 'P', 'DIV',
  'TABLE', 'CAPTION', 'COLGROUP', 'COL', 'THEAD', 'TBODY', 'TFOOT', 'TR', 'TH', 'TD'
]);

// attributes that lay out or style an element and no more; any other (a checklist item's
// `data-checkbox`) may be what the field reads out of it
const LAYOUT_ATTRIBUTES = new Set([
  'class', 'style', 'dir', 'lang', 'id', 'role', 'start', 'reversed', 'type', 'value',
  'colspan', 'rowspan', 'align', 'valign', 'width', 'height'
]);

/**
 * Whether an element is such a block with nothing in it: no text, nothing but its own parts, which
 * say nothing but how they look — a checkbox, an image, a line break, a checklist item's attributes
 * and anything else unknown keep it.
 */
function isEmptyEdgeBlock(element: Element) {
  return element.matches(EDGE_BLOCKS) &&
    COLLAPSIBLE_SPACE.test(element.textContent) &&
    [element, ...Array.from(element.querySelectorAll('*'))].every((part) => (
      EDGE_BLOCK_PARTS.has(part.tagName) &&
      Array.from(part.attributes).every(({name}) => LAYOUT_ATTRIBUTES.has(name) || name.startsWith('aria-'))
    ));
}

/**
 * A selection that ends where a list, a quote or a table begins takes that block's element along,
 * empty: `<p>text</p><ol></ol>`, `<li></li>` after an item, `<table>` with an empty cell. Pasted, it
 * would be an empty block after the text — a bullet with nothing next to it. So such a block at the
 * end of what is pasted, or at the end of the block there (an item of a list, a list in an item),
 * is left out, as long as something comes before it. Never inside a table: there it is a cell of
 * the grid. The field's own copy leaves it out as it is copied (`copiedSelection`).
 */
function removeTrailingEmptyBlock(root: DocumentFragment) {
  for(let last = lastContent(root); last && last.nodeType === last.ELEMENT_NODE; last = lastContent(last)) {
    const element = last as Element;
    if(isEmptyEdgeBlock(element)) {
      let before: Node;
      for(let node: Node = element; node !== root && !before; node = node.parentNode) {
        before = previousContent(node);
      }

      if(!before) return false;
      // a reversed list counts down from its number of items: one fewer, the rest keep their numbers
      const list = element.parentElement;
      if(element.tagName === 'LI' && list?.tagName === 'OL' && list.hasAttribute('reversed') && !list.hasAttribute('start')) {
        list.setAttribute('start', '' + directListItems(list as HTMLOListElement).length);
      }

      element.remove();
      return true;
    }

    if(element.tagName === 'TABLE') return false;
  }

  return false;
}

type AtomText = (element: Element) => string | undefined;

/**
 * What an element with nothing in it is as text, when it is something the field holds (a custom
 * emoji, a formula, an anchor): what the field's schema reads out of it, written as its plain text
 * writes it (`leafText`: an emoji's character, nothing for an anchor). Undefined for an empty wrapper
 * of formatting, which is nothing.
 */
function atomReader(schema: Schema, ownerDocument: Document): AtomText {
  const parser = ProseMirrorDOMParser.fromSchema(schema);
  return (element) => {
    if(element.tagName === 'BR' || element.hasChildNodes()) return;
    const container = ownerDocument.createElement('div');
    container.append(element.cloneNode(true));
    const {content} = parser.parseSlice(container);
    if(!content.size) return;
    return content.textBetween(0, content.size, '', (leaf) => leaf.type.spec.leafText?.(leaf) ?? '');
  };
}

function isBlankParagraph(paragraph: Element, atomText: AtomText) {
  return !paragraph.textContent.trim() &&
    !Array.from(paragraph.querySelectorAll('*')).some((element) => atomText(element) !== undefined);
}

function nextParagraph(paragraph: Element) {
  let next = paragraph.nextSibling;
  while(next && next.nodeType !== next.ELEMENT_NODE && !next.textContent.trim()) {
    next = next.nextSibling;
  }

  return (next as Element)?.tagName === 'P' ? next as HTMLParagraphElement : undefined;
}

// the parents ProseMirror keeps a pasted block's last <br> in (prosemirror-view's `inlineParents`);
// anywhere else it drops that one
const BREAK_KEEPING_PARENTS = /^(a|abbr|acronym|b|cite|code|del|em|i|ins|kbd|label|output|q|ruby|s|samp|span|strong|sub|sup|time|u|tt|var)$/i;

function isDroppedBreak(br: Node) {
  return !br.nextSibling && br.parentNode && !BREAK_KEEPING_PARENTS.test(br.parentNode.nodeName);
}

/**
 * Whether a paragraph breaks its line at its start, before any of its text — `atEnd`: at its end,
 * after all of it — with a `<br>` the paste keeps.
 */
function breaksAtEdge(paragraph: Element, atEnd: boolean, atomText: AtomText) {
  const nodes: Node[] = [];
  const walker = paragraph.ownerDocument.createTreeWalker(paragraph, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
  while(walker.nextNode()) nodes.push(walker.currentNode);
  if(atEnd) nodes.reverse();

  for(const node of nodes) {
    if(node.nodeName === 'BR') {
      if(!isDroppedBreak(node)) return true;
    } else if(node.nodeType === node.TEXT_NODE ? node.textContent.trim() : atomText(node as Element) !== undefined) {
      return false;
    }
  }

  return false;
}

type PlainWord = {word: string, paragraph: number, lineStart: boolean};

// the words of a plain text, each with the number of the paragraph it is in (lines with a blank one
// between them are paragraphs) and whether it starts its line
function plainTextWords(text: string) {
  const words: PlainWord[] = [];
  let paragraph = 0, blank = false;
  for(const line of text.split(/\r\n?|\n/)) {
    const lineWords = line.split(/\s+/).filter(Boolean);
    if(!lineWords.length) {
      blank = true;
      continue;
    }

    if(blank && words.length) ++paragraph;
    blank = false;
    lineWords.forEach((word, index) => words.push({word, paragraph, lineStart: !index}));
  }

  return words;
}

const BLOCK_ELEMENTS = 'address, article, aside, blockquote, dd, details, div, dl, dt, figcaption, figure, footer, ' +
  'h1, h2, h3, h4, h5, h6, header, li, main, nav, ol, p, pre, section, summary, table, td, th, tr, ul';

/**
 * The words of the fragment in their order, each with the paragraph it is in and whether it is the
 * first of a list's item: a block's text read whole, so that formatting splitting a word does not
 * split it, an inline atom as its text, a `<br>` and HTML's collapsible whitespace between words.
 */
function fragmentWords(root: DocumentFragment, atomText: AtomText) {
  const words: {word: string, paragraph: Element, itemStart: boolean}[] = [];
  let text = '', block: Element, paragraph: Element, item: Element, lastItem: Element;
  const flush = () => {
    text.split(/\s+/).filter(Boolean).forEach((word) => {
      words.push({word, paragraph, itemStart: !!item && item !== lastItem});
      lastItem = item;
    });
    text = '';
  };

  const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  while(walker.nextNode()) {
    const node = walker.currentNode;
    const parent = node.parentElement;
    const piece = node.nodeType === node.TEXT_NODE ? node.textContent :
      node.nodeName === 'BR' ? ' ' :
      atomText(node as Element);
    if(!piece || parent?.closest('style, script')) continue;
    const nodeBlock = parent?.closest(BLOCK_ELEMENTS);
    if(nodeBlock !== block) {
      flush();
      block = nodeBlock;
      paragraph = parent?.closest('p');
      item = parent?.closest('li');
    }

    text += piece;
  }

  flush();
  return words;
}

/**
 * Where each paragraph's words are among the plain text's: every word of the fragment is found
 * there in its order — a heading's before a paragraph's too, so that the same words are not taken
 * for the paragraph's — passing over what the plain text has besides (a list's markers, an emoji),
 * and a paragraph spans its words. One with a word not found, or with none, is left out.
 */
// what a plain text writes before a list's item: a bullet, a number or a letter with its dot
const LIST_MARKER = /^(?:[-*+•◦▪‣·–]|\(?[\da-z]{1,6}[.)])$/i;

function paragraphsInText(root: DocumentFragment, plain: PlainWord[], atomText: AtomText) {
  // where each word is among the plain text's, and how far that list is used up
  const positions = new Map<string, {indexes: number[], next: number}>();
  plain.forEach(({word}, index) => {
    const entry = positions.get(word);
    if(entry) entry.indexes.push(index);
    else positions.set(word, {indexes: [index], next: 0});
  });

  const found = new Map<Element, {first: number, last: number}>();
  const missing = new Set<Element>();
  let cursor = 0;
  for(const {word, paragraph, itemStart} of fragmentWords(root, atomText)) {
    // an item's marker before the line it starts is no word of the item, though it may read the same
    const marker = plain[cursor];
    if(itemStart && marker?.lineStart && LIST_MARKER.test(marker.word) && plain[cursor + 1]?.word === word) ++cursor;
    const entry = positions.get(word);
    while(entry && entry.next < entry.indexes.length && entry.indexes[entry.next] < cursor) ++entry.next;
    const index = entry?.indexes[entry.next];
    if(index === undefined) {
      if(paragraph) missing.add(paragraph);
      continue;
    }

    cursor = index + 1;
    if(!paragraph) continue;
    const span = found.get(paragraph);
    if(span) span.last = index;
    else found.set(paragraph, {first: index, last: index});
  }

  missing.forEach((paragraph) => found.delete(paragraph));
  return found;
}

/**
 * Paragraphs from a page or another app are kept apart there, while here a paragraph is a line and
 * two in a row touch (instantView.module.scss, `.RichMessage`): two pasted ones read as one. So an
 * empty line goes between two that the plain text beside them keeps apart — a blank line between,
 * as a browser writes any `<p>`s, and as pasting that text shows them — the way the field did before
 * (`getRichElementValue`). Two the plain text has as lines (a document with no spacing) stay so;
 * where a paragraph is not found in it, any blank line there decides, and without a plain text they
 * go apart. Not where a `<br>` breaks the line between them already, or for a message's own lines
 * copied out of its bubble.
 */
function keepPastedParagraphsApart(root: DocumentFragment, text: string | undefined, view: EditorView) {
  const ownerDocument = view.dom.ownerDocument;
  const atomText = atomReader(view.state.schema, ownerDocument);
  const paragraphs = Array.from(root.querySelectorAll('p')).filter((paragraph) => !isBlankParagraph(paragraph, atomText));
  if(paragraphs.length < 2) return false;
  const plain = text ? plainTextWords(text) : [];
  if(plain.length && !plain[plain.length - 1].paragraph) return false;

  const found = plain.length ? paragraphsInText(root, plain, atomText) : undefined;
  const apartInText = (paragraph: Element, next: Element) => {
    const [before, after] = [found.get(paragraph), found.get(next)];
    return !before || !after || plain[after.first].paragraph > plain[before.last].paragraph;
  };

  let changed = false;
  paragraphs.forEach((paragraph) => {
    const next = nextParagraph(paragraph);
    if(
      !next ||
      paragraph.classList.contains(instantViewStyles.Paragraph) ||
      isBlankParagraph(next, atomText) ||
      breaksAtEdge(paragraph, true, atomText) ||
      breaksAtEdge(next, false, atomText) ||
      (found && !apartInText(paragraph, next))
    ) return;

    paragraph.after(ownerDocument.createElement('p'));
    changed = true;
  });
  return changed;
}

/**
 * How the blocks of what is pasted from elsewhere become the field's lines: a block the copy only
 * reached the start of is left out, and paragraphs stay as far apart as they were. Not the field's
 * own copy (`data-pm-slice`), which is the field's lines already. Listed after `ChatPlainListPaste`,
 * so it reads the HTML first (Tiptap asks the plugins in reverse), before a list there is written
 * out as paragraphs.
 */
export const ChatPastedBlocks = Extension.create({
  name: 'chatPastedBlocks',

  addProseMirrorPlugins() {
    // the plain text of the paste or drop under way: ProseMirror reads the HTML within its event,
    // and hands only the HTML on
    let text: string;
    const readText = (_view: EditorView, event: ClipboardEvent | DragEvent) => {
      text = ((event as ClipboardEvent).clipboardData || (event as DragEvent).dataTransfer)?.getData('text/plain');
      queueMicrotask(() => text = undefined);
      return false;
    };

    return [new Plugin({
      props: {
        handleDOMEvents: {paste: readText, drop: readText},
        transformPastedHTML: (html, view) => {
          const template = view.dom.ownerDocument.createElement('template');
          template.innerHTML = html;
          const root = template.content;
          if(root.querySelector('[data-pm-slice]')) return html;
          const removed = removeTrailingEmptyBlock(root);
          const spaced = keepPastedParagraphsApart(root, text, view);
          return removed || spaced ? template.innerHTML : html;
        }
      }
    })];
  }
});

/**
 * A message copied out of a chat (its menu's Copy, a profile note, a translation) carries its text
 * and entities beside the HTML, and becomes what this field would show it as when editing it: a
 * quote, a code block with its language, a date with its format, which that HTML cannot hold. It is
 * handed on as the field's own markup, marked the way ProseMirror marks its own clipboard (with
 * the slice's open depths), so the parse keeps the whitespace as it is, a line's trailing spaces
 * too. Not through `serializeForClipboard`: the field's copy hooks look at its own selection.
 * Only a paragraph's edge is open, to join the line the copy is pasted into: a quote or a code
 * block at an edge stays whole, rather than becoming that line's plain text or taking in its rest.
 * Into a quote's text, a copied quote is its paragraphs: quotes do not nest, and the rest of the
 * copy stays in the quote it lands in too. Not into its author line, the quote's last: what follows
 * a line there goes after the quote, and a copied quote stays one.
 */
function pastedMessageAsFieldHTML(html: string, view: EditorView) {
  const {schema} = view.state;
  const ownerDocument = view.dom.ownerDocument;
  const template = ownerDocument.createElement('template');
  template.innerHTML = html;
  const copied = getCopiedTextWithEntities(template.content);
  if(!copied) return html;

  try {
    const doc = schema.nodeFromJSON(telegramTextToTiptap(copied.text, entitiesFittingSchema(copied.entities, schema)));
    const {$from} = view.state.selection;
    const intoQuote = $from.parent.type !== schema.nodes.blockquoteCaption &&
      Array.from({length: $from.depth}, (_, depth) => $from.node(depth + 1))
      .some((node) => node.type === schema.nodes.blockquote);
    const nodes: ProseMirrorNode[] = [];
    doc.forEach((node) => {
      if(intoQuote && node.type === schema.nodes.blockquote) node.forEach((child) => nodes.push(child));
      else nodes.push(node);
    });
    const content = Fragment.fromArray(nodes);
    const isOpen = (node: ProseMirrorNode) => node.type === schema.nodes.paragraph ? 1 : 0;
    const fragment = DOMSerializer.fromSchema(schema).serializeFragment(content, {document: ownerDocument});
    (fragment.firstChild as Element).setAttribute('data-pm-slice', `${isOpen(content.firstChild)} ${isOpen(content.lastChild)} []`);
    copied.element.replaceWith(fragment);
  } catch(err) {
    return html;
  }

  return template.innerHTML;
}

export const ChatCopiedMessagePaste = Extension.create({
  name: 'chatCopiedMessagePaste',

  addProseMirrorPlugins() {
    return [new Plugin({
      props: {
        transformPastedHTML: pastedMessageAsFieldHTML
      }
    })];
  }
});

/**
 * ProseMirror's own reader of pasted plain text, without its folding of a run of line breaks into
 * one: every line stays a line, a blank one an empty paragraph — as typing it makes one, and as a
 * message is spaced out.
 */
function parseClipboardTextLines(text: string, $context: ResolvedPos, view: EditorView) {
  const {schema} = view.state;
  const ownerDocument = view.dom.ownerDocument;
  const serializer = DOMSerializer.fromSchema(schema);
  const marks = $context.marks();
  const dom = ownerDocument.createElement('div');
  text.split(/\r\n?|\n/).forEach((line) => {
    const paragraph = dom.appendChild(ownerDocument.createElement('p'));
    if(line) paragraph.append(serializer.serializeNode(schema.text(line, marks), {document: ownerDocument}));
  });
  const parser = view.someProp('clipboardParser') || view.someProp('domParser') || ProseMirrorDOMParser.fromSchema(schema);
  return parser.parseSlice(dom, {preserveWhitespace: true, context: $context});
}

/** Listed before `ChatTableClipboard`, so its plugin reads only what is not a table. */
export const ChatTextPaste = Extension.create({
  name: 'chatTextPaste',

  addProseMirrorPlugins() {
    return [new Plugin({
      props: {
        clipboardTextParser: (text, $context, _plain, view) => parseClipboardTextLines(text, $context, view)
      }
    })];
  }
});

export function createChatInputRichClipboardPlugin(ownerDocument: Document = document) {
  return new Plugin({
    props: {
      transformPastedHTML: (html) => normalizeChatInputRichClipboardHTML(html, ownerDocument)
    }
  });
}

export const ChatInputRichClipboard = Extension.create({
  name: 'chatInputRichClipboard',

  addProseMirrorPlugins() {
    return [createChatInputRichClipboardPlugin()];
  }
});
