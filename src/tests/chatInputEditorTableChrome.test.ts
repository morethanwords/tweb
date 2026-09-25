import type {Editor, JSONContent} from '@tiptap/core';
import type {Node as ProseMirrorNode} from '@tiptap/pm/model';
import {AllSelection, TextSelection} from '@tiptap/pm/state';
import {CellSelection, TableMap} from '@tiptap/pm/tables';
import '@/tests/mocks/chatInputEditorTableUi';
import {mountChatInputEditor} from '@/tests/helpers/chatInputEditor';
import {richTextToTiptapInlineContent} from '@components/chat/inputEditor/richMessage';
import {
  CHAT_TABLE_TITLE_NODE_NAME,
  CHAT_TABLE_WRAPPER_NODE_NAME
} from '@components/chat/inputEditor/tableSchema';
import type {ChatInputEditor} from '@components/chat/inputEditor/types';
import preserveEditorSelectionOnToolbarButton from '@components/chat/inputEditor/toolbarButton';
import type {RichText} from '@layer';
import {CLICK_EVENT_NAME} from '@helpers/dom/clickEvent';
import I18n from '@lib/langPack';

if(typeof Document.prototype.elementFromPoint !== 'function') {
  Object.defineProperty(Document.prototype, 'elementFromPoint', {
    configurable: true,
    value: (): Element | null => null
  });
}


function tableDocument(
  rows: string[][],
  {
    title = '',
    titleRichText,
    withHeaderRow = false
  }: {
    title?: string,
    titleRichText?: RichText,
    withHeaderRow?: boolean
  } = {}
): JSONContent {
  const titleContent = titleRichText ?
    richTextToTiptapInlineContent(titleRichText) :
    title ? [{type: 'text', text: title}] : undefined;
  return {
    type: 'doc',
    content: [{
      type: CHAT_TABLE_WRAPPER_NODE_NAME,
      content: [{
        type: CHAT_TABLE_TITLE_NODE_NAME,
        content: titleContent
      }, {
        type: 'table',
        content: rows.map((row, rowIndex) => ({
          type: 'tableRow',
          content: row.map((text) => ({
            type: withHeaderRow && rowIndex === 0 ? 'tableHeader' : 'tableCell',
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

function tableCellPositions(tiptap: Editor, targetIndex = 0) {
  let wrapper: ProseMirrorNode;
  let wrapperPosition = 0;
  let wrapperIndex = 0;
  tiptap.state.doc.forEach((node, offset) => {
    if(
      !wrapper &&
      node.type.name === CHAT_TABLE_WRAPPER_NODE_NAME &&
      wrapperIndex++ === targetIndex
    ) {
      wrapper = node;
      wrapperPosition = offset;
    }
  });
  expect(wrapper!).toBeTruthy();
  const title = wrapper!.firstChild;
  const table = wrapper!.lastChild;
  expect(title?.type.name).toBe(CHAT_TABLE_TITLE_NODE_NAME);
  expect(table?.type.name).toBe('table');
  const titlePosition = wrapperPosition + 1;
  const tablePosition = titlePosition + title!.nodeSize;
  const map = TableMap.get(table!);
  return {
    map,
    positions: map.map.map((position) => tablePosition + 1 + position),
    table: table!,
    tablePosition,
    title: title!,
    titlePosition,
    wrapper: wrapper!,
    wrapperPosition
  };
}

function selectedTableCellPosition(tiptap: Editor) {
  const {positions} = tableCellPositions(tiptap);
  return positions.find((position) => {
    const cell = tiptap.state.doc.nodeAt(position);
    return !!cell &&
      tiptap.state.selection.from > position &&
      tiptap.state.selection.to < position + cell.nodeSize;
  });
}

function terminalParagraphPosition(tiptap: Editor) {
  const terminal = tiptap.state.doc.lastChild!;
  expect(terminal.type.name).toBe('paragraph');
  expect(terminal.content.size).toBe(0);
  return tiptap.state.doc.content.size - terminal.nodeSize;
}

function menuButton(menu: HTMLElement, labelKey: Parameters<typeof I18n.format>[0]) {
  const label = I18n.format(labelKey, true);
  const button = Array.from(menu.querySelectorAll<HTMLElement>('.btn-menu-item')).find((button) => (
    button.getAttribute('aria-label') === label
  ));
  expect(button, `button with aria-label "${label}"`).toBeTruthy();
  return button!;
}

function tableMenu(ownerDocument: Document = document) {
  return ownerDocument.querySelector<HTMLElement>('.chat-input-table-menu')!;
}

function pressKey(
  input: HTMLElement,
  key: string,
  {shiftKey = false}: {shiftKey?: boolean} = {}
) {
  const event = new KeyboardEvent('keydown', {
    bubbles: true,
    cancelable: true,
    key,
    shiftKey
  });
  input.dispatchEvent(event);
  return event;
}

function pointerEvent(
  type: string,
  {
    clientX = 0,
    clientY = 0,
    pointerId = 1,
    shiftKey = false
  }: {
    clientX?: number,
    clientY?: number,
    pointerId?: number,
    shiftKey?: boolean
  } = {}
) {
  const event = new MouseEvent(type, {
    bubbles: true,
    button: 0,
    cancelable: true,
    clientX,
    clientY,
    shiftKey
  });
  Object.defineProperties(event, {
    isPrimary: {value: true},
    pointerId: {value: pointerId}
  });
  return event as PointerEvent;
}

function clickGrip(input: HTMLElement, pointerId = 1) {
  const grip = input.querySelector<HTMLButtonElement>('.chat-input-table-grip');
  expect(grip).toBeTruthy();
  grip!.dispatchEvent(pointerEvent('pointerdown', {pointerId}));
  document.dispatchEvent(pointerEvent('pointerup', {pointerId}));
  return grip!;
}

function mockTableGeometry(
  input: HTMLElement,
  rows: number,
  columns: number,
  tableIndex = 0
) {
  const wrapper = input.querySelectorAll<HTMLElement>(
    '.chat-input-table-wrapper'
  )[tableIndex];
  const scroll = wrapper.firstElementChild as HTMLElement;
  const table = wrapper.querySelector<HTMLTableElement>('table.chat-input-table')!;
  const tableLeft = 16;
  const tableTop = 16;
  const cellWidth = 80;
  const cellHeight = 40;
  const tableWidth = columns * cellWidth;
  const tableHeight = rows * cellHeight;
  let reads = 0;
  const geometry = (
    x: number,
    y: number,
    width: number,
    height: number
  ) => () => {
    ++reads;
    return new DOMRect(x, y, width, height);
  };

  wrapper.getBoundingClientRect = geometry(
    0,
    0,
    tableWidth + tableLeft,
    tableHeight + tableTop
  );
  scroll.getBoundingClientRect = geometry(
    tableLeft,
    tableTop,
    tableWidth,
    tableHeight
  );
  table.getBoundingClientRect = geometry(
    tableLeft,
    tableTop,
    tableWidth,
    tableHeight
  );
  Array.from(table.rows).forEach((row, rowIndex) => {
    row.getBoundingClientRect = geometry(
      tableLeft,
      tableTop + rowIndex * cellHeight,
      tableWidth,
      cellHeight
    );
    Array.from(row.cells).forEach((cell, columnIndex) => {
      cell.getBoundingClientRect = geometry(
        tableLeft + columnIndex * cellWidth,
        tableTop + rowIndex * cellHeight,
        cellWidth,
        cellHeight
      );
    });
  });
  Array.from(table.querySelectorAll<HTMLTableColElement>('col')).forEach((column, index) => {
    column.getBoundingClientRect = geometry(
      tableLeft + index * cellWidth,
      tableTop,
      cellWidth,
      tableHeight
    );
  });
  return () => reads;
}

async function flushTableChrome() {
  await Promise.resolve();
  await Promise.resolve();
}

describe('Tiptap table chrome regressions', () => {
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

  test('capture and restore preserve a rectangular CellSelection', () => {
    const {editor, tiptap} = mountEditor();
    expect(editor.setDocument(tableDocument([
      ['A', 'B', 'C'],
      ['D', 'E', 'F']
    ]))).toBe(true);

    const {map, positions} = tableCellPositions(tiptap);
    const selection = CellSelection.create(
      tiptap.state.doc,
      positions[1],
      positions[map.width + 1]
    );
    tiptap.view.dispatch(tiptap.state.tr.setSelection(selection));
    const captured = editor.captureSelection();

    expect(captured).toEqual({
      from: selection.$anchorCell.pos,
      to: selection.$headCell.pos,
      type: 'cell'
    });

    const terminal = terminalParagraphPosition(tiptap);
    editor.restoreSelection({from: terminal + 1, to: terminal + 1}, false);
    expect(tiptap.state.selection).toBeInstanceOf(TextSelection);

    editor.restoreSelection(captured, false);
    expect(tiptap.state.selection).toBeInstanceOf(CellSelection);
    const restored = tiptap.state.selection as CellSelection;
    expect(restored.$anchorCell.pos).toBe(selection.$anchorCell.pos);
    expect(restored.$headCell.pos).toBe(selection.$headCell.pos);
  });

  test('renders row, column and table selectors with one grip and one range handle', async() => {
    const {editor, input, tiptap} = mountEditor();
    expect(editor.setDocument(tableDocument([
      ['A', 'B', 'C'],
      ['D', 'E', 'F']
    ]))).toBe(true);
    const {positions} = tableCellPositions(tiptap);
    editor.restoreSelection({from: positions[0] + 2, to: positions[0] + 2}, false);
    await flushTableChrome();

    const rows = input.querySelectorAll<HTMLButtonElement>(
      '.chat-input-table-row-selector'
    );
    const columns = input.querySelectorAll<HTMLButtonElement>(
      '.chat-input-table-column-selector'
    );
    const table = input.querySelector<HTMLButtonElement>(
      '.chat-input-table-table-selector'
    )!;
    expect(rows).toHaveLength(2);
    expect(columns).toHaveLength(3);
    expect(table.hidden).toBe(false);
    expect(input.querySelectorAll('.chat-input-table-grip')).toHaveLength(1);
    expect(input.querySelectorAll('.chat-input-table-range-handle')).toHaveLength(1);

    rows[1].dispatchEvent(pointerEvent('pointerdown', {pointerId: 10}));
    document.dispatchEvent(pointerEvent('pointerup', {pointerId: 10}));
    expect(tiptap.state.selection).toBeInstanceOf(CellSelection);
    expect((tiptap.state.selection as CellSelection).isRowSelection()).toBe(true);

    columns[2].dispatchEvent(pointerEvent('pointerdown', {pointerId: 11}));
    document.dispatchEvent(pointerEvent('pointerup', {pointerId: 11}));
    expect((tiptap.state.selection as CellSelection).isColSelection()).toBe(true);

    table.dispatchEvent(pointerEvent('pointerdown', {pointerId: 12}));
    const selection = tiptap.state.selection as CellSelection;
    expect(selection.isRowSelection()).toBe(true);
    expect(selection.isColSelection()).toBe(true);
  });

  test('does not open a context menu and applies actions through the unified grip', async() => {
    const {editor, input, tiptap} = mountEditor();
    expect(editor.setDocument(tableDocument([
      ['A', 'B', 'C'],
      ['D', 'E', 'F']
    ]))).toBe(true);
    const {positions} = tableCellPositions(tiptap);
    tiptap.view.dispatch(tiptap.state.tr.setSelection(CellSelection.create(
      tiptap.state.doc,
      positions[0],
      positions[1]
    )));
    await flushTableChrome();

    const firstCell = tiptap.view.nodeDOM(positions[0]) as HTMLTableCellElement;
    const contextMenu = new MouseEvent('contextmenu', {
      bubbles: true,
      cancelable: true
    });
    firstCell.dispatchEvent(contextMenu);
    expect(contextMenu.defaultPrevented).toBe(false);
    expect(input.ownerDocument.querySelector('.chat-input-table-menu')).toBeNull();

    clickGrip(input, 20);
    const menu = tableMenu(input.ownerDocument);
    expect(menu.hidden).toBe(false);
    expect(menu.querySelector('.btn-menu-item-text')?.textContent).toBeTruthy();
    menuButton(
      menu,
      'Chat.Input.Editor.Toolbar.TableAlign'
    ).click();
    const alignmentSubmenu = document.body.querySelector<HTMLElement>(
      '.chat-input-table-submenu.active'
    )!;
    expect(alignmentSubmenu).toBeTruthy();
    menuButton(
      alignmentSubmenu,
      'Chat.Input.Editor.Toolbar.TableAlignCenter'
    ).click();
    positions.slice(0, 2).forEach((position) => {
      expect(tiptap.state.doc.nodeAt(position)?.attrs.align).toBe('center');
    });
    expect(tiptap.state.doc.nodeAt(positions[2])?.attrs.align).toBeNull();

    clickGrip(input, 21);
    menuButton(menu, 'Chat.Input.Editor.Toolbar.TableHeaderCell').click();
    positions.slice(0, 2).forEach((position) => {
      expect(tiptap.state.doc.nodeAt(position)?.type.name).toBe('tableHeader');
    });
    expect(tiptap.state.doc.nodeAt(positions[2])?.type.name).toBe('tableCell');
  });

  test('keeps delete column visible for a full-column range selection', async() => {
    const {editor, input, tiptap} = mountEditor();
    expect(editor.setDocument(tableDocument([
      ['A', 'B'],
      ['C', 'D'],
      ['E', 'F']
    ]))).toBe(true);
    const {map, positions} = tableCellPositions(tiptap);
    tiptap.view.dispatch(tiptap.state.tr.setSelection(CellSelection.create(
      tiptap.state.doc,
      positions[0],
      positions[map.width * (map.height - 1)]
    )));
    await flushTableChrome();

    clickGrip(input, 22);
    const menu = tableMenu(input.ownerDocument);
    const deleteCells = menuButton(
      menu,
      'Chat.Input.Editor.Toolbar.TableDeleteCells'
    );
    const mergeCells = menuButton(
      menu,
      'Chat.Input.Editor.Toolbar.TableUniteCells'
    );
    const buttons = Array.from(menu.querySelectorAll<HTMLElement>('.btn-menu-item'));
    expect(buttons.indexOf(deleteCells)).toBeLessThan(buttons.indexOf(mergeCells));

    deleteCells.click();
    const deleteSubmenu = document.body.querySelector<HTMLElement>(
      '.chat-input-table-submenu.active'
    )!;
    const deleteColumn = menuButton(
      deleteSubmenu,
      'Chat.Input.Editor.Toolbar.TableDeleteColumn'
    );
    expect(Array.from(deleteSubmenu.querySelectorAll<HTMLElement>(
      '.btn-menu-item'
    )).some((button) => (
      button.getAttribute('aria-label') === I18n.format(
        'Chat.Input.Editor.Toolbar.TableDeleteRows',
        true
      )
    ))).toBe(false);

    deleteColumn.click();
    expect(tableCellPositions(tiptap).map.width).toBe(1);
    expect(tiptap.state.selection).toBeInstanceOf(TextSelection);
  });

  test('collapses cell selections after structural table changes', () => {
    const {editor, input, tiptap} = mountEditor();
    expect(editor.setDocument(tableDocument([
      ['', ''],
      ['', '']
    ]))).toBe(true);
    let {positions} = tableCellPositions(tiptap);
    tiptap.view.dispatch(tiptap.state.tr.setSelection(CellSelection.create(
      tiptap.state.doc,
      positions[0]
    )));

    expect(editor.addTableColumnAfter()).toBe(true);
    expect(tiptap.state.selection).toBeInstanceOf(TextSelection);
    expect(tiptap.state.selection.empty).toBe(true);
    expect(input.querySelector('.selectedCell')).toBeNull();

    positions = tableCellPositions(tiptap).positions;
    tiptap.view.dispatch(tiptap.state.tr.setSelection(CellSelection.create(
      tiptap.state.doc,
      positions[0]
    )));
    expect(editor.deleteTableRow()).toBe(true);
    expect(tiptap.state.selection).toBeInstanceOf(TextSelection);
    expect(tiptap.state.selection.empty).toBe(true);
    expect(input.querySelector('.selectedCell')).toBeNull();
  });

  test('the single range handle supports pointer and keyboard resizing', async() => {
    const {editor, input, tiptap} = mountEditor();
    expect(editor.setDocument(tableDocument([
      ['A', 'B'],
      ['C', 'D']
    ]))).toBe(true);
    const {map, positions, tablePosition} = tableCellPositions(tiptap);
    editor.restoreSelection({from: positions[0] + 2, to: positions[0] + 2}, false);
    mockTableGeometry(input, 2, 2);
    await flushTableChrome();

    clickGrip(input, 30);
    const menu = tableMenu(input.ownerDocument);
    expect(menu.hidden).toBe(false);
    const beforeEscape = tiptap.state.selection;
    const escape = pressKey(
      input.querySelector<HTMLButtonElement>('.chat-input-table-grip')!,
      'Escape'
    );
    expect(escape.defaultPrevented).toBe(true);
    expect(menu.hidden).toBe(false);
    expect(menu.classList.contains('active')).toBe(false);
    expect(tiptap.state.selection.eq(beforeEscape)).toBe(true);

    const handle = input.querySelector<HTMLButtonElement>(
      '.chat-input-table-range-handle'
    )!;
    expect(handle.hidden).toBe(false);
    expect(handle.tabIndex).toBe(0);
    handle.dispatchEvent(pointerEvent('pointerdown', {
      clientX: 96,
      clientY: 56,
      pointerId: 31
    }));
    document.dispatchEvent(pointerEvent('pointermove', {
      clientX: 136,
      clientY: 76,
      pointerId: 31
    }));
    document.dispatchEvent(pointerEvent('pointerup', {pointerId: 31}));
    let selection = tiptap.state.selection as CellSelection;
    expect(map.rectBetween(
      selection.$anchorCell.pos - tablePosition - 1,
      selection.$headCell.pos - tablePosition - 1
    )).toEqual({bottom: 2, left: 0, right: 2, top: 0});

    tiptap.view.dispatch(tiptap.state.tr.setSelection(CellSelection.create(
      tiptap.state.doc,
      positions[0]
    )));
    await flushTableChrome();
    const resize = pressKey(handle, 'ArrowRight');
    expect(resize.defaultPrevented).toBe(true);
    selection = tiptap.state.selection as CellSelection;
    expect(map.rectBetween(
      selection.$anchorCell.pos - tablePosition - 1,
      selection.$headCell.pos - tablePosition - 1
    )).toEqual({bottom: 1, left: 0, right: 2, top: 0});
  });

  test('closes range selection around merged cells before offering merge', async() => {
    const {editor, input, tiptap} = mountEditor();
    expect(editor.setDocument(tableDocument([
      ['A', 'B', 'C'],
      ['D', 'E', 'F'],
      ['G', 'H', 'I']
    ]))).toBe(true);

    let data = tableCellPositions(tiptap);
    tiptap.view.dispatch(tiptap.state.tr.setSelection(CellSelection.create(
      tiptap.state.doc,
      data.positions[data.map.width],
      data.positions[data.map.width + 1]
    )));
    expect(editor.mergeTableCells()).toBe(true);
    data = tableCellPositions(tiptap);
    tiptap.view.dispatch(tiptap.state.tr.setSelection(CellSelection.create(
      tiptap.state.doc,
      data.positions[1],
      data.positions[data.map.width * 2 + 1]
    )));
    await flushTableChrome();

    const handle = input.querySelector<HTMLButtonElement>(
      '.chat-input-table-range-handle'
    )!;
    expect(pressKey(handle, 'ArrowDown').defaultPrevented).toBe(true);
    const selection = tiptap.state.selection as CellSelection;
    expect(data.map.rectBetween(
      selection.$anchorCell.pos - data.tablePosition - 1,
      selection.$headCell.pos - data.tablePosition - 1
    )).toEqual({bottom: 3, left: 0, right: 2, top: 0});

    clickGrip(input, 40);
    expect(menuButton(
      tableMenu(input.ownerDocument),
      'Chat.Input.Editor.Toolbar.TableUniteCells'
    )).toBeTruthy();
  });

  test('whole-table selector exposes table actions and safely deletes the table', async() => {
    const {editor, input, tiptap} = mountEditor();
    expect(editor.setDocument(tableDocument([
      ['A', 'B'],
      ['C', 'D']
    ]))).toBe(true);
    const {positions} = tableCellPositions(tiptap);
    editor.restoreSelection({from: positions[0] + 2, to: positions[0] + 2}, false);
    await flushTableChrome();

    input.querySelector<HTMLButtonElement>('.chat-input-table-table-selector')!
    .dispatchEvent(pointerEvent('pointerdown', {pointerId: 50}));
    clickGrip(input, 51);
    const menu = tableMenu(input.ownerDocument);
    expect(menu.hidden).toBe(false);
    expect(menuButton(
      menu,
      'Chat.Input.Editor.Toolbar.TableStriped'
    )).toBeTruthy();
    expect(menuButton(
      menu,
      'Chat.Input.Editor.Toolbar.TableBorderless'
    )).toBeTruthy();
    expect(Array.from(menu.querySelectorAll<HTMLElement>(
      ':scope > .btn-menu-item'
    )).some((button) => (
      button.getAttribute('aria-label') === I18n.format(
        'Chat.Input.Editor.Toolbar.TableDeleteCells',
        true
      )
    ))).toBe(false);

    menuButton(menu, 'Chat.Input.Editor.Toolbar.TableDelete').click();
    expect(tiptap.state.doc.firstChild?.type.name).toBe('paragraph');
    expect(tiptap.state.doc.childCount).toBe(1);
  });

  test('drags a selected row with the unified grip and preserves its selection', async() => {
    const {editor, input, tiptap} = mountEditor();
    expect(editor.setDocument(tableDocument([
      ['A1', 'A2'],
      ['B1', 'B2']
    ]))).toBe(true);
    const {positions} = tableCellPositions(tiptap);
    editor.restoreSelection({from: positions[0] + 2, to: positions[0] + 2}, false);
    mockTableGeometry(input, 2, 2);
    await flushTableChrome();

    const rows = input.querySelectorAll<HTMLButtonElement>(
      '.chat-input-table-row-selector'
    );
    rows[1].dispatchEvent(pointerEvent('pointerdown', {
      clientX: 8,
      clientY: 76,
      pointerId: 60
    }));
    document.dispatchEvent(pointerEvent('pointerup', {pointerId: 60}));
    await flushTableChrome();

    const grip = input.querySelector<HTMLButtonElement>('.chat-input-table-grip')!;
    expect(grip.classList.contains('is-draggable')).toBe(true);
    grip.dispatchEvent(pointerEvent('pointerdown', {
      clientX: 96,
      clientY: 76,
      pointerId: 61
    }));
    document.dispatchEvent(pointerEvent('pointermove', {
      clientX: 96,
      clientY: 20,
      pointerId: 61
    }));
    expect(input.querySelector<HTMLElement>(
      '.chat-input-table-drop-indicator'
    )?.hidden).toBe(false);
    document.dispatchEvent(pointerEvent('pointerup', {pointerId: 61}));

    const reorderedTable = tableCellPositions(tiptap).table;
    expect(reorderedTable.child(0).textContent).toBe('B1B2');
    expect(reorderedTable.child(1).textContent).toBe('A1A2');
    expect((tiptap.state.selection as CellSelection).isRowSelection()).toBe(true);
  });

  test('renders the editable title and table with the Instant View hierarchy', () => {
    const {editor, input, tiptap} = mountEditor();
    expect(editor.setDocument(tableDocument(
      [['Revenue', '$42']],
      {title: 'Quarterly report'}
    ))).toBe(true);

    const table = input.querySelector<HTMLTableElement>('table.chat-input-table');
    const title = input.querySelector<HTMLElement>('.chat-input-table-title');
    const block = title?.parentElement;
    const surface = title?.nextElementSibling as HTMLElement;
    const scroll = surface?.firstElementChild as HTMLElement;
    expect(table?.caption).toBeNull();
    expect(block?.dataset.chatInputTableWrapper).toBe('');
    expect(surface?.classList.contains(
      'chat-input-table-wrapper'
    )).toBe(true);
    expect(block?.children[1]).toBe(surface);
    expect(scroll?.firstElementChild).toBe(table);
    expect(table?.style.minWidth).toBe('128px');
    expect(surface?.style.minWidth).toBe('');
    expect(title?.hasAttribute('contenteditable')).toBe(false);
    expect(title?.closest('[contenteditable="true"]')).toBe(input);
    expect(title?.dataset.placeholder).toBe(I18n.format(
      'Chat.Input.Editor.Table.TitlePlaceholder',
      true
    ));
    expect(title?.textContent).toBe('Quarterly report');

    const {title: titleNode, titlePosition} = tableCellPositions(tiptap);
    expect(tiptap.view.posAtDOM(title!, 0)).toBe(titlePosition + 1);
    tiptap.view.dispatch(tiptap.state.tr.insertText(
      'Edited directly',
      titlePosition + 1,
      titlePosition + 1 + titleNode.content.size
    ));
    expect(editor.getTableTitle()).toBe('Edited directly');
    expect(title?.textContent).toBe('Edited directly');
  });

  test('keeps finite column width on the table without a mirrored surface', () => {
    const {editor, input} = mountEditor();
    expect(editor.setDocument(tableDocument([['A', 'B', 'C']]))).toBe(true);

    let table = input.querySelector<HTMLTableElement>('table.chat-input-table');
    const surface = input.querySelector<HTMLElement>('.chat-input-table-wrapper');
    expect(table?.style.minWidth).toBe('192px');
    expect(surface?.style.minWidth).toBe('');

    expect(editor.setDocument(tableDocument([[
      'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'
    ]]))).toBe(true);
    table = input.querySelector<HTMLTableElement>('table.chat-input-table');
    expect(table?.style.minWidth).toBe('768px');
  });

  test('rounds each active frame corner only at the matching table edge', async() => {
    const {editor, input, tiptap} = mountEditor();
    expect(editor.setDocument(tableDocument([
      ['A', 'B', 'C'],
      ['D', 'E', 'F'],
      ['G', 'H', 'I']
    ]))).toBe(true);
    mockTableGeometry(input, 3, 3);
    const {positions} = tableCellPositions(tiptap);
    const frame = input.querySelector<HTMLElement>(
      '.chat-input-table-active-cell-frame'
    )!;
    const cornerClasses = [
      'has-top-left-radius',
      'has-top-right-radius',
      'has-bottom-right-radius',
      'has-bottom-left-radius'
    ];
    const select = async(anchor: number, head = anchor) => {
      tiptap.view.dispatch(tiptap.state.tr.setSelection(CellSelection.create(
        tiptap.state.doc,
        positions[anchor],
        positions[head]
      )));
      await flushTableChrome();
      return cornerClasses.filter((className) => frame.classList.contains(className));
    };

    expect(await select(0)).toEqual(['has-top-left-radius']);
    expect(await select(0, 2)).toEqual([
      'has-top-left-radius',
      'has-top-right-radius'
    ]);
    expect(await select(4)).toEqual([]);
    expect(await select(8)).toEqual(['has-bottom-right-radius']);
    expect(await select(0, 8)).toEqual(cornerClasses);
  });

  test('synchronizes the active cell frame with pointer interaction outside ProseMirror selection', async() => {
    const {editor, input, tiptap} = mountEditor();
    expect(editor.setDocument(tableDocument([['A']]))).toBe(true);
    mockTableGeometry(input, 1, 1);
    const {positions} = tableCellPositions(tiptap);
    tiptap.view.dispatch(tiptap.state.tr.setSelection(TextSelection.create(
      tiptap.state.doc,
      positions[0] + 2
    )));
    await flushTableChrome();

    const cell = input.querySelector<HTMLTableCellElement>('td')!;
    const frame = input.querySelector<HTMLElement>('.chat-input-table-active-cell-frame')!;
    cell.dispatchEvent(pointerEvent('mousedown', {pointerId: 70}));
    await flushTableChrome();
    expect(frame.hidden).toBe(false);

    const selection = tiptap.state.selection;
    document.body.dispatchEvent(pointerEvent('pointerdown', {pointerId: 71}));
    expect(tiptap.state.selection.eq(selection)).toBe(true);
    expect(frame.hidden).toBe(true);

    cell.dispatchEvent(pointerEvent('mousedown', {pointerId: 72}));
    await flushTableChrome();
    expect(tiptap.state.selection.eq(selection)).toBe(true);
    expect(frame.hidden).toBe(false);
  });

  test('keeps a cell selection active while a selection-preserving toolbar button is held', async() => {
    const {editor, input, tiptap} = mountEditor();
    expect(editor.setDocument(tableDocument([['A', 'B']]))).toBe(true);
    mockTableGeometry(input, 1, 2);
    const {positions} = tableCellPositions(tiptap);
    const selection = CellSelection.create(
      tiptap.state.doc,
      positions[0],
      positions[1]
    );
    tiptap.view.dispatch(tiptap.state.tr.setSelection(selection));
    await flushTableChrome();

    const frame = input.querySelector<HTMLElement>('.chat-input-table-active-cell-frame')!;
    const button = document.createElement('button');
    preserveEditorSelectionOnToolbarButton(button);
    document.body.append(button);
    try {
      button.dispatchEvent(pointerEvent('pointerdown', {pointerId: 78}));
      button.dispatchEvent(new MouseEvent('mousedown', {
        bubbles: true,
        button: 0,
        cancelable: true
      }));
      await flushTableChrome();

      expect(tiptap.state.selection.eq(selection)).toBe(true);
      expect(frame.hidden).toBe(false);
      expect(document.activeElement).not.toBe(button);
    } finally {
      button.remove();
    }
  });

  test('opens the cell menu without selecting the cell text', async() => {
    const {editor, input, tiptap} = mountEditor();
    expect(editor.setDocument(tableDocument([['A', 'B']]))).toBe(true);
    mockTableGeometry(input, 1, 2);
    const {positions} = tableCellPositions(tiptap);
    const caret = TextSelection.create(tiptap.state.doc, positions[0] + 2);
    tiptap.view.dispatch(tiptap.state.tr.setSelection(caret));
    await flushTableChrome();

    clickGrip(input, 74);

    expect(tableMenu().hidden).toBe(false);
    expect(tiptap.state.selection).toBeInstanceOf(TextSelection);
    expect(tiptap.state.selection.eq(caret)).toBe(true);
  });

  test('keeps the active cell when the menu overlay only dismisses the menu', async() => {
    const {editor, input, tiptap} = mountEditor();
    expect(editor.setDocument(tableDocument([['A']]))).toBe(true);
    mockTableGeometry(input, 1, 1);
    const {positions} = tableCellPositions(tiptap);
    const caret = TextSelection.create(tiptap.state.doc, positions[0] + 2);
    tiptap.view.dispatch(tiptap.state.tr.setSelection(caret));
    await flushTableChrome();

    clickGrip(input, 75);
    const menu = tableMenu();
    const frame = input.querySelector<HTMLElement>('.chat-input-table-active-cell-frame')!;
    const overlay = input.ownerDocument.querySelector<HTMLElement>('.btn-menu-overlay')!;
    expect(frame.hidden).toBe(false);

    overlay.dispatchEvent(pointerEvent('pointerdown', {pointerId: 76}));
    overlay.dispatchEvent(new MouseEvent(CLICK_EVENT_NAME, {
      bubbles: true,
      cancelable: true
    }));

    expect(menu.classList.contains('active')).toBe(false);
    expect(tiptap.state.selection.eq(caret)).toBe(true);
    expect(frame.hidden).toBe(false);
  });

  test('moves the active frame to the pressed cell before model selection catches up', async() => {
    const {editor, input, tiptap} = mountEditor();
    expect(editor.setDocument(tableDocument([['A', 'B']]))).toBe(true);
    mockTableGeometry(input, 1, 2);
    const {positions} = tableCellPositions(tiptap);
    tiptap.view.dispatch(tiptap.state.tr.setSelection(TextSelection.create(
      tiptap.state.doc,
      positions[0] + 2
    )));
    await flushTableChrome();

    const cells = input.querySelectorAll<HTMLTableCellElement>('td');
    const frame = input.querySelector<HTMLElement>('.chat-input-table-active-cell-frame')!;
    expect(frame.style.left).toBe('16px');

    cells[1].dispatchEvent(pointerEvent('mousedown', {pointerId: 73}));

    expect(tiptap.state.selection.from).toBe(positions[0] + 2);
    expect(frame.style.left).toBe('96px');
  });

  test('focuses the real table-title node and leaves an editable ProseMirror caret in it', () => {
    const {editor, input, tiptap} = mountEditor();
    expect(editor.setDocument(tableDocument(
      [['Revenue', '$42']],
      {title: 'Quarterly report'}
    ))).toBe(true);

    const title = input.querySelector<HTMLElement>('.chat-input-table-title')!;
    const {title: titleNode, titlePosition} = tableCellPositions(tiptap);
    const caret = titlePosition + 1 + titleNode.content.size;
    editor.restoreSelection({from: caret, to: caret}, false);
    tiptap.view.focus();

    expect(document.activeElement).toBe(input);
    expect(tiptap.state.selection.$from.parent.type.name)
    .toBe(CHAT_TABLE_TITLE_NODE_NAME);
    const selection = document.getSelection()!;
    expect(selection.anchorNode && title.contains(selection.anchorNode)).toBe(true);

    tiptap.view.dispatch(tiptap.state.tr.insertText(' updated'));
    expect(editor.getTableTitle()).toBe(title.textContent);
    expect(editor.getTableTitle()).toContain(' updated');
  });

  test('inserts the tdesktop 3 by 3 table with a header row and puts selected text in the first cell', () => {
    const {editor, tiptap} = mountEditor();
    expect(editor.setDocument({
      type: 'doc',
      content: [{
        type: 'paragraph',
        content: [{
          type: 'text',
          text: 'Quarterly report',
          marks: [{type: 'bold'}]
        }]
      }]
    })).toBe(true);
    tiptap.view.dispatch(tiptap.state.tr.setSelection(TextSelection.create(
      tiptap.state.doc,
      1,
      17
    )));

    expect(editor.insertTable()).toBe(true);
    const {
      positions,
      table,
      title,
      wrapper
    } = tableCellPositions(tiptap);
    expect(wrapper.type.name).toBe(CHAT_TABLE_WRAPPER_NODE_NAME);
    expect(title.type.name).toBe(CHAT_TABLE_TITLE_NODE_NAME);
    expect(title.content.size).toBe(0);
    expect(TableMap.get(table).width).toBe(3);
    expect(TableMap.get(table).height).toBe(3);
    const firstRowCellTypes: string[] = [];
    table.firstChild?.forEach((cell) => firstRowCellTypes.push(cell.type.name));
    expect(firstRowCellTypes).toEqual([
      'tableHeader',
      'tableHeader',
      'tableHeader'
    ]);
    expect(table.firstChild?.firstChild?.textContent).toBe('Quarterly report');
    expect(selectedTableCellPosition(tiptap)).toBe(positions[0]);
  });

  test('keeps imported rich-title marks when the ProseMirror title is edited', () => {
    const {editor, input, tiptap} = mountEditor();
    expect(editor.setDocument(tableDocument(
      [['Value']],
      {
        title: 'Quarterly',
        titleRichText: {
          _: 'textBold',
          text: {_: 'textPlain', text: 'Quarterly'}
        }
      }
    ))).toBe(true);

    const title = input.querySelector<HTMLElement>('.chat-input-table-title')!;
    const strong = title.querySelector('strong');
    expect(strong?.textContent).toBe('Quarterly');

    let data = tableCellPositions(tiptap);
    tiptap.view.dispatch(tiptap.state.tr.insertText(
      'Updated',
      data.titlePosition + 1,
      data.titlePosition + 1 + data.title.content.size
    ));
    data = tableCellPositions(tiptap);

    expect(data.title.textContent).toBe('Updated');
    expect(data.title.firstChild?.marks.map((mark) => mark.type.name))
    .toEqual(['bold']);
    expect(title.querySelector('strong')?.textContent).toBe('Updated');
    expect(editor.getRichMessage().output.blocks[0]).toMatchObject({
      _: 'pageBlockTable',
      title: {
        _: 'textBold',
        text: {_: 'textPlain', text: 'Updated'}
      }
    });
  });

  test('shows localized context placeholders for an empty title, header, and cell', async() => {
    const {editor, input} = mountEditor();
    expect(editor.setDocument(tableDocument(
      [
        ['', 'Filled'],
        ['', '']
      ],
      {withHeaderRow: true}
    ))).toBe(true);
    await flushTableChrome();

    const title = input.querySelector<HTMLElement>('.chat-input-table-title');
    expect(title?.dataset.placeholder)
    .toBe(I18n.format('Chat.Input.Editor.Table.TitlePlaceholder', true));
    expect(title?.classList.contains('chat-input-table-title-empty')).toBe(true);
    expect(title?.classList.contains('chat-input-context-placeholder')).toBe(true);
    expect(title?.classList.contains('chat-input-context-placeholder-empty')).toBe(true);
    expect(title?.querySelector('.chat-input-context-placeholder-label')?.classList.contains('text-bold'))
    .toBe(true);
    const headers = input.querySelectorAll<HTMLElement>(
      'th [data-chat-input-paragraph]'
    );
    const cells = input.querySelectorAll<HTMLElement>(
      'td [data-chat-input-paragraph]'
    );
    expect(headers[0].dataset.placeholder).toBe(
      I18n.format('Chat.Input.Editor.Table.HeaderPlaceholder', true)
    );
    expect(headers[0].classList.contains('chat-input-context-placeholder-empty')).toBe(true);
    expect(headers[0].classList.contains('chat-input-context-placeholder-centered')).toBe(true);
    expect(headers[0].querySelector('.chat-input-context-placeholder-label')?.textContent)
    .toBe(I18n.format('Chat.Input.Editor.Table.HeaderPlaceholder', true));
    expect(headers[1].dataset.placeholder).toBeUndefined();
    cells.forEach((cell) => {
      expect(cell.dataset.placeholder).toBe(
        I18n.format('Chat.Input.Editor.Table.CellPlaceholder', true)
      );
      expect(cell.classList.contains('chat-input-context-placeholder-empty')).toBe(true);
      expect(cell.classList.contains('chat-input-context-placeholder-centered')).toBe(true);
      expect(cell.querySelector('.chat-input-context-placeholder-label')?.textContent)
      .toBe(I18n.format('Chat.Input.Editor.Table.CellPlaceholder', true));
    });
  });

  test('anchors the caret before an aligned empty-cell placeholder', async() => {
    const {editor, input, tiptap} = mountEditor();
    expect(editor.setDocument(tableDocument([['']]))).toBe(true);
    const {positions} = tableCellPositions(tiptap);
    const cell = tiptap.state.doc.nodeAt(positions[0])!;
    tiptap.view.dispatch(tiptap.state.tr.setNodeMarkup(
      positions[0],
      undefined,
      {...cell.attrs, align: 'center'}
    ));
    await flushTableChrome();

    const paragraph = input.querySelector<HTMLElement>(
      'td [data-table-cell-placeholder]'
    )!;
    const label = paragraph.querySelector<HTMLElement>(
      '.chat-input-context-placeholder-label'
    )!;
    const event = new MouseEvent('mousedown', {
      bubbles: true,
      button: 0,
      cancelable: true
    });
    label.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(tiptap.state.selection.from).toBe(positions[0] + 2);
    expect(document.getSelection()?.anchorNode).toBe(paragraph);
    expect(document.getSelection()?.anchorOffset).toBe(0);
  });

  test('does not rewrite cell placeholder attributes when the table node updates', async() => {
    const {editor, input} = mountEditor();
    expect(editor.insertTable()).toBe(true);
    await flushTableChrome();

    const attributeMutations: MutationRecord[] = [];
    const observer = new MutationObserver((mutations) => {
      attributeMutations.push(...mutations);
    });
    observer.observe(input, {
      attributeFilter: ['data-placeholder', 'data-table-cell-placeholder'],
      attributes: true,
      subtree: true
    });

    expect(editor.setTableTitle('Metrics')).toBe(true);
    await flushTableChrome();
    observer.disconnect();

    expect(attributeMutations).toEqual([]);
  });

  test('does not refresh unrelated table chrome while typing in another table', async() => {
    const {editor, input, tiptap} = mountEditor();
    const firstTable = tableDocument([['Unrelated']]).content![0];
    const secondTable = tableDocument([['Active']]).content![0];
    expect(editor.setDocument({
      type: 'doc',
      content: [
        firstTable,
        {type: 'paragraph'},
        secondTable
      ]
    })).toBe(true);

    const {positions} = tableCellPositions(tiptap, 1);
    editor.restoreSelection({
      from: positions[0] + 2,
      to: positions[0] + 2
    }, false);
    await flushTableChrome();
    expect(tiptap.state.selection.from).toBe(positions[0] + 2);

    const firstTableGeometryReads = mockTableGeometry(input, 1, 1, 0);
    const secondTableGeometryReads = mockTableGeometry(input, 1, 1, 1);
    tiptap.view.dispatch(tiptap.state.tr.insertText('!'));
    await flushTableChrome();

    expect(firstTableGeometryReads()).toBe(0);
    expect(secondTableGeometryReads()).toBeGreaterThan(0);
  });

  test('shows every table as selected when the whole editor document is selected', async() => {
    const {editor, input, tiptap} = mountEditor();
    const firstTable = tableDocument([['First']]).content![0];
    const secondTable = tableDocument([['Second']]).content![0];
    expect(editor.setDocument({
      type: 'doc',
      content: [
        {type: 'paragraph', content: [{type: 'text', text: 'Before'}]},
        firstTable,
        {type: 'paragraph', content: [{type: 'text', text: 'Between'}]},
        secondTable,
        {type: 'paragraph'}
      ]
    })).toBe(true);
    mockTableGeometry(input, 1, 1, 0);
    mockTableGeometry(input, 1, 1, 1);

    editor.restoreSelection({from: 2, to: 2}, false);
    input.querySelector<HTMLElement>('[data-chat-input-paragraph]')!
    .dispatchEvent(pointerEvent('pointerdown', {pointerId: 95}));
    tiptap.view.dispatch(tiptap.state.tr.setSelection(new AllSelection(tiptap.state.doc)));
    await flushTableChrome();

    const frames = Array.from(input.querySelectorAll<HTMLElement>(
      '.chat-input-table-active-cell-frame'
    ));
    expect(frames).toHaveLength(2);
    expect(frames.every((frame) => !frame.hidden)).toBe(true);
    expect(frames.every((frame) => (
      frame.classList.contains('has-top-left-radius') &&
      frame.classList.contains('has-top-right-radius') &&
      frame.classList.contains('has-bottom-right-radius') &&
      frame.classList.contains('has-bottom-left-radius')
    ))).toBe(true);
    expect(Array.from(input.querySelectorAll<HTMLElement>(
      '.chat-input-table-grip'
    )).every((grip) => grip.hidden)).toBe(true);

    tiptap.view.dispatch(tiptap.state.tr.setSelection(TextSelection.create(
      tiptap.state.doc,
      2
    )));
    await flushTableChrome();
    expect(Array.from(input.querySelectorAll<HTMLElement>(
      '.chat-input-table-active-cell-frame'
    )).every((frame) => frame.hidden)).toBe(true);
  });

  test('Backspace in the terminal sentinel after a table never deletes the table', () => {
    const {editor, input, tiptap} = mountEditor();
    expect(editor.setDocument(tableDocument([
      ['A', 'B'],
      ['C', 'D']
    ]))).toBe(true);

    const wrapperBefore = tableCellPositions(tiptap).wrapper.toJSON();
    const terminal = terminalParagraphPosition(tiptap);
    editor.restoreSelection({from: terminal + 1, to: terminal + 1}, false);

    const event = pressKey(input, 'Backspace');
    expect(event.defaultPrevented).toBe(true);
    expect(tiptap.state.doc.firstChild?.type.name).toBe(CHAT_TABLE_WRAPPER_NODE_NAME);
    expect(tiptap.state.doc.firstChild?.toJSON()).toEqual(wrapperBefore);
    expect(tiptap.state.doc.childCount).toBe(2);
    expect(tiptap.state.selection.$from.index(0)).toBe(0);
    terminalParagraphPosition(tiptap);
  });

  test('inline arrow from the trailing placeholder enters the final table cell', () => {
    const {editor, input, tiptap} = mountEditor();
    expect(editor.setDocument(tableDocument([
      ['A', 'B'],
      ['C', 'Last']
    ]))).toBe(true);

    const {positions} = tableCellPositions(tiptap);
    const lastCell = tiptap.state.doc.nodeAt(positions[3])!;
    const terminal = terminalParagraphPosition(tiptap);
    editor.restoreSelection({from: terminal + 1, to: terminal + 1}, false);

    const event = pressKey(input, 'ArrowLeft');
    expect(event.defaultPrevented).toBe(true);
    expect(selectedTableCellPosition(tiptap)).toBe(positions[3]);
    expect(tiptap.state.selection.from).toBe(
      positions[3] + lastCell.nodeSize - 2
    );
  });

  test('backward inline arrow stays native after text ending in a hard break', () => {
    const {editor, input, tiptap} = mountEditor();
    const content = tableDocument([['A']]);
    content.content!.push({
      type: 'paragraph',
      content: [
        {type: 'text', text: '123123'},
        {type: 'hardBreak'}
      ]
    });
    expect(editor.setDocument(content)).toBe(true);

    const terminal = terminalParagraphPosition(tiptap);
    const paragraph = tiptap.state.doc.child(tiptap.state.doc.childCount - 2);
    const paragraphPosition = terminal - paragraph.nodeSize;
    const paragraphEnd = paragraphPosition + 1 + paragraph.content.size;
    editor.restoreSelection({from: paragraphEnd, to: paragraphEnd}, false);
    const endOfTextblock = vi.spyOn(tiptap.view, 'endOfTextblock')
    .mockImplementation((direction) => direction === 'right');

    const backward = pressKey(input, 'ArrowLeft');
    expect(backward.defaultPrevented).toBe(false);
    expect(endOfTextblock).toHaveBeenLastCalledWith('left');
    expect(tiptap.state.selection.from).toBe(paragraphEnd);

    const forward = pressKey(input, 'ArrowRight');
    expect(forward.defaultPrevented).toBe(true);
    expect(endOfTextblock).toHaveBeenLastCalledWith('right');
    expect(tiptap.state.selection.$from.parent).toBe(tiptap.state.doc.lastChild);
  });

  test('moves ArrowLeft from a final Details body into its summary', () => {
    const {editor, input, tiptap} = mountEditor();
    expect(editor.setDocument({
      type: 'doc',
      content: [{
        type: 'details',
        attrs: {open: true},
        content: [
          {type: 'detailsSummary', content: [{type: 'text', text: 'Title'}]},
          {type: 'detailsBody', content: [{type: 'paragraph'}]}
        ]
      }]
    })).toBe(true);

    let bodyPosition = -1;
    tiptap.state.doc.descendants((node, position, parent) => {
      if(node.type.name !== 'paragraph' || parent?.type.name !== 'detailsBody') return;
      bodyPosition = position + 1;
      return false;
    });
    expect(bodyPosition).toBeGreaterThan(0);
    editor.restoreSelection({from: bodyPosition, to: bodyPosition}, false);
    vi.spyOn(tiptap.view, 'endOfTextblock').mockReturnValue(true);

    const event = pressKey(input, 'ArrowLeft');

    expect(event.defaultPrevented).toBe(true);
    expect(tiptap.state.selection.from).toBeLessThan(bodyPosition);
    expect(tiptap.state.selection.$from.parent.type.name).toBe('detailsSummary');
  });

  test('moves backward from a Details title into the previous table last cell', () => {
    const {editor, input, tiptap} = mountEditor();
    const table = tableDocument([['First', 'Last']]).content![0];
    expect(editor.setDocument({
      type: 'doc',
      content: [
        table,
        {
          type: 'details',
          attrs: {open: true},
          content: [
            {type: 'detailsSummary', content: [{type: 'text', text: 'Title'}]},
            {type: 'detailsBody', content: [{type: 'paragraph'}]}
          ]
        }
      ]
    })).toBe(true);

    let titlePosition = -1;
    tiptap.state.doc.descendants((node, position) => {
      if(node.type.name !== 'detailsSummary') return;
      titlePosition = position + 1;
      return false;
    });
    expect(titlePosition).toBeGreaterThan(0);
    editor.restoreSelection({from: titlePosition, to: titlePosition}, false);

    const event = pressKey(input, 'ArrowLeft');
    const {positions, table: tableNode} = tableCellPositions(tiptap);

    expect(event.defaultPrevented).toBe(true);
    expect(selectedTableCellPosition(tiptap)).toBe(positions[1]);
    expect(tiptap.state.selection.from).toBe(
      positions[1] + tableNode.lastChild!.lastChild!.nodeSize - 2
    );
  });

  test('Backspace in an empty cell moves the caret to the previous cell', () => {
    const {editor, input, tiptap} = mountEditor();
    expect(editor.setDocument(tableDocument([
      ['First', ''],
      ['', 'Last']
    ]))).toBe(true);

    const {positions} = tableCellPositions(tiptap);
    editor.restoreSelection({from: positions[2] + 2, to: positions[2] + 2}, false);

    const event = pressKey(input, 'Backspace');
    const previousCell = tiptap.state.doc.nodeAt(positions[1])!;
    expect(event.defaultPrevented).toBe(true);
    expect(selectedTableCellPosition(tiptap)).toBe(positions[1]);
    expect(tiptap.state.selection.from).toBe(
      positions[1] + previousCell.nodeSize - 2
    );
    expect(tiptap.state.doc.nodeAt(positions[2])?.firstChild?.content.size).toBe(0);
  });

  test('Backspace in the first empty cell moves the caret to the table title', () => {
    const {editor, input, tiptap} = mountEditor();
    expect(editor.setDocument(tableDocument([['', 'Second']], {
      title: 'Table title'
    }))).toBe(true);

    const {positions, title, titlePosition} = tableCellPositions(tiptap);
    editor.restoreSelection({from: positions[0] + 2, to: positions[0] + 2}, false);

    const event = pressKey(input, 'Backspace');
    expect(event.defaultPrevented).toBe(true);
    expect(tiptap.state.selection.$from.parent.type.name)
    .toBe(CHAT_TABLE_TITLE_NODE_NAME);
    expect(tiptap.state.selection.from).toBe(titlePosition + 1 + title.content.size);
    expect(tiptap.state.doc.nodeAt(positions[0])?.firstChild?.content.size).toBe(0);
  });

  test('Backspace in an empty table title visibly selects and then deletes the table', async() => {
    const {editor, input, tiptap} = mountEditor();
    expect(editor.setDocument(tableDocument([
      ['A', 'B'],
      ['C', 'D']
    ]))).toBe(true);

    const data = tableCellPositions(tiptap);
    mockTableGeometry(input, 2, 2);
    document.body.dispatchEvent(pointerEvent('pointerdown'));
    input.querySelector<HTMLElement>('.chat-input-table-title')!
    .dispatchEvent(pointerEvent('pointerdown'));
    editor.restoreSelection({
      from: data.titlePosition + 1,
      to: data.titlePosition + 1
    }, false);

    const selectEvent = pressKey(input, 'Backspace');
    expect(selectEvent.defaultPrevented).toBe(true);
    expect(tiptap.state.selection).toBeInstanceOf(CellSelection);
    const selection = tiptap.state.selection as CellSelection;
    expect(data.map.rectBetween(
      selection.$anchorCell.pos - data.tablePosition - 1,
      selection.$headCell.pos - data.tablePosition - 1
    )).toEqual({bottom: 2, left: 0, right: 2, top: 0});
    expect(tiptap.state.doc.firstChild?.type.name).toBe(CHAT_TABLE_WRAPPER_NODE_NAME);
    await flushTableChrome();
    const frame = input.querySelector<HTMLElement>(
      '.chat-input-table-active-cell-frame'
    )!;
    expect(frame.hidden).toBe(false);
    expect(frame.style.width).toBe('160px');
    expect(frame.style.height).toBe('80px');

    const deleteEvent = pressKey(input, 'Backspace');
    expect(deleteEvent.defaultPrevented).toBe(true);
    expect(tiptap.state.doc.firstChild?.type.name).toBe('paragraph');
    expect(tiptap.state.doc.childCount).toBe(1);
  });

  test('triple click keeps native textblock selection inside a table cell', () => {
    const {editor, tiptap} = mountEditor();
    expect(editor.setDocument(tableDocument([['Whole cell line', 'Other']]))).toBe(true);
    const {positions} = tableCellPositions(tiptap);
    const textStart = positions[0] + 2;
    const handled = tiptap.view.someProp('handleTripleClick', (handler) => (
      handler(tiptap.view, textStart, new MouseEvent('mousedown', {button: 0}))
    ));

    expect(handled).toBe(true);
    expect(tiptap.state.selection).toBeInstanceOf(TextSelection);
    expect(tiptap.state.selection).not.toBeInstanceOf(CellSelection);
    expect(tiptap.state.selection.from).toBe(textStart);
    expect(tiptap.state.selection.to).toBe(textStart + 'Whole cell line'.length);
  });

  test('keeps standard Enter, Tab and Shift-Tab behavior inside a table', () => {
    const {editor, input, tiptap} = mountEditor();
    expect(editor.setDocument(tableDocument(
      [
        ['A', 'B'],
        ['C', 'D']
      ],
      {title: 'Title'}
    ))).toBe(true);

    const title = input.querySelector<HTMLElement>('.chat-input-table-title')!;
    const data = tableCellPositions(tiptap);
    const titleEnd = data.titlePosition + 1 + data.title.content.size;
    editor.restoreSelection({from: titleEnd, to: titleEnd}, false);
    expect(pressKey(title, 'Enter').defaultPrevented).toBe(true);
    let {positions} = tableCellPositions(tiptap);
    expect(selectedTableCellPosition(tiptap)).toBe(positions[0]);

    expect(pressKey(input, 'Enter').defaultPrevented).toBe(true);
    expect(tiptap.state.doc.nodeAt(positions[0])?.childCount).toBe(1);
    expect(tiptap.state.doc.nodeAt(positions[0])?.firstChild?.toJSON()).toMatchObject({
      content: [{type: 'hardBreak'}, {type: 'text', text: 'A'}],
      type: 'paragraph'
    });
    expect(selectedTableCellPosition(tiptap)).toBe(positions[0]);

    for(let index = 0; index < 8; ++index) {
      expect(pressKey(input, 'Enter').defaultPrevented).toBe(true);
    }
    const multilineCell = tiptap.state.doc.nodeAt(positions[0])!;
    expect(multilineCell.childCount).toBe(1);
    expect(multilineCell.firstChild?.childCount).toBe(10);
    expect(input.querySelectorAll(
      'td:first-child [data-table-cell-placeholder]'
    )).toHaveLength(0);

    positions = tableCellPositions(tiptap).positions;
    expect(pressKey(input, 'Tab').defaultPrevented).toBe(true);
    expect(selectedTableCellPosition(tiptap)).toBe(positions[1]);
    expect(pressKey(input, 'Tab', {shiftKey: true}).defaultPrevented).toBe(true);
    expect(selectedTableCellPosition(tiptap)).toBe(positions[0]);

    for(let index = 1; index < positions.length; ++index) {
      expect(pressKey(input, 'Tab').defaultPrevented).toBe(true);
      expect(selectedTableCellPosition(tiptap)).toBe(positions[index]);
    }
    expect(pressKey(input, 'Tab').defaultPrevented).toBe(true);
    expect(TableMap.get(tableCellPositions(tiptap).table).height).toBe(3);
    expect(selectedTableCellPosition(tiptap))
    .toBe(tableCellPositions(tiptap).positions[4]);
  });

  test('repairs legacy table cells containing placeholder paragraphs', () => {
    const {editor, tiptap} = mountEditor();
    const document = tableDocument([['']]);
    const wrapper = document.content![0];
    const table = wrapper.content![1];
    const cell = table.content![0].content![0];
    cell.content = [
      {type: 'paragraph', content: [{type: 'text', text: 'A'}]},
      {type: 'paragraph'},
      {type: 'paragraph'},
      {type: 'paragraph', content: [{type: 'text', text: 'B'}]}
    ];

    expect(editor.setDocument(document)).toBe(true);
    const normalizedCell = tiptap.state.doc.nodeAt(
      tableCellPositions(tiptap).positions[0]
    )!;
    expect(normalizedCell.childCount).toBe(1);
    expect(normalizedCell.firstChild?.toJSON()).toEqual({
      type: 'paragraph',
      content: [
        {type: 'text', text: 'A'},
        {type: 'hardBreak'},
        {type: 'hardBreak'},
        {type: 'hardBreak'},
        {type: 'text', text: 'B'}
      ]
    });
  });

  test('links vertical navigation through title and materialized outer paragraphs', () => {
    const {editor, input, tiptap} = mountEditor();
    expect(editor.setDocument(tableDocument([
      ['A', 'B'],
      ['C', 'D']
    ]))).toBe(true);

    let data = tableCellPositions(tiptap);
    editor.restoreSelection({from: data.positions[0] + 2, to: data.positions[0] + 2}, false);
    expect(pressKey(input, 'ArrowUp').defaultPrevented).toBe(true);
    const title = input.querySelector<HTMLElement>('.chat-input-table-title')!;
    expect(document.activeElement).toBe(input);
    expect(tiptap.state.selection.$from.parent.type.name)
    .toBe(CHAT_TABLE_TITLE_NODE_NAME);

    expect(pressKey(title, 'ArrowUp').defaultPrevented).toBe(true);
    expect(tiptap.state.doc.child(0).type.name).toBe('paragraph');
    expect(tiptap.state.doc.child(1).type.name).toBe(CHAT_TABLE_WRAPPER_NODE_NAME);
    expect(tiptap.state.selection.$from.index(0)).toBe(0);

    expect(pressKey(input, 'ArrowDown').defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(input);
    expect(tiptap.state.selection.$from.parent.type.name)
    .toBe(CHAT_TABLE_TITLE_NODE_NAME);

    data = tableCellPositions(tiptap);
    const terminal = terminalParagraphPosition(tiptap);
    editor.restoreSelection({from: terminal + 1, to: terminal + 1}, false);
    expect(pressKey(input, 'ArrowUp').defaultPrevented).toBe(true);
    expect(selectedTableCellPosition(tiptap)).toBe(data.positions[data.positions.length - 1]);

    const lastCell = tiptap.state.doc.nodeAt(data.positions[data.positions.length - 1])!;
    const lastCellEnd = data.positions[data.positions.length - 1] + lastCell.nodeSize - 2;
    editor.restoreSelection({from: lastCellEnd, to: lastCellEnd}, false);
    expect(pressKey(input, 'ArrowDown').defaultPrevented).toBe(true);
    expect(tiptap.state.selection.$from.parent.type.name).toBe('paragraph');
    expect(tiptap.state.selection.$from.index(0)).toBe(2);
  });

  test('moves vertically between table rows before crossing the outer boundaries', () => {
    const {editor, input, tiptap} = mountEditor();
    expect(editor.setDocument(tableDocument([
      ['A', 'B'],
      ['C', 'D']
    ]))).toBe(true);

    const {positions} = tableCellPositions(tiptap);
    editor.restoreSelection({
      from: positions[0] + 3,
      to: positions[0] + 3
    }, false);
    expect(pressKey(input, 'ArrowDown').defaultPrevented).toBe(true);
    expect(selectedTableCellPosition(tiptap)).toBe(positions[2]);

    expect(pressKey(input, 'ArrowUp').defaultPrevented).toBe(true);
    expect(selectedTableCellPosition(tiptap)).toBe(positions[0]);
    expect(tiptap.state.selection.$from.parentOffset).toBe(1);
  });
});
