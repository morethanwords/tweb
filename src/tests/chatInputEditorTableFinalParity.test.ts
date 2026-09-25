import type {Editor, JSONContent} from '@tiptap/core';
import {
  Fragment,
  Schema,
  Slice,
  type Node as ProseMirrorNode
} from '@tiptap/pm/model';
import {CellSelection, TableMap} from '@tiptap/pm/tables';
import '@/tests/mocks/chatInputEditorTableUi';
import {mountChatInputEditor} from '@/tests/helpers/chatInputEditor';
import {
  buildChatTableClipboardSerializer,
  replaceChatTableClipboardEmojiNodes
} from '@components/chat/inputEditor/tableClipboard';
import {
  CHAT_TABLE_TITLE_DATA_ATTRIBUTE,
  CHAT_TABLE_TITLE_NODE_NAME,
  CHAT_TABLE_WRAPPER_DATA_ATTRIBUTE,
  CHAT_TABLE_WRAPPER_NODE_NAME
} from '@components/chat/inputEditor/tableSchema';
import type {ChatInputEditor} from '@components/chat/inputEditor/types';
import type {RichMessage} from '@layer';
import I18n from '@lib/langPack';


const clipboardSchema = new Schema({
  nodes: {
    doc: {content: 'block+'},
    paragraph: {
      content: 'inline*',
      group: 'block',
      toDOM: () => ['p', 0]
    },
    text: {group: 'inline'},
    customEmoji: {
      atom: true,
      attrs: {
        documentId: {default: ''},
        emoji: {default: ''}
      },
      group: 'inline',
      inline: true,
      toDOM: (node) => [
        'span',
        {
          'data-doc-id': node.attrs.documentId,
          'data-sticker-emoji': node.attrs.emoji
        }
      ]
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
        striped: {default: false}
      },
      content: 'tableRow+',
      group: 'block',
      tableRole: 'table',
      toDOM: () => ['table', ['tbody', 0]]
    },
    tableRow: {
      content: 'tableCell+',
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
      tableRole: 'cell',
      toDOM: () => ['td', 0]
    }
  }
});

function tableDocument(
  rows: string[][],
  {title = ''}: {title?: string} = {}
): JSONContent {
  return {
    type: 'doc',
    content: [{
      type: CHAT_TABLE_WRAPPER_NODE_NAME,
      content: [{
        type: CHAT_TABLE_TITLE_NODE_NAME,
        content: title ? [{type: 'text', text: title}] : undefined
      }, {
        type: 'table',
        content: rows.map((row) => ({
          type: 'tableRow',
          content: row.map((text) => ({
            type: 'tableCell',
            content: [{
              type: 'paragraph',
              content: text ? [{type: 'text', text}] : undefined
            }]
          }))
        }))
      }]
    }]
  };
}

function documentNodePosition(tiptap: Editor, type: string) {
  let found = -1;
  tiptap.state.doc.descendants((node, position) => {
    if(found >= 0 || node.type.name !== type) return;
    found = position;
    return false;
  });
  expect(found).toBeGreaterThanOrEqual(0);
  return found;
}

function tableData(tiptap: Editor) {
  let table: ProseMirrorNode;
  let tablePosition = -1;
  tiptap.state.doc.descendants((node, position) => {
    if(table || node.type.name !== 'table') return;
    table = node;
    tablePosition = position;
    return false;
  });
  expect(table!).toBeTruthy();
  const map = TableMap.get(table!);
  return {
    map,
    positions: map.map.map((position) => tablePosition + 1 + position),
    table: table!,
    tablePosition
  };
}

function pointerEvent(
  type: string,
  {
    clientX = 0,
    clientY = 0,
    pointerId = 1
  }: {
    clientX?: number,
    clientY?: number,
    pointerId?: number
  } = {}
) {
  const event = new MouseEvent(type, {
    bubbles: true,
    button: 0,
    cancelable: true,
    clientX,
    clientY
  });
  Object.defineProperties(event, {
    isPrimary: {value: true},
    pointerId: {value: pointerId}
  });
  return event as PointerEvent;
}

function pressKey(target: EventTarget, key: string) {
  const event = new KeyboardEvent('keydown', {
    bubbles: true,
    cancelable: true,
    key
  });
  target.dispatchEvent(event);
  return event;
}

function openGripMenu(input: HTMLElement, pointerId: number) {
  const grip = input.querySelector<HTMLButtonElement>('.chat-input-table-grip')!;
  grip.dispatchEvent(pointerEvent('pointerdown', {pointerId}));
  document.dispatchEvent(pointerEvent('pointerup', {pointerId}));
  return {
    grip,
    menu: document.body.querySelector<HTMLElement>('.chat-input-table-menu')!
  };
}

function menuButton(menu: HTMLElement, label: Parameters<typeof I18n.format>[0]) {
  const ariaLabel = I18n.format(label, true);
  return Array.from(menu.querySelectorAll<HTMLElement>('.btn-menu-item')).find(
    (button) => button.getAttribute('aria-label') === ariaLabel
  );
}

function menuButtonIcon(
  menu: HTMLElement,
  label: Parameters<typeof I18n.format>[0]
) {
  return menuButton(menu, label)
  ?.querySelector<HTMLElement>('.btn-menu-item-icon:not(.btn-menu-item-icon-right)')
  ?.dataset.icon;
}

function mockTableGeometry(input: HTMLElement, rows: number, columns: number) {
  const wrapper = input.querySelector<HTMLElement>('.chat-input-table-wrapper')!;
  const scroll = wrapper.firstElementChild as HTMLElement;
  const table = input.querySelector<HTMLTableElement>('table.chat-input-table')!;
  const tableLeft = 16;
  const tableTop = 16;
  const cellWidth = 80;
  const cellHeight = 40;
  const tableWidth = columns * cellWidth;
  const tableHeight = rows * cellHeight;

  wrapper.getBoundingClientRect = () => new DOMRect(
    0,
    0,
    tableWidth + tableLeft,
    tableHeight + tableTop
  );
  scroll.getBoundingClientRect = () => new DOMRect(
    tableLeft,
    tableTop,
    tableWidth,
    tableHeight
  );
  table.getBoundingClientRect = () => new DOMRect(
    tableLeft,
    tableTop,
    tableWidth,
    tableHeight
  );
  Array.from(table.rows).forEach((row, rowIndex) => {
    row.getBoundingClientRect = () => new DOMRect(
      tableLeft,
      tableTop + rowIndex * cellHeight,
      tableWidth,
      cellHeight
    );
    Array.from(row.cells).forEach((cell, columnIndex) => {
      cell.getBoundingClientRect = () => new DOMRect(
        tableLeft + columnIndex * cellWidth,
        tableTop + rowIndex * cellHeight,
        cellWidth,
        cellHeight
      );
    });
  });
}

async function flushTableChrome() {
  await Promise.resolve();
  await Promise.resolve();
}

describe('telegram-tt final table parity', () => {
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

  test('serializes custom emoji in a semantic table as its Unicode fallback', () => {
    const wrapper = clipboardSchema.nodeFromJSON({
      type: CHAT_TABLE_WRAPPER_NODE_NAME,
      content: [{
        type: CHAT_TABLE_TITLE_NODE_NAME,
        content: [
          {type: 'text', text: 'Mood '},
          {
            type: 'customEmoji',
            attrs: {documentId: '101', emoji: '🦊'}
          }
        ]
      }, {
        type: 'table',
        content: [{
          type: 'tableRow',
          content: [{
            type: 'tableCell',
            content: [{
              type: 'paragraph',
              content: [
                {type: 'text', text: 'Result '},
                {
                  type: 'customEmoji',
                  attrs: {documentId: '202', emoji: '🧪'}
                }
              ]
            }]
          }]
        }]
      }]
    });
    const copied = replaceChatTableClipboardEmojiNodes(
      new Slice(Fragment.from(wrapper), 0, 0)
    );
    const serializer = buildChatTableClipboardSerializer(clipboardSchema);
    const container = document.createElement('div');
    container.append(serializer.serializeNode(copied.content.firstChild!, {document}));

    const table = container.querySelector('table')!;
    expect(table.querySelector('caption')?.textContent).toBe('Mood 🦊');
    expect(table.querySelector('td')?.textContent).toBe('Result 🧪');
    expect(table.querySelector('[data-doc-id], [data-sticker-emoji], span, img')).toBeNull();
  });

  test('Escape cancels an active range-handle pointer session', async() => {
    const {editor, input, tiptap} = mountEditor();
    expect(editor.setDocument(tableDocument([
      ['A', 'B'],
      ['C', 'D']
    ]))).toBe(true);
    const data = tableData(tiptap);
    editor.restoreSelection({
      from: data.positions[0] + 2,
      to: data.positions[0] + 2
    }, false);
    mockTableGeometry(input, 2, 2);
    await flushTableChrome();

    const tableWrapper = input.querySelector<HTMLElement>(
      '.chat-input-table-wrapper'
    )!;
    const handle = input.querySelector<HTMLButtonElement>(
      '.chat-input-table-range-handle'
    )!;
    handle.dispatchEvent(pointerEvent('pointerdown', {
      clientX: 96,
      clientY: 56,
      pointerId: 31
    }));
    document.dispatchEvent(pointerEvent('pointermove', {
      clientX: 136,
      clientY: 36,
      pointerId: 31
    }));
    const selectionBeforeEscape = tiptap.state.selection;
    expect(selectionBeforeEscape).toBeInstanceOf(CellSelection);
    expect(tableWrapper.classList.contains('chat-input-table-range-dragging')).toBe(true);

    const escape = new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      key: 'Escape'
    });
    document.dispatchEvent(escape);
    expect(escape.defaultPrevented).toBe(true);
    expect(tableWrapper.classList.contains('chat-input-table-range-dragging')).toBe(false);

    document.dispatchEvent(pointerEvent('pointermove', {
      clientX: 136,
      clientY: 76,
      pointerId: 31
    }));
    expect(tiptap.state.selection.eq(selectionBeforeEscape)).toBe(true);
  });

  test('portals an accessible menu and uses plural deletion labels', async() => {
    const {editor, input, tiptap} = mountEditor();
    expect(editor.setDocument(tableDocument([
      ['A1', 'A2'],
      ['B1', 'B2'],
      ['C1', 'C2']
    ]))).toBe(true);
    const {positions} = tableData(tiptap);
    const rowSelection = CellSelection.create(
      tiptap.state.doc,
      positions[0],
      positions[3]
    );
    expect(rowSelection.isRowSelection()).toBe(true);
    expect(rowSelection.isColSelection()).toBe(false);
    tiptap.view.dispatch(tiptap.state.tr.setSelection(rowSelection));
    await flushTableChrome();

    const grip = input.querySelector<HTMLButtonElement>('.chat-input-table-grip')!;
    grip.dispatchEvent(pointerEvent('pointerdown', {pointerId: 41}));
    document.dispatchEvent(pointerEvent('pointerup', {pointerId: 41}));
    await flushTableChrome();

    const menu = document.body.querySelector<HTMLElement>('.chat-input-table-menu')!;
    expect(menu).toBeTruthy();
    expect(menu.hidden).toBe(false);
    expect(menu.classList.contains('btn-menu')).toBe(true);
    expect(menu.querySelector('.btn-menu-item')).not.toBeNull();
    expect(menu.parentElement).toBe(document.body);
    expect(menu.getAttribute('role')).toBe('menu');
    expect(grip.getAttribute('aria-haspopup')).toBe('menu');
    expect(grip.getAttribute('aria-expanded')).toBe('true');

    const rootLabels = Array.from(
      menu.querySelectorAll<HTMLElement>(':scope > .btn-menu-item')
    ).map((button) => button.getAttribute('aria-label'));
    expect(rootLabels.slice(0, 7)).toEqual([
      'Chat.Input.Editor.Toolbar.TableAddCells',
      'Chat.Input.Editor.Toolbar.TableAlign',
      'Chat.Input.Editor.Toolbar.TableDeleteCells',
      'Chat.Input.Editor.Toolbar.TableUniteCells',
      'Chat.Input.Editor.Toolbar.TableHeaderCell',
      'Chat.Input.Editor.Toolbar.TableBorderless',
      'Chat.Input.Editor.Toolbar.TableStriped'
    ].map((label) => I18n.format(label as Parameters<typeof I18n.format>[0], true)));
    expect(menuButtonIcon(
      menu,
      'Chat.Input.Editor.Toolbar.TableAddCells'
    )).toBe('table_add');
    expect(menuButtonIcon(
      menu,
      'Chat.Input.Editor.Toolbar.TableAlign'
    )).toBe('align_left');
    expect(menuButtonIcon(
      menu,
      'Chat.Input.Editor.Toolbar.TableUniteCells'
    )).toBe('merge_horizontal');
    expect(menuButtonIcon(
      menu,
      'Chat.Input.Editor.Toolbar.TableBorderless'
    )).toBe('table');
    expect(menuButton(
      menu,
      'Chat.Input.Editor.Toolbar.TableUniteCells'
    )?.previousElementSibling?.tagName).toBe('HR');
    expect(menuButton(
      menu,
      'Chat.Input.Editor.Toolbar.TableBorderless'
    )?.previousElementSibling?.tagName).toBe('HR');

    const alignmentTrigger = menuButton(
      menu,
      'Chat.Input.Editor.Toolbar.TableAlign'
    )!;
    alignmentTrigger.click();
    await flushTableChrome();
    const alignmentSubmenu = document.body.querySelector<HTMLElement>(
      '.chat-input-table-submenu.active'
    )!;
    const alignmentItems = Array.from(
      alignmentSubmenu.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]')
    );
    expect(alignmentItems).toHaveLength(6);
    expect(alignmentItems.every((item) => (
      item.getAttribute('aria-checked') === 'true' ||
      item.getAttribute('aria-checked') === 'false'
    ))).toBe(true);
    expect(alignmentItems.filter((item) => item.getAttribute('aria-checked') === 'true'))
    .toHaveLength(2);
    expect(alignmentItems.map((item) => (
      item.querySelector<HTMLElement>('.btn-menu-item-icon')?.dataset.icon
    ))).toEqual([
      'align_left_edge',
      'align_horizontal_center',
      'align_right_edge',
      'align_top',
      'align_vertical_center',
      'align_bottom'
    ]);

    alignmentItems[0].focus();
    alignmentItems[0].dispatchEvent(new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      key: 'ArrowDown'
    }));
    expect(document.activeElement).toBe(alignmentItems[1]);
    expect(pressKey(alignmentItems[1], 'Escape').defaultPrevented).toBe(true);
    expect(alignmentSubmenu.classList.contains('active')).toBe(false);
    expect(document.activeElement).toBe(alignmentTrigger);

    alignmentTrigger.click();
    await flushTableChrome();
    const reopenedAlignmentSubmenu = document.body.querySelector<HTMLElement>(
      '.chat-input-table-submenu.active'
    )!;
    expect(reopenedAlignmentSubmenu.querySelectorAll(
      '.chat-input-table-menu-check'
    )).toHaveLength(2);
    expect(Array.from(reopenedAlignmentSubmenu.querySelectorAll<HTMLElement>(
      '[aria-checked="true"]'
    )).every((item) => (
      item.querySelectorAll('.chat-input-table-menu-check').length === 1
    ))).toBe(true);
    expect(pressKey(reopenedAlignmentSubmenu, 'Escape').defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(alignmentTrigger);

    const deleteCellsTrigger = menuButton(
      menu,
      'Chat.Input.Editor.Toolbar.TableDeleteCells'
    )!;
    deleteCellsTrigger.click();
    await flushTableChrome();
    const deleteSubmenu = document.body.querySelector<HTMLElement>(
      '.chat-input-table-submenu.active'
    )!;
    const deleteRowsLabel = I18n.format(
      'Chat.Input.Editor.Toolbar.TableDeleteRows',
      true
    );
    const deleteRows = Array.from(
      deleteSubmenu.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')
    ).find((button) => button.getAttribute('aria-label') === deleteRowsLabel);
    expect(deleteRows).toBeTruthy();
    expect(menuButton(
      deleteSubmenu,
      'Chat.Input.Editor.Toolbar.TableDeleteColumns'
    )).toBeUndefined();

    expect(pressKey(deleteRows!, 'Escape').defaultPrevented).toBe(true);
    expect(deleteSubmenu.classList.contains('active')).toBe(false);
    expect(document.activeElement).toBe(deleteCellsTrigger);
    pressKey(menu, 'Escape');
    expect(menu.hidden).toBe(false);
    expect(menu.classList.contains('active')).toBe(false);
    expect(menu.parentElement).toBe(document.body);
    expect(grip.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(grip);
  });

  test('uses visual title edges for ArrowUp and ArrowDown before leaving the title', () => {
    const {editor, input, tiptap} = mountEditor();
    expect(editor.setDocument(tableDocument(
      [['A', 'B']],
      {title: 'Table title'}
    ))).toBe(true);
    const titlePosition = documentNodePosition(tiptap, CHAT_TABLE_TITLE_NODE_NAME);
    editor.restoreSelection({
      from: titlePosition + 3,
      to: titlePosition + 3
    }, false);
    const endOfTextblock = vi.spyOn(tiptap.view, 'endOfTextblock')
    .mockReturnValue(false);

    const beforeDown = tiptap.state.selection;
    expect(pressKey(input, 'ArrowDown').defaultPrevented).toBe(false);
    expect(endOfTextblock).toHaveBeenLastCalledWith('down');
    expect(tiptap.state.selection.eq(beforeDown)).toBe(true);
    expect(tiptap.state.selection.$from.parent.type.name)
    .toBe(CHAT_TABLE_TITLE_NODE_NAME);

    const beforeUp = tiptap.state.selection;
    expect(pressKey(input, 'ArrowUp').defaultPrevented).toBe(false);
    expect(endOfTextblock).toHaveBeenLastCalledWith('up');
    expect(tiptap.state.selection.eq(beforeUp)).toBe(true);
    expect(tiptap.state.selection.$from.parent.type.name)
    .toBe(CHAT_TABLE_TITLE_NODE_NAME);
  });

  test('exits the final RTL cell with ArrowLeft but not ArrowRight', () => {
    const {editor, input, tiptap} = mountEditor();
    expect(editor.setDocument(tableDocument([['A', 'B']]))).toBe(true);
    const {positions} = tableData(tiptap);
    const lastCell = tiptap.state.doc.nodeAt(positions[1])!;
    const lastCellEnd = positions[1] + lastCell.nodeSize - 2;
    const table = input.querySelector<HTMLTableElement>('table.chat-input-table')!;
    table.style.direction = 'rtl';
    expect(getComputedStyle(table).direction).toBe('rtl');
    editor.restoreSelection({from: lastCellEnd, to: lastCellEnd}, false);

    const right = pressKey(input, 'ArrowRight');
    expect(right.defaultPrevented).toBe(false);
    expect(Array.from(
      {length: tiptap.state.selection.$from.depth + 1},
      (_value, depth) => tiptap.state.selection.$from.node(depth).type.name
    )).toContain('tableCell');

    editor.restoreSelection({from: lastCellEnd, to: lastCellEnd}, false);
    const left = pressKey(input, 'ArrowLeft');
    expect(left.defaultPrevented).toBe(true);
    expect(tiptap.state.selection.$from.parent).toBe(tiptap.state.doc.lastChild);
    expect(tiptap.state.selection.from).toBe(tiptap.state.doc.content.size - 1);
  });

  test.each(['scroll', 'resize'] as const)(
    'restores grip focus when a keyboard-open menu closes on viewport %s',
    async(viewportEvent) => {
      const {editor, input, tiptap} = mountEditor();
      expect(editor.setDocument(tableDocument([['A', 'B']]))).toBe(true);
      const {positions} = tableData(tiptap);
      editor.restoreSelection({
        from: positions[0] + 2,
        to: positions[0] + 2
      }, false);
      await flushTableChrome();

      const grip = input.querySelector<HTMLButtonElement>('.chat-input-table-grip')!;
      grip.focus();
      expect(pressKey(grip, 'Enter').defaultPrevented).toBe(true);
      await flushTableChrome();
      const menu = document.body.querySelector<HTMLElement>(
        '.chat-input-table-menu'
      )!;
      expect(menu.hidden).toBe(false);
      expect(menu.contains(document.activeElement)).toBe(true);

      if(viewportEvent === 'scroll') {
        document.dispatchEvent(new Event('scroll'));
      } else {
        window.dispatchEvent(new Event('resize'));
      }
      await flushTableChrome();

      expect(menu.hidden).toBe(false);
      expect(menu.classList.contains('active')).toBe(false);
      expect(grip.getAttribute('aria-expanded')).toBe('false');
      expect(document.activeElement).toBe(grip);
    }
  );

  test('groups alignment controls and preserves their radio state', async() => {
    const {editor, input, tiptap} = mountEditor();
    expect(editor.setDocument(tableDocument([
      ['A', 'B'],
      ['C', 'D']
    ]))).toBe(true);
    const {positions} = tableData(tiptap);
    const firstCell = tiptap.state.doc.nodeAt(positions[0])!;
    const explicitLeft = tiptap.state.tr.setNodeMarkup(
      positions[0],
      undefined,
      {...firstCell.attrs, align: 'left'}
    );
    tiptap.view.dispatch(explicitLeft.setSelection(CellSelection.create(
      explicitLeft.doc,
      positions[0]
    )));
    await flushTableChrome();

    let {menu} = openGripMenu(input, 51);
    await flushTableChrome();
    const alignmentTrigger = menuButton(
      menu,
      'Chat.Input.Editor.Toolbar.TableAlign'
    )!;
    expect(alignmentTrigger.getAttribute('aria-haspopup')).toBe('menu');
    expect(menuButton(
      menu,
      'Chat.Input.Editor.Toolbar.TableAlignLeft'
    )).toBeUndefined();
    alignmentTrigger.click();
    await flushTableChrome();
    let submenu = document.body.querySelector<HTMLElement>(
      '.chat-input-table-submenu.active'
    )!;
    const alignLeft = menuButton(
      submenu,
      'Chat.Input.Editor.Toolbar.TableAlignLeft'
    )!;
    expect(alignLeft.getAttribute('aria-checked')).toBe('true');
    expect(alignLeft.querySelector('.chat-input-table-menu-check')).toBeTruthy();
    const alignmentLabels = Array.from(
      submenu.querySelectorAll<HTMLElement>('.btn-menu-item')
    ).map((button) => button.getAttribute('aria-label'));
    expect(alignmentLabels).toEqual([
      'Chat.Input.Editor.Toolbar.TableAlignLeft',
      'Chat.Input.Editor.Toolbar.TableAlignCenter',
      'Chat.Input.Editor.Toolbar.TableAlignRight',
      'Chat.Input.Editor.Toolbar.TableAlignTop',
      'Chat.Input.Editor.Toolbar.TableAlignMiddle',
      'Chat.Input.Editor.Toolbar.TableAlignBottom'
    ].map((label) => I18n.format(label as Parameters<typeof I18n.format>[0], true)));
    expect(menuButton(
      submenu,
      'Chat.Input.Editor.Toolbar.TableAlignTop'
    )?.previousElementSibling?.tagName).toBe('HR');
    pressKey(submenu, 'Escape');
    pressKey(menu, 'Escape');

    const secondCell = tiptap.state.doc.nodeAt(positions[1])!;
    const mixed = tiptap.state.tr.setNodeMarkup(
      positions[1],
      undefined,
      {...secondCell.attrs, align: 'center'}
    );
    tiptap.view.dispatch(mixed.setSelection(CellSelection.create(
      mixed.doc,
      positions[0],
      positions[1]
    )));
    await flushTableChrome();
    ({menu} = openGripMenu(input, 52));
    await flushTableChrome();
    menuButton(
      menu,
      'Chat.Input.Editor.Toolbar.TableAlign'
    )!.click();
    await flushTableChrome();
    submenu = document.body.querySelector<HTMLElement>(
      '.chat-input-table-submenu.active'
    )!;

    const horizontalLabels = [
      'Chat.Input.Editor.Toolbar.TableAlignLeft',
      'Chat.Input.Editor.Toolbar.TableAlignCenter',
      'Chat.Input.Editor.Toolbar.TableAlignRight'
    ] as const;
    expect(horizontalLabels.map((label) => (
      menuButton(submenu, label)?.getAttribute('aria-checked')
    ))).toEqual(['false', 'false', 'false']);
  });

  test('skips empty incoming rows while preserving valid table rows', () => {
    const {editor} = mountEditor();
    const message: RichMessage.richMessage = {
      _: 'richMessage',
      pFlags: {},
      blocks: [{
        _: 'pageBlockTable',
        pFlags: {},
        title: {_: 'textEmpty'},
        rows: []
      }, {
        _: 'pageBlockTable',
        pFlags: {bordered: true},
        title: {_: 'textPlain', text: 'Malformed table'},
        rows: [{
          _: 'pageTableRow',
          cells: []
        }]
      }, {
        _: 'pageBlockTable',
        pFlags: {striped: true},
        title: {_: 'textPlain', text: 'Mixed table'},
        rows: [{
          _: 'pageTableRow',
          cells: [{
            _: 'pageTableCell',
            pFlags: {},
            text: {_: 'textPlain', text: 'First'}
          }]
        }, {
          _: 'pageTableRow',
          cells: []
        }, {
          _: 'pageTableRow',
          cells: [{
            _: 'pageTableCell',
            pFlags: {},
            text: {_: 'textPlain', text: 'Last'}
          }]
        }]
      }, {
        _: 'pageBlockParagraph',
        text: {_: 'textPlain', text: 'Valid body'}
      }],
      photos: [],
      documents: []
    };

    expect(editor.setRichMessage(message)).toBe(true);
    expect(editor.getDocument().content?.map((node) => node.type))
    .toEqual([CHAT_TABLE_WRAPPER_NODE_NAME, 'paragraph']);
    expect(editor.getRichMessage().output.blocks).toMatchObject([{
      _: 'pageBlockTable',
      pFlags: {striped: true},
      title: {_: 'textPlain', text: 'Mixed table'},
      rows: [{
        _: 'pageTableRow',
        cells: [{
          _: 'pageTableCell',
          text: {_: 'textPlain', text: 'First'}
        }]
      }, {
        _: 'pageTableRow',
        cells: [{
          _: 'pageTableCell',
          text: {_: 'textPlain', text: 'Last'}
        }]
      }]
    }, {
      _: 'pageBlockParagraph',
      text: {_: 'textPlain', text: 'Valid body'}
    }]);
  });

  test('clears a stale row axis after returning to an ordinary cell', async() => {
    const {editor, input, tiptap} = mountEditor();
    expect(editor.setDocument(tableDocument([
      ['A1', 'A2'],
      ['B1', 'B2'],
      ['C1', 'C2']
    ]))).toBe(true);
    const {positions} = tableData(tiptap);
    editor.restoreSelection({
      from: positions[0] + 2,
      to: positions[0] + 2
    }, false);
    mockTableGeometry(input, 3, 2);
    await flushTableChrome();

    const rows = input.querySelectorAll<HTMLButtonElement>(
      '.chat-input-table-row-selector'
    );
    rows[1].dispatchEvent(pointerEvent('pointerdown', {pointerId: 61}));
    document.dispatchEvent(pointerEvent('pointerup', {pointerId: 61}));
    expect((tiptap.state.selection as CellSelection).isRowSelection()).toBe(true);

    editor.restoreSelection({
      from: positions[0] + 2,
      to: positions[0] + 2
    }, false);
    await flushTableChrome();
    const wholeTable = CellSelection.create(
      tiptap.state.doc,
      positions[0],
      positions[positions.length - 1]
    );
    expect(wholeTable.isRowSelection()).toBe(true);
    expect(wholeTable.isColSelection()).toBe(true);
    tiptap.view.dispatch(tiptap.state.tr.setSelection(wholeTable));
    await flushTableChrome();

    const {menu} = openGripMenu(input, 62);
    await flushTableChrome();
    expect(menuButton(menu, 'Chat.Input.Editor.Toolbar.TableMoveUp')).toBeUndefined();
    expect(menuButton(menu, 'Chat.Input.Editor.Toolbar.TableMoveDown')).toBeUndefined();
    expect(menuButton(menu, 'Chat.Input.Editor.Toolbar.TableMoveLeft')).toBeUndefined();
    expect(menuButton(menu, 'Chat.Input.Editor.Toolbar.TableMoveRight')).toBeUndefined();
  });

  test('keeps nested actions usable and restores trigger focus', async() => {
    const {editor, input, tiptap} = mountEditor();
    expect(editor.setDocument(tableDocument([
      ['A1', 'A2'],
      ['B1', 'B2'],
      ['C1', 'C2']
    ]))).toBe(true);
    const {positions} = tableData(tiptap);
    const middleRow = CellSelection.create(
      tiptap.state.doc,
      positions[2],
      positions[3]
    );
    expect(middleRow.isRowSelection()).toBe(true);
    tiptap.view.dispatch(tiptap.state.tr.setSelection(middleRow));
    await flushTableChrome();

    const {menu} = openGripMenu(input, 71);
    await flushTableChrome();
    const addCellsTrigger = menuButton(
      menu,
      'Chat.Input.Editor.Toolbar.TableAddCells'
    )!;
    const moveTrigger = menuButton(
      menu,
      'Chat.Input.Editor.Toolbar.TableMove'
    )!;
    expect(addCellsTrigger).toBeTruthy();
    expect(moveTrigger).toBeTruthy();
    expect(addCellsTrigger.getAttribute('aria-haspopup')).toBe('menu');
    expect(moveTrigger.getAttribute('aria-haspopup')).toBe('menu');
    expect(menuButton(
      menu,
      'Chat.Input.Editor.Toolbar.TableColumnLeft'
    )).toBeUndefined();
    expect(menuButton(
      menu,
      'Chat.Input.Editor.Toolbar.TableMoveUp'
    )).toBeUndefined();
    expect(document.body.querySelector('.chat-input-table-submenu')).toBeNull();

    addCellsTrigger.click();
    await flushTableChrome();
    let submenu = document.body.querySelector<HTMLElement>(
      '.chat-input-table-submenu.active'
    )!;
    expect(submenu).toBeTruthy();
    expect(submenu.hidden).toBe(false);
    expect(submenu.getAttribute('role')).toBe('menu');
    expect(Array.from(
      submenu.querySelectorAll<HTMLElement>('.btn-menu-item')
    ).map((button) => button.getAttribute('aria-label'))).toEqual([
      'Chat.Input.Editor.Toolbar.TableRowAbove',
      'Chat.Input.Editor.Toolbar.TableRowBelow',
      'Chat.Input.Editor.Toolbar.TableColumnLeft',
      'Chat.Input.Editor.Toolbar.TableColumnRight'
    ].map((label) => I18n.format(label as Parameters<typeof I18n.format>[0], true)));
    expect(Array.from(
      submenu.querySelectorAll<HTMLElement>('.btn-menu-item')
    ).map((item) => (
      item.querySelector<HTMLElement>('.btn-menu-item-icon')?.dataset.icon
    ))).toEqual([
      'arrow_up',
      'arrow_down',
      'arrow_left_square_add',
      'arrow_right_square_add'
    ]);
    const insertColumn = menuButton(
      submenu,
      'Chat.Input.Editor.Toolbar.TableColumnLeft'
    )!;
    expect(insertColumn).toBeTruthy();
    expect(insertColumn.previousElementSibling?.tagName).toBe('HR');
    expect(menu.contains(insertColumn)).toBe(false);
    insertColumn.focus();
    expect(pressKey(insertColumn, 'Escape').defaultPrevented).toBe(true);
    expect(submenu.classList.contains('active')).toBe(false);
    expect(document.activeElement).toBe(addCellsTrigger);

    moveTrigger.click();
    await flushTableChrome();
    submenu = document.body.querySelector<HTMLElement>(
      '.chat-input-table-submenu.active'
    )!;
    const moveUp = menuButton(
      submenu,
      'Chat.Input.Editor.Toolbar.TableMoveUp'
    )!;
    expect(moveUp).toBeTruthy();
    expect(menuButton(
      submenu,
      'Chat.Input.Editor.Toolbar.TableMoveDown'
    )).toBeTruthy();
    moveUp.focus();
    pressKey(moveUp, 'Escape');
    expect(submenu.classList.contains('active')).toBe(false);
    expect(document.activeElement).toBe(moveTrigger);

    const reopened = openGripMenu(input, 72);
    await flushTableChrome();
    menuButton(
      reopened.menu,
      'Chat.Input.Editor.Toolbar.TableAddCells'
    )!.click();
    await flushTableChrome();
    submenu = document.body.querySelector<HTMLElement>(
      '.chat-input-table-submenu.active'
    )!;
    const addColumn = menuButton(
      submenu,
      'Chat.Input.Editor.Toolbar.TableColumnLeft'
    )!;
    expect(addColumn).toBeTruthy();
    addColumn.dispatchEvent(pointerEvent('pointerdown', {pointerId: 73}));
    addColumn.dispatchEvent(pointerEvent('pointerup', {pointerId: 73}));
    addColumn.click();
    await flushTableChrome();
    expect(tableData(tiptap).map.width).toBe(3);
  });
});
