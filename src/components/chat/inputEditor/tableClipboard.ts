import {Extension} from '@tiptap/core';
import {
  DOMParser as ProseMirrorDOMParser,
  DOMSerializer,
  Fragment,
  Slice,
  type Node as ProseMirrorNode,
  type Schema
} from '@tiptap/pm/model';
import {Plugin} from '@tiptap/pm/state';
import {
  richTextPlainText,
  richTextToTiptapInlineContent,
  tiptapDocumentToCaptionRichText
} from '@components/chat/inputEditor/richMessage';
import type {RichText} from '@layer';
import {
  CHAT_TABLE_TITLE_DATA_ATTRIBUTE,
  CHAT_TABLE_TITLE_NODE_NAME,
  CHAT_TABLE_WRAPPER_DATA_ATTRIBUTE,
  CHAT_TABLE_WRAPPER_NODE_NAME
} from '@components/chat/inputEditor/tableSchema';

export const TABLE_CLIPBOARD_TITLE_HTML_ATTRIBUTE = 'data-table-title-html';
export const TABLE_CLIPBOARD_CELL_TEXT_LIMIT = 4096;

export function parseChatTableClipboardRows(
  input: string,
  cellTextLimit = TABLE_CLIPBOARD_CELL_TEXT_LIMIT
) {
  const text = input.replace(/\r\n?/g, '\n');
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  let cellStart = true;
  let sawTab = false;

  const appendCell = () => {
    row.push(cell);
    cell = '';
    cellStart = true;
  };
  const appendRow = () => {
    appendCell();
    rows.push(row);
    row = [];
  };

  for(let index = 0; index < text.length; ++index) {
    const character = text[index];
    if(quoted) {
      if(character !== '"') {
        cell += character;
      } else if(text[index + 1] === '"') {
        cell += '"';
        ++index;
      } else {
        quoted = false;
      }
      continue;
    }

    if(character === '"' && cellStart) {
      quoted = true;
      cellStart = false;
    } else if(character === '\t') {
      sawTab = true;
      appendCell();
    } else if(character === '\n') {
      appendRow();
    } else {
      cell += character;
      cellStart = false;
    }
  }
  if(quoted) return;
  appendRow();
  const lastRow = rows[rows.length - 1];
  if(text.endsWith('\n') && lastRow?.length === 1 && lastRow[0] === '') {
    rows.pop();
  }
  if(!sawTab || rows.flat().length < 2) return;
  if(rows.some((cells) => cells.some((value) => value.length > cellTextLimit))) return;

  const width = Math.max(...rows.map((cells) => cells.length));
  rows.forEach((cells) => {
    while(cells.length < width) cells.push('');
  });
  return rows;
}

function chatTableClipboardCellContent(value: string, schema: Schema) {
  const paragraph = schema.nodes.paragraph;
  if(!paragraph) return;
  const lines = value.split('\n');
  const inline: ProseMirrorNode[] = [];
  lines.forEach((line, index) => {
    if(index && schema.nodes.hardBreak) inline.push(schema.nodes.hardBreak.create());
    if(line) inline.push(schema.text(line));
  });
  return paragraph.create(null, inline);
}

export function parseChatTableClipboardText(
  text: string,
  schema: Schema,
  plain = false
) {
  if(plain) return;
  const rows = parseChatTableClipboardRows(text);
  const table = schema.nodes.table;
  const tableRow = schema.nodes.tableRow;
  const tableCell = schema.nodes.tableCell;
  if(!rows || !table || !tableRow || !tableCell) return;

  const content = rows.map((cells) => tableRow.create(
    null,
    cells.map((value) => {
      const cellContent = chatTableClipboardCellContent(value, schema);
      return cellContent ? tableCell.create(null, cellContent) : tableCell.createAndFill();
    })
  ));
  return new Slice(Fragment.from(table.create(null, content)), 0, 0);
}

function richTextAttribute(value: unknown): RichText | undefined {
  return value &&
    typeof value === 'object' &&
    typeof((value as RichText)._) === 'string' ?
    value as RichText :
    undefined;
}

function tableTitlePlainText(node: ProseMirrorNode) {
  const title = typeof(node.attrs.title) === 'string' ? node.attrs.title : '';
  const richTitle = richTextAttribute(node.attrs.titleRichText);
  if(!richTitle) return title;

  try {
    const richPlainText = richTextPlainText(richTitle);
    return !title || richPlainText === title ? richPlainText : title;
  } catch{
    return title;
  }
}

function appendTableCaption(
  serializer: DOMSerializer,
  table: HTMLTableElement,
  node: ProseMirrorNode,
  ownerDocument: Document,
  titleNode?: ProseMirrorNode
) {
  if(titleNode) {
    if(!titleNode.content.size) return;
    const caption = table.appendChild(ownerDocument.createElement('caption'));
    serializer.serializeFragment(
      titleNode.content,
      {document: ownerDocument},
      caption
    );
    return;
  }

  const title = typeof(node.attrs.title) === 'string' ? node.attrs.title : '';
  const richTitle = richTextAttribute(node.attrs.titleRichText);
  if(!title && !richTitle) return;

  const caption = table.appendChild(ownerDocument.createElement('caption'));
  if(richTitle) {
    try {
      const richPlainText = richTextPlainText(richTitle);
      if(!title || richPlainText === title) {
        const paragraph = node.type.schema.nodeFromJSON({
          type: 'paragraph',
          content: richTextToTiptapInlineContent(richTitle)
        });
        serializer.serializeFragment(
          paragraph.content,
          {document: ownerDocument},
          caption
        );
        return;
      }
    } catch{
      // A clipboard payload must remain usable even if a stale rich title no
      // longer matches the editor schema.
    }
  }

  caption.textContent = title;
}

function booleanTableAttribute(
  attrs: ProseMirrorNode['attrs'],
  currentName: string,
  telegramTtName: string,
  defaultValue: boolean
) {
  const value = attrs[currentName] ?? attrs[telegramTtName];
  return value === undefined || value === null ? defaultValue : value !== false;
}

function tableCellSpan(value: unknown) {
  return typeof value === 'number' && Number.isInteger(value) && value > 1 ?
    value :
    undefined;
}

function tableCellHorizontalAlign(node: ProseMirrorNode) {
  const value = node.attrs.align || node.attrs.textAlign;
  return value === 'left' || value === 'center' || value === 'right' ? value : undefined;
}

function tableCellVerticalAlign(node: ProseMirrorNode) {
  const value = node.attrs.verticalAlign || node.attrs.valign;
  return value === 'top' || value === 'middle' || value === 'bottom' ? value : undefined;
}

function renderTableCell(
  serializer: DOMSerializer,
  node: ProseMirrorNode,
  ownerDocument: Document
) {
  const header = node.type.name === 'tableHeader' || node.attrs.isHighlighted === true;
  const element = ownerDocument.createElement(header ? 'th' : 'td');
  const colspan = tableCellSpan(node.attrs.colspan);
  const rowspan = tableCellSpan(node.attrs.rowspan);
  const align = tableCellHorizontalAlign(node);
  const verticalAlign = tableCellVerticalAlign(node);

  if(colspan) element.colSpan = colspan;
  if(rowspan) element.rowSpan = rowspan;
  if(align) element.setAttribute('align', align);
  if(verticalAlign) element.setAttribute('valign', verticalAlign);

  node.forEach((block, _offset, index) => {
    if(index) element.append(ownerDocument.createElement('br'));
    serializer.serializeFragment(block.content, {document: ownerDocument}, element);
  });

  return element;
}

function renderTable(
  serializer: DOMSerializer,
  node: ProseMirrorNode,
  ownerDocument: Document,
  titleNode?: ProseMirrorNode
) {
  const table = ownerDocument.createElement('table');
  table.toggleAttribute(
    'bordered',
    booleanTableAttribute(node.attrs, 'bordered', 'isBordered', true)
  );
  table.toggleAttribute(
    'striped',
    booleanTableAttribute(node.attrs, 'striped', 'isStriped', false)
  );
  table.toggleAttribute(
    'compact',
    booleanTableAttribute(node.attrs, 'compact', 'isCompact', false)
  );
  appendTableCaption(serializer, table, node, ownerDocument, titleNode);

  const body = table.appendChild(ownerDocument.createElement('tbody'));
  serializer.serializeFragment(node.content, {document: ownerDocument}, body);
  return table;
}

export function buildChatTableClipboardSerializer(
  schema: Schema,
  ownerDocument: Document = document
) {
  const nodes = {...DOMSerializer.nodesFromSchema(schema)};
  const serializer = new DOMSerializer(nodes, DOMSerializer.marksFromSchema(schema));

  nodes.table = (node) => renderTable(serializer, node, ownerDocument);
  nodes[CHAT_TABLE_WRAPPER_NODE_NAME] = (node) => renderTable(
    serializer,
    node.child(1),
    ownerDocument,
    node.child(0)
  );
  nodes.tableRow = () => ['tr', 0];
  nodes.tableCell = (node) => renderTableCell(serializer, node, ownerDocument);
  nodes.tableHeader = (node) => renderTableCell(serializer, node, ownerDocument);

  return serializer;
}

function booleanDataAttribute(table: HTMLTableElement, name: 'bordered' | 'striped' | 'compact') {
  const dataName = `data-${name}`;
  if(table.hasAttribute(dataName)) {
    const value = table.getAttribute(dataName)?.trim().toLowerCase();
    return value !== 'false' && value !== '0' && value !== 'no';
  }

  if(table.hasAttribute(name) || table.classList.contains(name)) return true;
  return name === 'bordered';
}

function directTableCaption(table: HTMLTableElement) {
  return Array.from(table.children).find(
    (child): child is HTMLTableCaptionElement => child.tagName === 'CAPTION'
  );
}

function normalizeTable(table: HTMLTableElement) {
  const bordered = booleanDataAttribute(table, 'bordered');
  const striped = booleanDataAttribute(table, 'striped');
  const compact = booleanDataAttribute(table, 'compact');
  const caption = directTableCaption(table);
  const exportedWrapper = table.parentElement?.matches('figure.table-wrap') ?
    table.parentElement :
    undefined;
  const exportedTitle = exportedWrapper && Array.from(exportedWrapper.children).find(
    (child): child is HTMLElement => child !== table && child.classList.contains('table-title')
  );
  const currentWrapper = table.parentElement?.matches(
    `div[${CHAT_TABLE_WRAPPER_DATA_ATTRIBUTE}]`
  ) ? table.parentElement : undefined;
  const wrapper = currentWrapper || table.ownerDocument.createElement('div');
  wrapper.setAttribute(CHAT_TABLE_WRAPPER_DATA_ATTRIBUTE, '');
  let title = Array.from(wrapper.children).find(
    (child): child is HTMLElement => child.hasAttribute(CHAT_TABLE_TITLE_DATA_ATTRIBUTE)
  );
  if(!title) {
    title = table.ownerDocument.createElement('div');
    title.setAttribute(CHAT_TABLE_TITLE_DATA_ATTRIBUTE, '');
  }

  if(caption) {
    title.replaceChildren(...Array.from(caption.childNodes));
    caption.remove();
  } else if(exportedTitle) {
    title.replaceChildren(...Array.from(exportedTitle.childNodes));
  } else if(table.hasAttribute(TABLE_CLIPBOARD_TITLE_HTML_ATTRIBUTE)) {
    title.innerHTML = table.getAttribute(TABLE_CLIPBOARD_TITLE_HTML_ATTRIBUTE) || '';
  } else if(table.hasAttribute('data-table-title')) {
    title.textContent = table.getAttribute('data-table-title') || '';
  }

  table.setAttribute('data-bordered', bordered ? 'true' : 'false');
  table.setAttribute('data-striped', striped ? 'true' : 'false');
  table.setAttribute('data-compact', compact ? 'true' : 'false');
  table.removeAttribute('data-table-title');
  table.removeAttribute(TABLE_CLIPBOARD_TITLE_HTML_ATTRIBUTE);
  table.removeAttribute('bordered');
  table.removeAttribute('striped');
  table.removeAttribute('compact');
  table.classList.remove('bordered', 'striped', 'compact');

  if(!currentWrapper) {
    if(exportedWrapper) {
      exportedWrapper.replaceWith(wrapper);
    } else {
      table.replaceWith(wrapper);
    }
    wrapper.append(title, table);
  } else {
    wrapper.insertBefore(title, table);
  }
}

export function normalizeChatTableClipboardHTML(
  html: string,
  ownerDocument: Document = document
) {
  const template = ownerDocument.createElement('template');
  template.innerHTML = html;
  template.content.querySelectorAll('table').forEach(normalizeTable);
  return template.innerHTML;
}

function serializeNodePlainText(node: ProseMirrorNode, index: number, parent?: ProseMirrorNode) {
  if(node.isText) return node.text || '';

  if(node.type.name === CHAT_TABLE_WRAPPER_NODE_NAME) {
    const title = node.firstChild?.type.name === CHAT_TABLE_TITLE_NODE_NAME ?
      serializeChatTableClipboardText(node.firstChild.content, node.firstChild) :
      '';
    const table = node.lastChild?.type.name === 'table' ?
      serializeChatTableClipboardText(node.lastChild.content, node.lastChild) :
      '';
    return title && table ? `${title}\n${table}` : title || table;
  }

  if(node.type.name === 'table') {
    const title = tableTitlePlainText(node);
    const body = serializeChatTableClipboardText(node.content, node);
    return title && body ? `${title}\n${body}` : title || body;
  }

  const serializer = node.type.spec.toText;
  if(serializer) {
    return serializer({
      index,
      node,
      parent: parent || node,
      pos: 0,
      range: {from: 0, to: node.nodeSize}
    });
  }

  return serializeChatTableClipboardText(node.content, node);
}

export function serializeChatTableClipboardText(
  fragment: Fragment,
  parent?: ProseMirrorNode
) {
  const parts: string[] = [];
  fragment.forEach((node, _offset, index) => {
    parts.push(serializeNodePlainText(node, index, parent));
  });

  if(parent?.type.spec.tableRole === 'row') return parts.join('\t');
  return parts.join(parent?.inlineContent ? '' : '\n');
}

function replaceChatTableClipboardEmojiNodesInFragment(fragment: Fragment, inTable = false) {
  const nodes: ProseMirrorNode[] = [];
  fragment.forEach((node) => {
    if(inTable && node.type.name === 'customEmoji') {
      const emoji = typeof(node.attrs.emoji) === 'string' ? node.attrs.emoji : '';
      if(emoji) nodes.push(node.type.schema.text(emoji, node.marks));
      return;
    }

    nodes.push(node.copy(replaceChatTableClipboardEmojiNodesInFragment(
      node.content,
      inTable || node.type.name === 'table' || node.type.name === CHAT_TABLE_WRAPPER_NODE_NAME
    )));
  });
  return Fragment.fromArray(nodes);
}

export function replaceChatTableClipboardEmojiNodes(slice: Slice) {
  return new Slice(
    replaceChatTableClipboardEmojiNodesInFragment(slice.content),
    slice.openStart,
    slice.openEnd
  );
}

function hydratePastedTableTitle(
  node: ProseMirrorNode,
  schema: Schema,
  ownerDocument: Document
): ProseMirrorNode {
  if(node.isLeaf) return node;
  const children: ProseMirrorNode[] = [];
  node.forEach((child) => {
    children.push(hydratePastedTableTitle(child, schema, ownerDocument));
  });
  const content = Fragment.fromArray(children);
  if(node.type.name !== 'table' || typeof(node.attrs.titleRichHTML) !== 'string') {
    return node.copy(content);
  }

  let titleRichText: RichText | null = null;
  try {
    const container = ownerDocument.createElement('div');
    container.innerHTML = node.attrs.titleRichHTML;
    const document = ProseMirrorDOMParser
    .fromSchema(schema)
    .parse(container, {preserveWhitespace: 'full'});
    titleRichText = tiptapDocumentToCaptionRichText(document.toJSON());
  } catch{
    // The plain title parsed from data-table-title remains a safe fallback.
  }

  return node.type.create({
    ...node.attrs,
    titleRichHTML: null,
    titleRichText
  }, content, node.marks);
}

function hydratePastedTableTitles(
  slice: Slice,
  schema: Schema,
  ownerDocument: Document
) {
  const nodes: ProseMirrorNode[] = [];
  slice.content.forEach((node) => {
    nodes.push(hydratePastedTableTitle(node, schema, ownerDocument));
  });
  return new Slice(Fragment.fromArray(nodes), slice.openStart, slice.openEnd);
}

export function createChatTableClipboardPlugin(
  schema: Schema,
  ownerDocument: Document = document
) {
  return new Plugin({
    props: {
      clipboardSerializer: buildChatTableClipboardSerializer(schema, ownerDocument),
      clipboardTextSerializer: ({content}) => serializeChatTableClipboardText(content),
      clipboardTextParser: (text, _context, plain) => (
        parseChatTableClipboardText(text, schema, plain) as Slice
      ),
      transformPasted: (slice) => hydratePastedTableTitles(slice, schema, ownerDocument),
      transformPastedHTML: (html) => normalizeChatTableClipboardHTML(html, ownerDocument)
    }
  });
}

export const ChatTableClipboard = Extension.create({
  name: 'chatTableClipboard',

  addProseMirrorPlugins() {
    return [createChatTableClipboardPlugin(this.editor.schema)];
  }
});
