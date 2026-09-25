import type {Editor, JSONContent} from '@tiptap/core';
import {Fragment, Schema, type Node as ProseMirrorNode} from '@tiptap/pm/model';
import {CellSelection, TableMap} from '@tiptap/pm/tables';
import '@/tests/mocks/chatInputEditorTableUi';
import {mountChatInputEditor} from '@/tests/helpers/chatInputEditor';
import {
  buildChatTableClipboardSerializer,
  normalizeChatTableClipboardHTML,
  parseChatTableClipboardRows,
  serializeChatTableClipboardText,
  TABLE_CLIPBOARD_CELL_TEXT_LIMIT,
  TABLE_CLIPBOARD_TITLE_HTML_ATTRIBUTE
} from '@components/chat/inputEditor/tableClipboard';
import {
  CHAT_TABLE_TITLE_DATA_ATTRIBUTE,
  CHAT_TABLE_TITLE_NODE_NAME,
  CHAT_TABLE_WRAPPER_DATA_ATTRIBUTE,
  CHAT_TABLE_WRAPPER_NODE_NAME
} from '@components/chat/inputEditor/tableSchema';
import type {ChatInputEditor} from '@components/chat/inputEditor/types';

vi.hoisted(() => {
  class ClipboardEventMock extends Event {}
  Object.defineProperty(window, 'CSS', {
    configurable: true,
    value: {supports: () => false}
  });
  Object.defineProperty(window, 'ClipboardEvent', {
    configurable: true,
    value: ClipboardEventMock
  });
});

const schema = new Schema({
  nodes: {
    doc: {content: 'block+'},
    paragraph: {
      content: 'inline*',
      group: 'block',
      toDOM: () => ['p', 0]
    },
    text: {group: 'inline'},
    hardBreak: {
      group: 'inline',
      inline: true,
      toDOM: () => ['br'],
      toText: () => '\n'
    },
    [CHAT_TABLE_WRAPPER_NODE_NAME]: {
      content: `${CHAT_TABLE_TITLE_NODE_NAME} table`,
      group: 'block',
      isolating: true,
      toDOM: () => ['div', {[CHAT_TABLE_WRAPPER_DATA_ATTRIBUTE]: ''}, 0]
    },
    [CHAT_TABLE_TITLE_NODE_NAME]: {
      content: 'inline*',
      toDOM: () => ['div', {[CHAT_TABLE_TITLE_DATA_ATTRIBUTE]: ''}, 0]
    },
    table: {
      attrs: {
        bordered: {default: true},
        striped: {default: false},
        title: {default: ''},
        titleRichText: {default: null}
      },
      content: 'tableRow+',
      group: 'block',
      tableRole: 'table',
      toDOM: () => ['table', ['tbody', 0]]
    },
    tableRow: {
      content: '(tableCell | tableHeader)+',
      tableRole: 'row',
      toDOM: () => ['tr', 0]
    },
    tableCell: {
      attrs: {
        align: {default: null},
        colspan: {default: 1},
        isHighlighted: {default: false},
        rowspan: {default: 1},
        verticalAlign: {default: null}
      },
      content: 'paragraph+',
      isolating: true,
      tableRole: 'cell',
      toDOM: () => ['td', 0]
    },
    tableHeader: {
      attrs: {
        align: {default: null},
        colspan: {default: 1},
        isHighlighted: {default: false},
        rowspan: {default: 1},
        verticalAlign: {default: null}
      },
      content: 'paragraph+',
      isolating: true,
      tableRole: 'header_cell',
      toDOM: () => ['th', 0]
    }
  },
  marks: {
    bold: {
      parseDOM: [{tag: 'strong'}],
      toDOM: () => ['strong', 0]
    },
    italic: {
      parseDOM: [{tag: 'em'}],
      toDOM: () => ['em', 0]
    }
  }
});

function tableNode() {
  return schema.nodeFromJSON({
    type: CHAT_TABLE_WRAPPER_NODE_NAME,
    content: [
      {
        type: CHAT_TABLE_TITLE_NODE_NAME,
        content: [
          {type: 'text', text: 'Quarter '},
          {type: 'text', marks: [{type: 'bold'}], text: 'report'}
        ]
      },
      {
        type: 'table',
        attrs: {
          bordered: true,
          striped: true
        },
        content: [{
          type: 'tableRow',
          content: [
            {
              type: 'tableHeader',
              attrs: {
                align: 'center',
                colspan: 2,
                rowspan: 3,
                verticalAlign: 'middle'
              },
              content: [
                {type: 'paragraph', content: [{type: 'text', text: 'First'}]},
                {
                  type: 'paragraph',
                  content: [{
                    type: 'text',
                    marks: [{type: 'italic'}],
                    text: 'Second'
                  }]
                }
              ]
            },
            {
              type: 'tableCell',
              attrs: {align: 'right', verticalAlign: 'bottom'},
              content: [{type: 'paragraph', content: [{type: 'text', text: 'Value'}]}]
            }
          ]
        }]
      }
    ]
  });
}

describe('chat input table clipboard', () => {
  test('parses spreadsheet TSV including quoted tabs, line breaks and quotes', () => {
    expect(parseChatTableClipboardRows(
      'A\t"B\tB"\r\n"C\nC"\t"Say ""hello"""\r\n'
    )).toEqual([
      ['A', 'B\tB'],
      ['C\nC', 'Say "hello"']
    ]);
    expect(parseChatTableClipboardRows('plain text')).toBeUndefined();
    expect(parseChatTableClipboardRows(
      `${'x'.repeat(TABLE_CLIPBOARD_CELL_TEXT_LIMIT + 1)}\ty`
    )).toBeUndefined();
  });

  test('serializes a table as semantic Bot API HTML', () => {
    const serializer = buildChatTableClipboardSerializer(schema);
    const container = document.createElement('div');
    container.append(serializer.serializeNode(tableNode(), {document}));

    const table = container.querySelector('table')!;
    expect(table.hasAttribute('bordered')).toBe(true);
    expect(table.hasAttribute('striped')).toBe(true);
    expect(table.querySelector(':scope > caption')?.innerHTML).toBe(
      'Quarter <strong>report</strong>'
    );
    expect(table.querySelector(':scope > tbody')).toBeTruthy();

    const header = table.querySelector('th')!;
    expect(header.colSpan).toBe(2);
    expect(header.rowSpan).toBe(3);
    expect(header.getAttribute('align')).toBe('center');
    expect(header.getAttribute('valign')).toBe('middle');
    expect(header.innerHTML).toBe('First<br><em>Second</em>');

    const cell = table.querySelector('td')!;
    expect(cell.getAttribute('align')).toBe('right');
    expect(cell.getAttribute('valign')).toBe('bottom');
    expect(cell.textContent).toBe('Value');
  });

  test('uses a th for telegram-tt highlighted cells', () => {
    const highlighted = schema.nodeFromJSON({
      type: 'table',
      content: [{
        type: 'tableRow',
        content: [{
          type: 'tableCell',
          attrs: {isHighlighted: true},
          content: [{type: 'paragraph', content: [{type: 'text', text: 'Marked'}]}]
        }]
      }]
    });
    const serializer = buildChatTableClipboardSerializer(schema);
    const container = document.createElement('div');
    container.append(serializer.serializeNode(highlighted, {document}));

    expect(container.querySelector('th')?.textContent).toBe('Marked');
    expect(container.querySelector('td')).toBeNull();
  });

  test('normalizes captions and Telegram boolean attributes for the editor schema', () => {
    const normalized = normalizeChatTableClipboardHTML(`
      <table bordered striped>
        <caption><strong>Quarter</strong> <em>report</em></caption>
        <tbody><tr><td>A</td></tr></tbody>
      </table>
      <table><tbody><tr><td>B</td></tr></tbody></table>
      <table data-bordered="false" data-striped="true">
        <tbody><tr><td>C</td></tr></tbody>
      </table>
    `);
    const template = document.createElement('template');
    template.innerHTML = normalized;
    const wrappers = template.content.querySelectorAll(
      `[${CHAT_TABLE_WRAPPER_DATA_ATTRIBUTE}]`
    );
    const titles = template.content.querySelectorAll(
      `[${CHAT_TABLE_TITLE_DATA_ATTRIBUTE}]`
    );
    const tables = template.content.querySelectorAll('table');

    expect(wrappers).toHaveLength(3);
    expect(titles[0].innerHTML).toBe(
      '<strong>Quarter</strong> <em>report</em>'
    );
    expect(tables[0].querySelector('caption')).toBeNull();
    expect(tables[0].hasAttribute('data-table-title')).toBe(false);
    expect(tables[0].hasAttribute(TABLE_CLIPBOARD_TITLE_HTML_ATTRIBUTE)).toBe(false);
    expect(tables[0].getAttribute('data-bordered')).toBe('true');
    expect(tables[0].getAttribute('data-striped')).toBe('true');
    expect(tables[0].hasAttribute('bordered')).toBe(false);
    expect(tables[0].hasAttribute('striped')).toBe(false);

    expect(tables[1].getAttribute('data-bordered')).toBe('true');
    expect(tables[1].getAttribute('data-striped')).toBe('false');
    expect(tables[2].getAttribute('data-bordered')).toBe('false');
    expect(tables[2].getAttribute('data-striped')).toBe('true');
  });

  test('serializes cells with tabs, rows and blocks with newlines, and includes the title', () => {
    const before = schema.node(
      'paragraph',
      undefined,
      schema.text('Before')
    );
    const table = schema.nodeFromJSON({
      type: CHAT_TABLE_WRAPPER_NODE_NAME,
      content: [
        {
          type: CHAT_TABLE_TITLE_NODE_NAME,
          content: [{type: 'text', text: 'Stats'}]
        },
        {
          type: 'table',
          content: [
            {
              type: 'tableRow',
              content: [
                {
                  type: 'tableCell',
                  content: [{type: 'paragraph', content: [{type: 'text', text: 'A'}]}]
                },
                {
                  type: 'tableCell',
                  content: [
                    {type: 'paragraph', content: [{type: 'text', text: 'B1'}]},
                    {type: 'paragraph', content: [{type: 'text', text: 'B2'}]}
                  ]
                }
              ]
            },
            {
              type: 'tableRow',
              content: [
                {
                  type: 'tableCell',
                  content: [{type: 'paragraph', content: [{type: 'text', text: 'C'}]}]
                },
                {
                  type: 'tableCell',
                  content: [{type: 'paragraph', content: [{type: 'text', text: 'D'}]}]
                }
              ]
            }
          ]
        }
      ]
    });
    const after = schema.node('paragraph', undefined, schema.text('After'));

    expect(serializeChatTableClipboardText(Fragment.fromArray([before, table, after]))).toBe(
      'Before\nStats\nA\tB1\nB2\nC\tD\nAfter'
    );
  });
});

function integratedTableDocument(): JSONContent {
  return {
    type: 'doc',
    content: [{
      type: 'table',
      attrs: {
        bordered: true,
        striped: true,
        title: 'Quarter report',
        titleRichText: {
          _: 'textConcat',
          texts: [
            {_: 'textPlain', text: 'Quarter '},
            {_: 'textBold', text: {_: 'textPlain', text: 'report'}}
          ]
        }
      },
      content: [
        {
          type: 'tableRow',
          content: [
            {
              type: 'tableHeader',
              attrs: {align: 'center', verticalAlign: 'middle'},
              content: [{type: 'paragraph', content: [{type: 'text', text: 'A'}]}]
            },
            {
              type: 'tableHeader',
              content: [{type: 'paragraph', content: [{type: 'text', text: 'B'}]}]
            }
          ]
        },
        {
          type: 'tableRow',
          content: [
            {
              type: 'tableCell',
              content: [{type: 'paragraph', content: [{type: 'text', text: 'C'}]}]
            },
            {
              type: 'tableCell',
              content: [{type: 'paragraph', content: [{type: 'text', text: 'D'}]}]
            }
          ]
        }
      ]
    }]
  };
}

function currentTable(tiptap: Editor) {
  let table: ProseMirrorNode;
  let position = -1;
  tiptap.state.doc.descendants((node, nodePosition) => {
    if(table || node.type.name !== 'table') return;
    table = node;
    position = nodePosition;
    return false;
  });
  expect(table!).toBeTruthy();
  return {position, table: table!};
}

function pasteClipboardText(input: HTMLElement, text: string) {
  const event = new Event('paste', {bubbles: true, cancelable: true});
  Object.defineProperty(event, 'clipboardData', {
    value: {
      getData: (type: string) => type === 'text/plain' || type === 'Text' ? text : ''
    }
  });
  return input.dispatchEvent(event);
}

describe('chat input table clipboard integration', () => {
  const editors: ChatInputEditor[] = [];

  function mountEditor() {
    const mounted = mountChatInputEditor();
    editors.push(mounted.editor);
    return mounted;
  }

  afterEach(() => {
    editors.splice(0).forEach((editor) => editor.destroy());
    document.body.replaceChildren();
  });

  test('copies a whole CellSelection with its rich title and semantic table text', () => {
    const {editor, tiptap} = mountEditor();
    expect(editor.setDocument(integratedTableDocument())).toBe(true);
    const {position, table} = currentTable(tiptap);
    const map = TableMap.get(table);
    tiptap.view.dispatch(tiptap.state.tr.setSelection(CellSelection.create(
      tiptap.state.doc,
      position + 1 + map.map[0],
      position + 1 + map.map[map.map.length - 1]
    )));

    const copied = tiptap.view.serializeForClipboard(tiptap.state.selection.content());
    const copiedTable = copied.dom.querySelector('table')!;
    expect(copied.text).toBe('Quarter report\nA\tB\nC\tD');
    expect(copiedTable.querySelector('caption')?.innerHTML).toBe(
      'Quarter <strong>report</strong>'
    );
    expect(copiedTable.hasAttribute('bordered')).toBe(true);
    expect(copiedTable.hasAttribute('striped')).toBe(true);
    expect(copiedTable.querySelectorAll('tbody > tr')).toHaveLength(2);
    expect(copiedTable.querySelectorAll('th')).toHaveLength(2);
    expect(copiedTable.querySelector('th')?.getAttribute('align')).toBe('center');
    expect(copiedTable.querySelector('th')?.getAttribute('valign')).toBe('middle');
  });

  test('copies a partial CellSelection without the table title', () => {
    const {editor, tiptap} = mountEditor();
    expect(editor.setDocument(integratedTableDocument())).toBe(true);
    const {position, table} = currentTable(tiptap);
    const map = TableMap.get(table);
    tiptap.view.dispatch(tiptap.state.tr.setSelection(CellSelection.create(
      tiptap.state.doc,
      position + 1 + map.map[0],
      position + 1 + map.map[1]
    )));

    const copied = tiptap.view.serializeForClipboard(tiptap.state.selection.content());
    const copiedTable = copied.dom.querySelector('table')!;
    expect(copied.text).toBe('A\tB');
    expect(copiedTable.querySelector('caption')).toBeNull();
    expect(copiedTable.querySelectorAll('tbody > tr')).toHaveLength(1);
  });

  test('hydrates a pasted semantic caption into title RichText and table attributes', () => {
    const {tiptap} = mountEditor();
    expect(tiptap.view.pasteHTML(`
      <table bordered striped>
        <caption><strong>Quarter</strong> <em>report</em></caption>
        <tbody>
          <tr>
            <th colspan="2" align="right" valign="bottom"><p>Heading</p></th>
          </tr>
          <tr>
            <td><p>A</p></td>
            <td><p>B</p></td>
          </tr>
        </tbody>
      </table>
    `)).toBe(true);

    const wrapper = tiptap.state.doc.firstChild!;
    expect(wrapper.type.name).toBe(CHAT_TABLE_WRAPPER_NODE_NAME);
    const title = wrapper.firstChild!;
    const table = wrapper.lastChild!;
    expect(title.type.name).toBe(CHAT_TABLE_TITLE_NODE_NAME);
    expect(title.toJSON()).toMatchObject({
      content: [
        {marks: [{type: 'bold'}], text: 'Quarter', type: 'text'},
        {text: ' ', type: 'text'},
        {marks: [{type: 'italic'}], text: 'report', type: 'text'}
      ]
    });
    expect(table.attrs).toMatchObject({
      bordered: true,
      striped: true
    });
    const heading = table.firstChild?.firstChild;
    expect(heading?.type.name).toBe('tableHeader');
    expect(heading?.attrs).toMatchObject({
      align: 'right',
      colspan: 2,
      verticalAlign: 'bottom'
    });
  });

  test('imports spreadsheet TSV as a bordered table with multiline cells', () => {
    const {input, tiptap} = mountEditor();
    pasteClipboardText(input, 'A\tB\n"C\nC"\t"Say ""hello"""');

    const wrapper = tiptap.state.doc.firstChild!;
    expect(wrapper.type.name).toBe(CHAT_TABLE_WRAPPER_NODE_NAME);
    const table = wrapper.lastChild!;
    expect(table.attrs.bordered).toBe(true);
    expect(table.firstChild?.firstChild?.type.name).toBe('tableCell');
    expect([...Array(table.childCount)].map((_, row) => (
      [...Array(table.child(row).childCount)].map((__, column) => (
        table.child(row).child(column).textContent
      ))
    ))).toEqual([
      ['A', 'B'],
      ['CC', 'Say "hello"']
    ]);
    expect(table.child(1).child(0).firstChild?.toJSON().content).toEqual([
      {type: 'text', text: 'C'},
      {type: 'hardBreak'},
      {type: 'text', text: 'C'}
    ]);
  });

  test('replaces the selected table range from TSV and keeps forced plain paste plain', () => {
    const {editor, input, tiptap} = mountEditor();
    expect(editor.setDocument(integratedTableDocument())).toBe(true);
    let current = currentTable(tiptap);
    const map = TableMap.get(current.table);
    tiptap.view.dispatch(tiptap.state.tr.setSelection(CellSelection.create(
      tiptap.state.doc,
      current.position + 1 + map.map[0],
      current.position + 1 + map.map[map.map.length - 1]
    )));

    pasteClipboardText(input, '1\t2\n3\t4');
    current = currentTable(tiptap);
    expect(current.table.textContent).toBe('1234');
    let tableCount = 0;
    tiptap.state.doc.descendants((node) => {
      if(node.type.name === 'table') ++tableCount;
    });
    expect(tableCount).toBe(1);

    tiptap.commands.setTextSelection(tiptap.state.doc.content.size - 1);
    expect(tiptap.view.pasteText('plain\ttext')).toBe(true);
    current = currentTable(tiptap);
    expect(current.table.textContent).toBe('1234');
    expect(tiptap.state.doc.textContent).toContain('plain\ttext');
  });
});
