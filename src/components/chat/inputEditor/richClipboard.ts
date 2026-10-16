import {Extension} from '@tiptap/core';
import {DOMParser as ProseMirrorDOMParser, DOMSerializer, Fragment, type Node as ProseMirrorNode, type ResolvedPos, type Schema} from '@tiptap/pm/model';
import {Plugin} from '@tiptap/pm/state';
import type {EditorView} from '@tiptap/pm/view';
import {listItemMarkers} from '@components/chat/inputEditor/orderedList';
import {entitiesFittingSchema, telegramTextToTiptap} from '@components/chat/inputEditor/model';
import {getCopiedTextWithEntities} from '@helpers/prepareTextWithEntitiesForCopying';

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
