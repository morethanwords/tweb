import {Extension} from '@tiptap/core';
import {TableKit, TableView} from '@tiptap/extension-table';
import type {Node as ProseMirrorNode} from '@tiptap/pm/model';
import type {EditorState, Transaction} from '@tiptap/pm/state';
import {AllSelection, Plugin, PluginKey, Selection, TextSelection} from '@tiptap/pm/state';
import {
  CellSelection,
  TableMap,
  addColumnAfter as addTableColumnAfter,
  addColumnBefore as addTableColumnBefore,
  addRowAfter as addTableRowAfter,
  addRowBefore as addTableRowBefore,
  cellAround,
  deleteColumn as deleteTableColumn,
  deleteRow as deleteTableRow,
  mergeCells as mergeTableCells,
  splitCell as splitTableCell
} from '@tiptap/pm/tables';
import {type EditorView} from '@tiptap/pm/view';
import {ButtonMenuSync, type ButtonMenuItemOptionsVerifiable} from '@components/buttonMenu';
import createSubmenuTrigger from '@components/createSubmenuTrigger';
import makeIcon from '@components/icon';
import genericTableStyles from '@components/genericTable.module.scss';
import {instantViewStyles} from '@components/instantViewFormatting';
import {isEditorSelectionPreservingTarget} from '@components/chat/inputEditor/toolbarButton';
import {
  ChatInputTableMoveAxis,
  ChatInputTableSelectionKind,
  closeTableRect as expandChatTableRect,
  deleteChatInputTable,
  getChatInputTableSelection,
  getChatInputTableMoveTargets,
  moveChatInputTableAxisRange,
  selectChatInputTableAxis,
  selectChatInputTableRect,
  toggleChatInputTableBooleanAttr
} from '@components/chat/inputEditor/tableCommands';
import {CHAT_TABLE_WRAPPER_DATA_ATTRIBUTE} from '@components/chat/inputEditor/tableSchema';
import {getChatInputTableMenuLayout} from '@components/chat/inputEditor/tableMenuPosition';
import contextMenuController from '@helpers/contextMenuController';
import {getOverlayRoot} from '@helpers/appWindow';
import classNames from '@helpers/string/classNames';
import I18n, {LangPackKey} from '@lib/langPack';
import {tableCellContext} from '@components/chat/inputEditor/extensions/tableNavigation';

type ChatTableSelectionKind = ChatInputTableSelectionKind;

type ChatTableMoveAxis = ChatInputTableMoveAxis;

type ChatTableRect = {
  bottom: number,
  left: number,
  right: number,
  top: number
};

type ChatTableAxisSegment = {
  clientEnd: number,
  clientStart: number,
  index: number,
  size: number,
  start: number
};

type ChatTablePointerSession = {
  pointerId: number,
  remove: VoidFunction
};

type ChatTableRangeDrag = {
  anchorRect: ChatTableRect,
  lastHeadPosition: number,
  pointerId: number,
  startX: number,
  startY: number,
  tablePosition: number
};

type ChatTableMoveDrag = {
  axis: ChatTableMoveAxis,
  fromIndex: number,
  legalTargets: number[],
  pointerId: number,
  selectionCount: number,
  startX: number,
  startY: number,
  toIndex?: number
};

type ChatTableCommand = (
  state: EditorState,
  dispatch?: (transaction: Transaction) => void,
  view?: EditorView
) => boolean;

function createExpandedCellSelection({
  anchorPosition,
  doc,
  headPosition,
  map,
  table,
  tableStart
}: {
  anchorPosition: number,
  doc: ProseMirrorNode,
  headPosition: number,
  map: TableMap,
  table: ProseMirrorNode,
  tableStart: number
}) {
  const anchorCell = map.findCell(anchorPosition - tableStart);
  const headCell = map.findCell(headPosition - tableStart);
  const rect = expandChatTableRect(
    map,
    map.rectBetween(anchorPosition - tableStart, headPosition - tableStart)
  );
  const anchorRow = anchorCell.top <= headCell.top ? rect.top : rect.bottom - 1;
  const anchorColumn = anchorCell.left <= headCell.left ? rect.left : rect.right - 1;
  const headRow = anchorCell.top <= headCell.top ? rect.bottom - 1 : rect.top;
  const headColumn = anchorCell.left <= headCell.left ? rect.right - 1 : rect.left;
  return CellSelection.create(
    doc,
    tableStart + map.positionAt(anchorRow, anchorColumn, table),
    tableStart + map.positionAt(headRow, headColumn, table)
  );
}

function selectedTableCellPositions(state: EditorState) {
  const positions: number[] = [];
  if(state.selection instanceof CellSelection) {
    state.selection.forEachCell((_node, position) => positions.push(position));
  } else {
    const context = tableCellContext(state);
    if(context) positions.push(context.$cell.pos);
  }
  return positions;
}

function setSelectedTableCellAttribute(name: string, value: unknown): ChatTableCommand {
  return (state, dispatch) => {
    const positions = selectedTableCellPositions(state);
    if(!positions.length) return false;
    const changed = positions.some((position) => state.doc.nodeAt(position)?.attrs[name] !== value);
    if(!changed) return true;
    if(dispatch) {
      const transaction = state.tr;
      positions.forEach((position) => {
        const cell = transaction.doc.nodeAt(position);
        if(cell && cell.attrs[name] !== value) {
          transaction.setNodeMarkup(position, undefined, {...cell.attrs, [name]: value});
        }
      });
      dispatch(transaction);
    }
    return true;
  };
}

const toggleSelectedTableCellHeader: ChatTableCommand = (state, dispatch) => {
  const positions = selectedTableCellPositions(state);
  const header = state.schema.nodes.tableHeader;
  const cell = state.schema.nodes.tableCell;
  if(!positions.length || !header || !cell) return false;
  const allHeader = positions.every((position) => state.doc.nodeAt(position)?.type === header);
  if(dispatch) {
    const transaction = state.tr;
    positions.forEach((position) => {
      const node = transaction.doc.nodeAt(position);
      if(node && node.type !== (allHeader ? cell : header)) {
        transaction.setNodeMarkup(position, allHeader ? cell : header, node.attrs);
      }
    });
    dispatch(transaction);
  }
  return true;
};

const chatTableViews = new Set<ChatTableView>();

const CHAT_TABLE_SELECTOR_SIZE = 16;

const CHAT_TABLE_DRAG_THRESHOLD = 4;

const CHAT_TABLE_AUTO_SCROLL_EDGE = 32;

const CHAT_TABLE_AUTO_SCROLL_STEP = 12;

const CHAT_TABLE_EDGE_TOLERANCE = 2;

const CHAT_TABLE_CHROME_PLUGIN_KEY = new PluginKey('chatTableChrome');

function registerChatTableView(_view: EditorView, tableView: ChatTableView) {
  chatTableViews.add(tableView);
}

function unregisterChatTableView(_view: EditorView, tableView: ChatTableView) {
  chatTableViews.delete(tableView);
}

function selectionTablePosition(selection: Selection) {
  for(let depth = selection.$from.depth; depth > 0; --depth) {
    if(selection.$from.node(depth).type.spec.tableRole === 'table') {
      return selection.$from.before(depth);
    }
  }
}

class ChatTableView extends TableView {
  private activeCell?: HTMLTableCellElement;
  private activeCellFrame: HTMLDivElement;
  private autoScrollFrame?: number;
  private autoScrollPoint?: {clientX: number, clientY: number};
  private cellHandle: HTMLButtonElement;
  private closingMenu = false;
  private columnSelectors: HTMLButtonElement[] = [];
  private controls: HTMLDivElement;
  private dragPreview: HTMLDivElement;
  private dropIndicator: HTMLDivElement;
  private menu: HTMLElement;
  private menuKind?: ChatTableSelectionKind;
  private menuOpenedWithKeyboard = false;
  private menuSubmenus = new Set<HTMLElement>();
  private menuSubmenuOptions: ButtonMenuItemOptionsVerifiable[] = [];
  private moveDrag?: ChatTableMoveDrag;
  private pointerSession?: ChatTablePointerSession;
  private pointerTargetCell?: HTMLTableCellElement;
  private rangeDrag?: ChatTableRangeDrag;
  private rangeEndHandle: HTMLButtonElement;
  private resizeObserver?: ResizeObserver;
  private rowSelectors: HTMLButtonElement[] = [];
  private scroll: HTMLDivElement;
  private selectionAxis?: ChatTableMoveAxis;
  private tableBorder: HTMLDivElement;
  private tableSelector: HTMLButtonElement;
  private tableInteractionActive = true;
  private verticalScroller?: HTMLElement;
  private view?: EditorView;

  constructor(
    node: ProseMirrorNode,
    cellMinWidth: number,
    view?: EditorView,
    HTMLAttributes: Record<string, unknown> = {}
  ) {
    super(node, cellMinWidth, view, HTMLAttributes);
    this.view = view;
    this.dom.classList.add('chat-input-table-wrapper', instantViewStyles.Table);
    const ownerDocument = this.dom.ownerDocument;
    this.scroll = ownerDocument.createElement('div');
    this.scroll.className = classNames(genericTableStyles.wrapper, 'no-scrollbar');
    this.dom.insertBefore(this.scroll, this.table);
    this.scroll.append(this.table);
    this.tableBorder = ownerDocument.createElement('div');
    this.tableBorder.className = genericTableStyles.border;
    this.tableBorder.contentEditable = 'false';
    this.table.insertBefore(this.tableBorder, this.contentDOM);

    this.controls = ownerDocument.createElement('div');
    this.controls.className = 'chat-input-table-controls';
    this.controls.contentEditable = 'false';
    this.cellHandle = this.createCellHandle();
    this.tableSelector = this.createTableSelector();
    this.activeCellFrame = ownerDocument.createElement('div');
    this.activeCellFrame.className = 'chat-input-table-active-cell-frame';
    this.activeCellFrame.contentEditable = 'false';
    this.activeCellFrame.hidden = true;
    this.rangeEndHandle = this.createRangeHandle();
    this.dragPreview = ownerDocument.createElement('div');
    this.dragPreview.className = 'chat-input-table-drag-preview';
    this.dragPreview.contentEditable = 'false';
    this.dragPreview.hidden = true;
    this.dropIndicator = ownerDocument.createElement('div');
    this.dropIndicator.className = 'chat-input-table-drop-indicator';
    this.dropIndicator.contentEditable = 'false';
    this.dropIndicator.hidden = true;
    this.menu = ButtonMenuSync({buttons: []});
    this.menu.classList.add('contextmenu', 'chat-input-table-menu');
    this.menu.contentEditable = 'false';
    this.menu.hidden = true;
    this.menu.setAttribute('role', 'menu');
    this.menu.setAttribute(
      'aria-label',
      I18n.format('Chat.Input.Editor.Toolbar.TableCellActions', true)
    );
    this.controls.append(
      this.tableSelector,
      this.cellHandle,
      this.activeCellFrame,
      this.rangeEndHandle,
      this.dragPreview,
      this.dropIndicator
    );
    this.dom.append(this.controls);

    this.cellHandle.addEventListener('click', this.onGripClick);
    this.cellHandle.addEventListener('keydown', this.onGripKeyDown);
    this.cellHandle.addEventListener('pointerdown', this.onGripPointerDown);
    this.menu.addEventListener('keydown', this.onMenuKeyDown);
    this.scroll.addEventListener('scroll', this.onTableScroll, {passive: true});
    this.table.addEventListener('mousedown', this.onTableCellMouseDown);
    this.table.addEventListener('click', this.onTableCellClick);
    this.dom.addEventListener('keydown', this.onTableKeyDown);
    ownerDocument.addEventListener('pointerdown', this.onDocumentPointerDown, true);
    view?.dom.addEventListener('focusin', this.onEditorFocusIn);
    view?.dom.addEventListener('focusout', this.onEditorFocusOut);
    if(view) registerChatTableView(view, this);
    this.updateRichMessageAttributes(node);
    queueMicrotask(() => {
      this.verticalScroller = this.dom.closest<HTMLElement>(
        '.scrollable-y, .bubbles-inner, .custom-scroll'
      ) || undefined;
      this.verticalScroller?.addEventListener('scroll', this.onTableScroll, {passive: true});
      this.refreshChrome();
    });
    const ResizeObserverConstructor = ownerDocument.defaultView?.ResizeObserver;
    if(ResizeObserverConstructor) {
      this.resizeObserver = new ResizeObserverConstructor(this.refreshChrome);
      this.resizeObserver.observe(this.scroll);
      this.resizeObserver.observe(this.table);
    }
  }

  private createCellHandle() {
    const handle = this.dom.ownerDocument.createElement('button');
    handle.type = 'button';
    handle.className = 'chat-input-table-cell-handle chat-input-table-grip';
    handle.contentEditable = 'false';
    handle.hidden = true;
    handle.tabIndex = 0;
    handle.setAttribute(
      'aria-label',
      I18n.format('Chat.Input.Editor.Toolbar.TableCellActions', true)
    );
    handle.setAttribute('aria-haspopup', 'menu');
    handle.setAttribute('aria-expanded', 'false');
    return handle;
  }

  private createTableSelector() {
    const selector = this.dom.ownerDocument.createElement('button');
    selector.type = 'button';
    selector.className = 'chat-input-table-table-selector';
    selector.contentEditable = 'false';
    selector.hidden = true;
    selector.tabIndex = -1;
    selector.setAttribute(
      'aria-label',
      I18n.format('Chat.Input.Editor.Toolbar.TableSelectTable', true)
    );
    selector.addEventListener('pointerdown', (event) => {
      if(
        !this.view ||
        event.button !== 0 ||
        event.isPrimary === false
      ) return;
      const context = this.getContext();
      if(!context) return;
      event.preventDefault();
      event.stopPropagation();
      this.closeMenu();
      this.selectionAxis = undefined;
      selectChatInputTableRect(
        this.view.state,
        (transaction) => this.view?.dispatch(transaction),
        context.tableStart - 1,
        {
          bottom: context.map.height,
          left: 0,
          right: context.map.width,
          top: 0
        }
      );
      this.refreshChrome();
    });
    return selector;
  }

  private createRangeHandle() {
    const handle = this.dom.ownerDocument.createElement('button');
    handle.type = 'button';
    handle.className = classNames(
      'chat-input-table-range-handle',
      'chat-input-table-range-handle-end'
    );
    handle.contentEditable = 'false';
    handle.hidden = true;
    handle.tabIndex = 0;
    handle.setAttribute('aria-label', I18n.format(
      'Chat.Input.Editor.Toolbar.TableSelectionEnd',
      true
    ));
    handle.setAttribute('aria-keyshortcuts', 'ArrowUp ArrowDown ArrowLeft ArrowRight');
    handle.addEventListener('pointerdown', this.startRangeDrag);
    handle.addEventListener('keydown', this.resizeRangeWithKeyboard);
    return handle;
  }

  private openActionsMenu() {
    const context = this.getContext();
    if(!this.view || !context) return;
    this.openMenu(context.selectionKind);
  }

  private onGripClick = (event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
  };

  private onGripKeyDown = (event: KeyboardEvent) => {
    if(event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    event.stopPropagation();
    this.menuOpenedWithKeyboard = true;
    this.openActionsMenu();
    queueMicrotask(() => {
      this.menu.querySelector<HTMLElement>('.btn-menu-item')?.focus();
    });
  };

  private onTableKeyDown = (event: KeyboardEvent) => {
    if(event.key !== 'Escape' || !this.menuKind) return;
    event.preventDefault();
    event.stopPropagation();
    this.closeMenu(false);
    this.cellHandle.focus();
    this.refreshChrome();
  };

  private onTableCellMouseDown = (event: MouseEvent) => {
    if(event.button !== 0) return;
    const target = event.target instanceof Element ? event.target : undefined;
    const cell = target?.closest<HTMLTableCellElement>('td, th');
    if(!cell || !this.table.contains(cell)) return;
    this.tableInteractionActive = true;
    this.pointerTargetCell = cell;
    this.refreshChrome();
    // ProseMirror maps a pointer to its model selection from mousedown. A
    // pointerdown microtask runs before that compatibility event and therefore
    // reads the previous cell. Refresh again after mousedown has propagated;
    // the temporary DOM target is released once model selection catches up.
    queueMicrotask(this.refreshChrome);
  };

  private onTableCellClick = (event: MouseEvent) => {
    const target = event.target instanceof Element ? event.target : undefined;
    const cell = target?.closest<HTMLTableCellElement>('td, th');
    if(!cell || !this.table.contains(cell)) return;
    this.tableInteractionActive = true;
    this.pointerTargetCell = cell;
    this.refreshChrome();
    // Covers touch-generated clicks and browsers that commit the DOM selection
    // at the end of the complete click sequence.
    queueMicrotask(this.refreshChrome);
  };

  private ownsMenuTarget(target: globalThis.Node) {
    if(this.menu.contains(target)) return true;
    for(const submenu of this.menuSubmenus) {
      if(submenu.contains(target)) return true;
    }
    return false;
  }

  private onDocumentPointerDown = (event: PointerEvent) => {
    const target = event.target as globalThis.Node | null;
    if(isEditorSelectionPreservingTarget(target)) return;
    const closesOwnMenu = this.menuKind !== undefined &&
      (target as HTMLElement)?.classList?.contains('btn-menu-overlay');
    const tableBlock = this.dom.closest<HTMLElement>(
      `[${CHAT_TABLE_WRAPPER_DATA_ATTRIBUTE}]`
    );
    if(target && tableBlock?.contains(target)) {
      this.tableInteractionActive = true;
      return;
    }
    if(
      !target ||
      this.ownsMenuTarget(target) ||
      closesOwnMenu
    ) return;
    this.tableInteractionActive = false;
    this.refreshChrome();
  };

  private onEditorFocusIn = () => {
    queueMicrotask(() => {
      if(!this.view || !this.getContext()) return;
      this.tableInteractionActive = true;
      this.refreshChrome();
    });
  };

  private onEditorFocusOut = () => {
    queueMicrotask(() => {
      if(!this.view || this.menuKind || this.menu.classList.contains('active')) return;
      const activeElement = this.dom.ownerDocument.activeElement;
      if(activeElement && this.view.dom.contains(activeElement)) return;
      this.tableInteractionActive = false;
      this.refreshChrome();
    });
  };

  private navigateStandardMenu(menu: HTMLElement, event: KeyboardEvent) {
    const target = (event.target as HTMLElement)?.closest?.<HTMLElement>(
      '.btn-menu-item'
    );
    if(target && (event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault();
      event.stopPropagation();
      target.click();
      if(target.classList.contains('submenu-trigger')) {
        queueMicrotask(() => {
          this.dom.ownerDocument.querySelector<HTMLElement>(
            '.chat-input-table-submenu.active .btn-menu-item'
          )?.focus();
        });
      }
      return true;
    }
    if(!['ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'End', 'Home'].includes(event.key)) {
      return false;
    }

    const items = Array.from(menu.querySelectorAll<HTMLElement>('.btn-menu-item'));
    if(!items.length) return false;
    const current = items.indexOf(this.dom.ownerDocument.activeElement as HTMLElement);
    let next = 0;
    if(event.key === 'End') next = items.length - 1;
    else if(event.key === 'Home') next = 0;
    else if(event.key === 'ArrowUp' || event.key === 'ArrowLeft') {
      next = current <= 0 ? items.length - 1 : current - 1;
    } else {
      next = current < 0 || current === items.length - 1 ? 0 : current + 1;
    }
    event.preventDefault();
    event.stopPropagation();
    items[next].focus();
    return true;
  }

  private onMenuKeyDown = (event: KeyboardEvent) => {
    if(event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      this.closeMenu(false);
      this.cellHandle.focus();
      this.refreshChrome();
      return;
    }
    if(event.key === 'Tab') {
      this.closeMenu();
      return;
    }
    this.navigateStandardMenu(this.menu, event);
  };

  private onMenuViewportChange = (event: Event) => {
    if(
      event.type === 'scroll' &&
      event.target instanceof globalThis.Node &&
      this.menu.contains(event.target)
    ) return;
    this.closeMenu();
  };

  private onTableScroll = () => {
    this.closeMenu();
    this.refreshChrome();
  };

  private resizeRangeWithKeyboard = (event: KeyboardEvent) => {
    if(!['ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowUp'].includes(event.key)) return;
    const context = this.getContext();
    if(!this.view || !context || !(this.view.state.selection instanceof CellSelection)) return;
    const {map, table, tableStart} = context;
    const rect = expandChatTableRect(map, context.selectionRect);
    let row = rect.bottom - 1;
    let column = rect.right - 1;
    if(event.key === 'ArrowUp') row--;
    else if(event.key === 'ArrowDown') row++;
    else if(event.key === 'ArrowLeft') column--;
    else column++;
    row = Math.max(0, Math.min(map.height - 1, row));
    column = Math.max(0, Math.min(map.width - 1, column));

    const startPosition = tableStart + map.positionAt(rect.top, rect.left, table);
    const movingPosition = tableStart + map.positionAt(row, column, table);
    const selection = createExpandedCellSelection({
      anchorPosition: startPosition,
      doc: this.view.state.doc,
      headPosition: movingPosition,
      map,
      table,
      tableStart
    });
    if(!selection.eq(this.view.state.selection)) {
      this.view.dispatch(this.view.state.tr.setSelection(selection).scrollIntoView());
    }
    event.preventDefault();
    event.stopPropagation();
    this.refreshChrome();
  };

  private startRangeDrag = (event: PointerEvent) => {
    if(
      !this.view ||
      event.button !== 0 ||
      event.isPrimary === false
    ) return;
    const context = this.getContext();
    if(!context) return;
    const {map, table, tableStart} = context;
    const selectionRect = expandChatTableRect(map, context.selectionRect);
    const rtl = getComputedStyle(this.table).direction === 'rtl';
    const anchorColumn = rtl ? selectionRect.right - 1 : selectionRect.left;
    const anchorPosition = tableStart + map.positionAt(
      selectionRect.top,
      anchorColumn,
      table
    );
    const anchorRect = map.findCell(anchorPosition - tableStart);
    this.finishRangeDrag();
    this.rangeDrag = {
      anchorRect,
      lastHeadPosition: context.$cell.pos,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      tablePosition: tableStart - 1
    };
    const ownerDocument = this.dom.ownerDocument;
    ownerDocument.addEventListener('pointermove', this.onRangePointerMove, true);
    ownerDocument.addEventListener('pointerup', this.onRangePointerUp, true);
    ownerDocument.addEventListener('pointercancel', this.onRangePointerUp, true);
    ownerDocument.addEventListener('keydown', this.onRangeKeyDown, true);
    this.dom.classList.add('chat-input-table-range-dragging');
    event.preventDefault();
    event.stopPropagation();
  };

  private onRangePointerMove = (event: PointerEvent) => {
    const {rangeDrag, view} = this;
    if(!rangeDrag || !view || event.pointerId !== rangeDrag.pointerId) return;
    const moveX = event.clientX - rangeDrag.startX;
    const moveY = event.clientY - rangeDrag.startY;
    if(Math.max(Math.abs(moveX), Math.abs(moveY)) < CHAT_TABLE_DRAG_THRESHOLD) return;
    const row = this.axisSegmentAt('row', event.clientY);
    const column = this.axisSegmentAt('column', event.clientX);
    const context = this.getContext();
    if(!row || !column || !context || context.tableStart - 1 !== rangeDrag.tablePosition) return;
    const headPosition = context.tableStart + context.map.positionAt(
      row.index,
      column.index,
      context.table
    );
    if(headPosition === rangeDrag.lastHeadPosition) return;
    rangeDrag.lastHeadPosition = headPosition;
    const headRect = context.map.findCell(headPosition - context.tableStart);
    selectChatInputTableRect(
      view.state,
      (transaction) => view.dispatch(transaction),
      rangeDrag.tablePosition,
      {
        bottom: Math.max(rangeDrag.anchorRect.bottom, headRect.bottom),
        left: Math.min(rangeDrag.anchorRect.left, headRect.left),
        right: Math.max(rangeDrag.anchorRect.right, headRect.right),
        top: Math.min(rangeDrag.anchorRect.top, headRect.top)
      }
    );
    event.preventDefault();
    event.stopPropagation();
  };

  private onRangePointerUp = (event: PointerEvent) => {
    if(!this.rangeDrag || event.pointerId !== this.rangeDrag.pointerId) return;
    this.finishRangeDrag();
    event.preventDefault();
    event.stopPropagation();
  };

  private onRangeKeyDown = (event: KeyboardEvent) => {
    if(event.key !== 'Escape' || !this.rangeDrag) return;
    event.preventDefault();
    event.stopPropagation();
    this.finishRangeDrag();
    this.refreshChrome();
  };

  private finishRangeDrag() {
    if(!this.rangeDrag) return;
    const ownerDocument = this.dom.ownerDocument;
    ownerDocument.removeEventListener('pointermove', this.onRangePointerMove, true);
    ownerDocument.removeEventListener('pointerup', this.onRangePointerUp, true);
    ownerDocument.removeEventListener('pointercancel', this.onRangePointerUp, true);
    ownerDocument.removeEventListener('keydown', this.onRangeKeyDown, true);
    this.rangeDrag = undefined;
    this.dom.classList.remove('chat-input-table-range-dragging');
  }

  private createAxisSelector(axis: ChatTableMoveAxis, index: number) {
    const selector = this.dom.ownerDocument.createElement('button');
    selector.type = 'button';
    selector.className = `chat-input-table-${axis}-selector`;
    selector.contentEditable = 'false';
    selector.tabIndex = -1;
    selector.dataset.index = `${index}`;
    selector.setAttribute('aria-label', I18n.format(
      axis === 'row' ?
        'Chat.Input.Editor.Toolbar.TableSelectRow' :
        'Chat.Input.Editor.Toolbar.TableSelectColumn',
      true
    ));
    selector.addEventListener('pointerdown', (event) => (
      this.startAxisSelection(axis, index, event)
    ));
    this.controls.append(selector);
    return selector;
  }

  private ensureAxisSelectors(rows: number, columns: number) {
    while(this.rowSelectors.length < rows) {
      this.rowSelectors.push(this.createAxisSelector('row', this.rowSelectors.length));
    }
    while(this.columnSelectors.length < columns) {
      this.columnSelectors.push(this.createAxisSelector('column', this.columnSelectors.length));
    }
    this.rowSelectors.forEach((selector, index) => {
      selector.hidden = index >= rows;
    });
    this.columnSelectors.forEach((selector, index) => {
      selector.hidden = index >= columns;
    });
  }

  private startPointerSession(
    pointerId: number,
    onMove: (event: PointerEvent) => void,
    onEnd?: VoidFunction,
    onCancel?: VoidFunction
  ) {
    this.finishPointerSession();
    const ownerDocument = this.dom.ownerDocument;
    const handleMove = (event: PointerEvent) => {
      if(event.pointerId === pointerId) onMove(event);
    };
    const handleEnd = (event: PointerEvent) => {
      if(event.pointerId !== pointerId) return;
      this.finishPointerSession();
      onEnd?.();
    };
    const handleCancel = (event: PointerEvent) => {
      if(event.pointerId !== pointerId) return;
      this.finishPointerSession();
      onCancel?.();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if(event.key !== 'Escape') return;
      this.finishPointerSession();
      onCancel?.();
    };
    const remove = () => {
      ownerDocument.removeEventListener('pointermove', handleMove, true);
      ownerDocument.removeEventListener('pointerup', handleEnd, true);
      ownerDocument.removeEventListener('pointercancel', handleCancel, true);
      ownerDocument.removeEventListener('keydown', handleKeyDown, true);
    };
    this.pointerSession = {pointerId, remove};
    ownerDocument.addEventListener('pointermove', handleMove, true);
    ownerDocument.addEventListener('pointerup', handleEnd, true);
    ownerDocument.addEventListener('pointercancel', handleCancel, true);
    ownerDocument.addEventListener('keydown', handleKeyDown, true);
  }

  private finishPointerSession() {
    this.pointerSession?.remove();
    this.pointerSession = undefined;
    this.stopAutoScroll();
  }

  private axisSegments(axis: ChatTableMoveAxis): ChatTableAxisSegment[] {
    const wrapperRect = this.dom.getBoundingClientRect();
    if(axis === 'row') {
      return Array.from(this.table.rows).map((row, index) => {
        const rect = row.getBoundingClientRect();
        return {
          clientEnd: rect.bottom,
          clientStart: rect.top,
          index,
          size: rect.height,
          start: rect.top - wrapperRect.top
        };
      });
    }

    const context = this.getContext();
    if(!context) return [];
    const tableRect = this.table.getBoundingClientRect();
    const columns = Array.from(
      this.table.querySelectorAll<HTMLTableColElement>(':scope > colgroup > col')
    );
    if(columns.length === context.map.width) {
      const measured = columns.map((column, index) => {
        const rect = column.getBoundingClientRect();
        return {
          clientEnd: rect.right,
          clientStart: rect.left,
          index,
          size: rect.width,
          start: rect.left - wrapperRect.left
        };
      });
      if(measured.every(({size}) => size > 0)) return measured;
    }

    const width = context.map.width ? tableRect.width / context.map.width : 0;
    const rtl = getComputedStyle(this.table).direction === 'rtl';
    return Array.from({length: context.map.width}, (_value, index) => {
      const physicalIndex = rtl ? context.map.width - index - 1 : index;
      const clientStart = tableRect.left + width * physicalIndex;
      return {
        clientEnd: clientStart + width,
        clientStart,
        index,
        size: width,
        start: clientStart - wrapperRect.left
      };
    });
  }

  private axisSegmentAt(axis: ChatTableMoveAxis, clientPosition: number) {
    return this.axisSegments(axis).find(({clientEnd, clientStart}) => (
      clientPosition >= clientStart && clientPosition <= clientEnd
    ));
  }

  private selectAxisRange(axis: ChatTableMoveAxis, anchor: number, head: number) {
    const context = this.getContext();
    if(!this.view || !context) return false;
    this.selectionAxis = axis;
    return selectChatInputTableAxis(
      this.view.state,
      (transaction) => this.view?.dispatch(transaction),
      context.tableStart - 1,
      axis,
      Math.min(anchor, head),
      Math.max(anchor, head) + 1
    );
  }

  private startAxisSelection(
    axis: ChatTableMoveAxis,
    index: number,
    event: PointerEvent
  ) {
    if(
      !this.view ||
      event.button !== 0 ||
      event.isPrimary === false
    ) return;
    const context = this.getContext();
    if(!context) return;
    event.preventDefault();
    event.stopPropagation();
    this.closeMenu();

    const {selection} = this.view.state;
    const anchorRect = selection instanceof CellSelection ?
      context.map.findCell(selection.$anchorCell.pos - context.tableStart) :
      undefined;
    const anchor = event.shiftKey &&
      anchorRect &&
      (
        context.selectionKind === axis ||
        (
          context.selectionKind === 'table' &&
          this.selectionAxis === axis
        )
      ) ?
      axis === 'row' ? anchorRect.top : anchorRect.left :
      index;
    this.selectAxisRange(axis, anchor, index);
    let lastIndex = index;
    this.startPointerSession(event.pointerId, (pointerEvent) => {
      pointerEvent.preventDefault();
      const segment = this.axisSegmentAt(
        axis,
        axis === 'row' ? pointerEvent.clientY : pointerEvent.clientX
      );
      if(!segment || segment.index === lastIndex) return;
      lastIndex = segment.index;
      this.selectAxisRange(axis, anchor, lastIndex);
      this.refreshChrome();
    }, () => {
      this.view?.focus();
      this.refreshChrome();
    });
    this.refreshChrome();
  }

  private moveTargetAt(
    drag: ChatTableMoveDrag,
    clientX: number,
    clientY: number
  ) {
    const segments = this.axisSegments(drag.axis);
    const clientPosition = drag.axis === 'row' ? clientY : clientX;
    const segment = segments.find(({clientEnd, clientStart}) => (
      clientPosition >= clientStart && clientPosition <= clientEnd
    ));
    if(!segment) return;
    const rtl = drag.axis === 'column' && getComputedStyle(this.table).direction === 'rtl';
    const before = rtl ?
      clientPosition > (segment.clientStart + segment.clientEnd) / 2 :
      clientPosition < (segment.clientStart + segment.clientEnd) / 2;
    const insertionIndex = before ? segment.index : segment.index + 1;
    let closest: number;
    drag.legalTargets.forEach((target) => {
      if(closest === undefined) {
        closest = target;
        return;
      }
      const insertion = target <= drag.fromIndex ?
        target :
        target + drag.selectionCount;
      const closestInsertion = closest <= drag.fromIndex ?
        closest :
        closest + drag.selectionCount;
      if(
        Math.abs(insertion - insertionIndex) <
        Math.abs(closestInsertion - insertionIndex)
      ) closest = target;
    });
    if(closest === undefined || closest === drag.fromIndex) return;

    const targetInsertion = closest <= drag.fromIndex ?
      closest :
      closest + drag.selectionCount;
    const boundary = segments[targetInsertion];
    const last = segments[segments.length - 1];
    const position = boundary ?
      rtl ? boundary.start + boundary.size : boundary.start :
      rtl ? last?.start || 0 : (last?.start || 0) + (last?.size || 0);
    return {position, toIndex: closest};
  }

  private updateMoveDrag(
    event: Pick<PointerEvent, 'clientX' | 'clientY' | 'pointerId'>,
    scheduleAutoScroll = true
  ) {
    const drag = this.moveDrag;
    if(!drag || event.pointerId !== drag.pointerId) return;
    const moveX = event.clientX - drag.startX;
    const moveY = event.clientY - drag.startY;
    if(
      this.dragPreview.hidden &&
      Math.max(Math.abs(moveX), Math.abs(moveY)) < CHAT_TABLE_DRAG_THRESHOLD
    ) return;

    const bounds = this.selectionBounds(this.selectionCells());
    const wrapperRect = this.dom.getBoundingClientRect();
    if(bounds) {
      this.dragPreview.hidden = false;
      this.dragPreview.style.left = `${
        bounds.left - wrapperRect.left + (drag.axis === 'column' ? moveX : 0)
      }px`;
      this.dragPreview.style.top = `${
        bounds.top - wrapperRect.top + (drag.axis === 'row' ? moveY : 0)
      }px`;
      this.dragPreview.style.width = `${bounds.width}px`;
      this.dragPreview.style.height = `${bounds.height}px`;
    }

    const target = this.moveTargetAt(drag, event.clientX, event.clientY);
    drag.toIndex = target?.toIndex;
    this.dropIndicator.hidden = !target;
    if(target) {
      const tableRect = this.table.getBoundingClientRect();
      if(drag.axis === 'row') {
        this.dropIndicator.className =
          'chat-input-table-drop-indicator chat-input-table-drop-indicator-row';
        this.dropIndicator.style.left = `${tableRect.left - wrapperRect.left}px`;
        this.dropIndicator.style.top = `${target.position}px`;
        this.dropIndicator.style.width = `${tableRect.width}px`;
        this.dropIndicator.style.height = '';
      } else {
        this.dropIndicator.className =
          'chat-input-table-drop-indicator chat-input-table-drop-indicator-column';
        this.dropIndicator.style.left = `${target.position}px`;
        this.dropIndicator.style.top = `${tableRect.top - wrapperRect.top}px`;
        this.dropIndicator.style.width = '';
        this.dropIndicator.style.height = `${tableRect.height}px`;
      }
    }
    this.autoScrollPoint = {clientX: event.clientX, clientY: event.clientY};
    if(scheduleAutoScroll) this.scheduleAutoScroll();
  }

  private finishMoveDrag(cancelled = false) {
    const {moveDrag, view} = this;
    const moved = !cancelled &&
      moveDrag?.toIndex !== undefined &&
      view &&
      moveChatInputTableAxisRange(
        view.state,
        (transaction) => view.dispatch(transaction),
        this.getTablePosition() ?? -1,
        moveDrag.axis,
        moveDrag.fromIndex,
        moveDrag.selectionCount,
        moveDrag.toIndex
      );
    const dragged = !this.dragPreview.hidden;
    this.moveDrag = undefined;
    this.dragPreview.hidden = true;
    this.dropIndicator.hidden = true;
    this.stopAutoScroll();
    if(!dragged && !cancelled) this.openActionsMenu();
    if(moved) view?.focus();
    this.refreshChrome();
  }

  private onGripPointerDown = (event: PointerEvent) => {
    if(
      !this.view ||
      event.button !== 0 ||
      event.isPrimary === false
    ) return;
    const context = this.getContext();
    if(!context) return;
    event.preventDefault();
    event.stopPropagation();
    this.menuOpenedWithKeyboard = false;
    this.closeMenu();
    const updated = this.getContext();
    const axis = updated?.selectionKind === 'row' || updated?.selectionKind === 'column' ?
      updated.selectionKind :
      updated?.selectionKind === 'table' ?
        this.selectionAxis :
        undefined;
    if(!updated || !axis) {
      this.startPointerSession(event.pointerId, () => undefined, () => this.openActionsMenu());
      return;
    }
    const tablePosition = updated.tableStart - 1;
    const legalTargets = getChatInputTableMoveTargets(
      this.view.state,
      tablePosition,
      axis
    );
    if(!legalTargets.length) {
      this.startPointerSession(event.pointerId, () => undefined, () => this.openActionsMenu());
      return;
    }
    const fromIndex = axis === 'row' ?
      updated.selectionRect.top :
      updated.selectionRect.left;
    const selectionCount = axis === 'row' ?
      updated.selectionRect.bottom - updated.selectionRect.top :
      updated.selectionRect.right - updated.selectionRect.left;
    this.moveDrag = {
      axis,
      fromIndex,
      legalTargets,
      pointerId: event.pointerId,
      selectionCount,
      startX: event.clientX,
      startY: event.clientY
    };
    this.startPointerSession(
      event.pointerId,
      (pointerEvent) => {
        pointerEvent.preventDefault();
        this.updateMoveDrag(pointerEvent);
      },
      () => this.finishMoveDrag(),
      () => this.finishMoveDrag(true)
    );
  };

  private scheduleAutoScroll() {
    if(this.autoScrollFrame !== undefined) return;
    this.autoScrollFrame = requestAnimationFrame(() => {
      this.autoScrollFrame = undefined;
      const point = this.autoScrollPoint;
      if(!point || !this.moveDrag) return;
      const horizontalRect = this.scroll.getBoundingClientRect();
      const horizontalDelta = point.clientX < horizontalRect.left + CHAT_TABLE_AUTO_SCROLL_EDGE ?
        -CHAT_TABLE_AUTO_SCROLL_STEP :
        point.clientX > horizontalRect.right - CHAT_TABLE_AUTO_SCROLL_EDGE ?
          CHAT_TABLE_AUTO_SCROLL_STEP :
          0;
      const verticalScroller = this.dom.closest<HTMLElement>(
        '.scrollable-y, .bubbles-inner, .custom-scroll'
      );
      const verticalRect = verticalScroller?.getBoundingClientRect();
      const verticalDelta = verticalRect &&
        point.clientY < verticalRect.top + CHAT_TABLE_AUTO_SCROLL_EDGE ?
        -CHAT_TABLE_AUTO_SCROLL_STEP :
        verticalRect &&
          point.clientY > verticalRect.bottom - CHAT_TABLE_AUTO_SCROLL_EDGE ?
          CHAT_TABLE_AUTO_SCROLL_STEP :
          0;
      if(horizontalDelta) this.scroll.scrollBy({left: horizontalDelta});
      if(verticalDelta) verticalScroller?.scrollBy({top: verticalDelta});
      if(horizontalDelta || verticalDelta) {
        this.refreshChrome();
        const drag = this.moveDrag;
        if(drag) {
          this.updateMoveDrag({
            clientX: point.clientX,
            clientY: point.clientY,
            pointerId: drag.pointerId
          }, false);
        }
        this.scheduleAutoScroll();
      }
    });
  }

  private stopAutoScroll() {
    this.autoScrollPoint = undefined;
    if(this.autoScrollFrame === undefined) return;
    cancelAnimationFrame(this.autoScrollFrame);
    this.autoScrollFrame = undefined;
  }

  private getContext() {
    if(!this.view?.editable) return;
    const {state} = this.view;
    const {selection} = state;
    if(selection instanceof AllSelection) {
      const tablePosition = this.getTablePosition();
      if(tablePosition === undefined) return;
      const table = state.doc.nodeAt(tablePosition);
      if(!table || table.type.name !== 'table') return;
      const tableStart = tablePosition + 1;
      const map = TableMap.get(table);
      const relativeCellPosition = map.positionAt(0, 0, table);
      const $cell = state.doc.resolve(tableStart + relativeCellPosition);
      return {
        $cell,
        cellDepth: -1,
        map,
        rect: map.findCell(relativeCellPosition),
        selectionKind: 'table' as const,
        selectionRect: {bottom: map.height, left: 0, right: map.width, top: 0},
        table,
        tableStart
      };
    }

    const context = tableCellContext(state);
    if(!context) return;
    const tablePosition = context.tableStart - 1;
    if(this.view.nodeDOM(tablePosition) !== this.dom) return;

    if(!(selection instanceof CellSelection) && !selection.empty) return;
    const tableSelection = getChatInputTableSelection(state, tablePosition);
    const selectionRect = tableSelection?.rect || context.rect;
    const selectionKind: ChatTableSelectionKind = tableSelection?.kind || 'cell';
    return {...context, selectionKind, selectionRect};
  }

  private cellElement(position: number) {
    if(!this.view) return;
    const dom = this.view.nodeDOM(position);
    return dom instanceof HTMLTableCellElement ? dom : undefined;
  }

  private selectionCells() {
    if(!this.view) return [] as HTMLTableCellElement[];
    const {selection} = this.view.state;
    if(selection instanceof AllSelection) {
      return this.selectedCellPositions()
      .map((position) => this.cellElement(position))
      .filter((cell): cell is HTMLTableCellElement => !!cell);
    }
    if(!(selection instanceof CellSelection)) {
      return this.activeCell ? [this.activeCell] : [];
    }

    const cells: HTMLTableCellElement[] = [];
    selection.forEachCell((_node, position) => {
      const cell = this.cellElement(position);
      if(cell) cells.push(cell);
    });
    return cells;
  }

  private selectionBounds(cells: HTMLTableCellElement[]) {
    if(!cells.length) return;
    const bounds = cells.map((cell) => cell.getBoundingClientRect());
    const left = Math.min(...bounds.map((rect) => rect.left));
    const right = Math.max(...bounds.map((rect) => rect.right));
    const top = Math.min(...bounds.map((rect) => rect.top));
    const bottom = Math.max(...bounds.map((rect) => rect.bottom));
    return new DOMRect(left, top, right - left, bottom - top);
  }

  private selectedCellPositions() {
    const context = this.getContext();
    if(!context) return [] as number[];
    return context.map.cellsInRect(context.selectionRect)
    .map((position) => context.tableStart + position);
  }

  private selectionAttribute(name: string) {
    if(!this.view) return;
    const values = this.selectedCellPositions().map((position) => (
      this.view?.state.doc.nodeAt(position)?.attrs[name]
    ));
    if(!values.length) return;
    return {
      isUniform: values.every((value) => value === values[0]),
      value: values[0]
    };
  }

  private selectionIsEntirelyHeader() {
    if(!this.view) return false;
    const positions = this.selectedCellPositions();
    return !!positions.length && positions.every((position) => (
      this.view?.state.doc.nodeAt(position)?.type.name === 'tableHeader'
    ));
  }

  private collapseTableCommandSelection(transaction: Transaction) {
    if(transaction.selection instanceof TextSelection && transaction.selection.empty) {
      return;
    }
    const $cell = cellAround(transaction.selection.$from);
    if(!$cell) return;
    const selection = TextSelection.findFrom(
      transaction.doc.resolve(Math.min(transaction.doc.content.size, $cell.pos + 1)),
      1,
      true
    );
    if(selection) transaction.setSelection(selection);
  }

  private run(command: ChatTableCommand, collapseSelection = false) {
    const view = this.view;
    if(!view) return;
    const handled = command(
      view.state,
      (transaction) => {
        if(collapseSelection) this.collapseTableCommandSelection(transaction);
        view.dispatch(transaction);
      },
      view
    );
    if(!handled) return;
    this.closeMenu(false);
    view.focus();
    this.refreshChrome();
    queueMicrotask(this.refreshChrome);
  }

  private standardMenuButton(
    icon: Icon,
    label: LangPackKey,
    command: ChatTableCommand,
    {
      active = false,
      collapseSelection = false,
      destructive = false,
      radio = false,
      separator = false
    }: {
      active?: boolean,
      collapseSelection?: boolean,
      destructive?: boolean,
      radio?: boolean,
      separator?: boolean
    } = {}
  ): ButtonMenuItemOptionsVerifiable {
    return {
      className: classNames(
        active && !radio && 'active',
        radio && 'chat-input-table-menu-radio',
        active && radio && 'is-checked'
      ),
      danger: destructive,
      icon,
      onClick: () => this.run(command, collapseSelection),
      separator,
      text: label
    };
  }

  private applyStandardMenuAccessibility(
    menu: HTMLElement,
    buttons: ButtonMenuItemOptionsVerifiable[]
  ) {
    menu.setAttribute('role', 'menu');
    buttons.forEach((button) => {
      const element = button.element;
      if(!element) return;
      const radio = element.classList.contains('chat-input-table-menu-radio');
      element.contentEditable = 'false';
      element.tabIndex = 0;
      element.setAttribute('role', radio ? 'menuitemradio' : 'menuitem');
      element.setAttribute(
        'aria-label',
        element.querySelector<HTMLElement>('.submenu-label-text')?.innerText ||
          element.querySelector<HTMLElement>('.submenu-label-text')?.textContent ||
          element.querySelector<HTMLElement>('.btn-menu-item-text')?.innerText ||
          element.textContent ||
          ''
      );
      if(this.menuSubmenuOptions.includes(button)) {
        element.setAttribute('aria-haspopup', 'menu');
      }
      if(radio) {
        const checked = element.classList.contains('is-checked');
        element.setAttribute(
          'aria-checked',
          checked ? 'true' : 'false'
        );
        let check = element.querySelector<HTMLElement>(
          '.chat-input-table-menu-check'
        );
        if(checked && !check) {
          check = makeIcon(
            'check',
            'btn-menu-item-icon-right',
            'chat-input-table-menu-check'
          );
          element.append(check);
        } else if(!checked) {
          check?.remove();
        }
      }
    });
  }

  private standardSubmenuButton(
    icon: Icon,
    label: LangPackKey,
    buttons: ButtonMenuItemOptionsVerifiable[],
    separator = false
  ) {
    const option: ButtonMenuItemOptionsVerifiable = createSubmenuTrigger({
      options: {icon, separator, text: label},
      createSubmenu: () => {
        const submenu = ButtonMenuSync({buttons});
        submenu.classList.add('chat-input-table-submenu');
        this.menuSubmenus.add(submenu);
        this.applyStandardMenuAccessibility(submenu, buttons);
        submenu.addEventListener('keydown', (event) => {
          if(event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            contextMenuController.closeMenusByLevel(2);
            option.element?.focus();
            return;
          }
          this.navigateStandardMenu(submenu, event);
        });
        return submenu;
      }
    });
    this.menuSubmenuOptions.push(option);
    return option;
  }

  private renderStandardMenu(kind: ChatTableSelectionKind) {
    const context = this.getContext();
    if(!context) return this.closeMenu();
    kind = context.selectionKind;
    this.menuSubmenuOptions.splice(0).forEach((option) => option.onClose?.());
    this.menuSubmenus.clear();

    const horizontal = this.selectionAttribute('align');
    const vertical = this.selectionAttribute('verticalAlign');
    const isHeaderCell = this.selectionIsEntirelyHeader();
    const alignmentButtons: ButtonMenuItemOptionsVerifiable[] = [
      this.standardMenuButton(
        'align_left_edge',
        'Chat.Input.Editor.Toolbar.TableAlignLeft',
        setSelectedTableCellAttribute('align', null),
        {
          active: !!horizontal?.isUniform && (
            horizontal.value === null ||
            horizontal.value === undefined ||
            horizontal.value === 'left'
          ),
          radio: true
        }
      ),
      this.standardMenuButton(
        'align_horizontal_center',
        'Chat.Input.Editor.Toolbar.TableAlignCenter',
        setSelectedTableCellAttribute('align', 'center'),
        {
          active: !!horizontal?.isUniform && horizontal.value === 'center',
          radio: true
        }
      ),
      this.standardMenuButton(
        'align_right_edge',
        'Chat.Input.Editor.Toolbar.TableAlignRight',
        setSelectedTableCellAttribute('align', 'right'),
        {
          active: !!horizontal?.isUniform && horizontal.value === 'right',
          radio: true
        }
      ),
      this.standardMenuButton(
        'align_top',
        'Chat.Input.Editor.Toolbar.TableAlignTop',
        setSelectedTableCellAttribute('verticalAlign', null),
        {
          active: !!vertical?.isUniform && (
            vertical.value === null ||
            vertical.value === undefined ||
            vertical.value === 'top'
          ),
          radio: true,
          separator: true
        }
      ),
      this.standardMenuButton(
        'align_vertical_center',
        'Chat.Input.Editor.Toolbar.TableAlignMiddle',
        setSelectedTableCellAttribute('verticalAlign', 'middle'),
        {
          active: !!vertical?.isUniform && vertical.value === 'middle',
          radio: true
        }
      ),
      this.standardMenuButton(
        'align_bottom',
        'Chat.Input.Editor.Toolbar.TableAlignBottom',
        setSelectedTableCellAttribute('verticalAlign', 'bottom'),
        {
          active: !!vertical?.isUniform && vertical.value === 'bottom',
          radio: true
        }
      )
    ];
    const tablePosition = context.tableStart - 1;
    const rtl = getComputedStyle(this.table).direction === 'rtl';
    const selectedRowCount = context.selectionRect.bottom - context.selectionRect.top;
    const selectedColumnCount = context.selectionRect.right - context.selectionRect.left;
    const deleteCellButtons: ButtonMenuItemOptionsVerifiable[] = [];
    if(selectedRowCount < context.map.height) {
      deleteCellButtons.push(this.standardMenuButton(
        'delete',
        selectedRowCount > 1 ?
          'Chat.Input.Editor.Toolbar.TableDeleteRows' :
          'Chat.Input.Editor.Toolbar.TableDeleteRow',
        deleteTableRow,
        {collapseSelection: true}
      ));
    }
    if(selectedColumnCount < context.map.width) {
      deleteCellButtons.push(this.standardMenuButton(
        'delete',
        selectedColumnCount > 1 ?
          'Chat.Input.Editor.Toolbar.TableDeleteColumns' :
          'Chat.Input.Editor.Toolbar.TableDeleteColumn',
        deleteTableColumn,
        {collapseSelection: true}
      ));
    }
    const buttons: ButtonMenuItemOptionsVerifiable[] = [
      this.standardSubmenuButton(
        'table_add',
        'Chat.Input.Editor.Toolbar.TableAddCells',
        [
          this.standardMenuButton(
            'arrow_up',
            'Chat.Input.Editor.Toolbar.TableRowAbove',
            addTableRowBefore,
            {collapseSelection: true}
          ),
          this.standardMenuButton(
            'arrow_down',
            'Chat.Input.Editor.Toolbar.TableRowBelow',
            addTableRowAfter,
            {collapseSelection: true}
          ),
          this.standardMenuButton(
            'arrow_left_square_add',
            'Chat.Input.Editor.Toolbar.TableColumnLeft',
            rtl ? addTableColumnAfter : addTableColumnBefore,
            {collapseSelection: true, separator: true}
          ),
          this.standardMenuButton(
            'arrow_right_square_add',
            'Chat.Input.Editor.Toolbar.TableColumnRight',
            rtl ? addTableColumnBefore : addTableColumnAfter,
            {collapseSelection: true}
          )
        ]
      ),
      this.standardSubmenuButton(
        'align_left',
        'Chat.Input.Editor.Toolbar.TableAlign',
        alignmentButtons
      )
    ];
    if(deleteCellButtons.length) {
      buttons.push(this.standardSubmenuButton(
        'delete',
        'Chat.Input.Editor.Toolbar.TableDeleteCells',
        deleteCellButtons
      ));
    }

    const selectedPositions = context.map.cellsInRect(context.selectionRect);
    const cell = selectedPositions.length === 1 ?
      context.table.nodeAt(selectedPositions[0]) :
      undefined;
    const canMerge = !!this.view && mergeTableCells(this.view.state);
    const canSplit = !!this.view && splitTableCell(this.view.state);
    const canUnite = selectedPositions.length > 1 && canMerge;
    const canSplitSelectedCell = canSplit || (
      cell && (cell.attrs.colspan > 1 || cell.attrs.rowspan > 1)
    );
    if(canUnite || canSplitSelectedCell) {
      const mergeIcon: Icon = selectedRowCount > 1 && selectedColumnCount === 1 ?
        'merge_vertical' :
        'merge_horizontal';
      buttons.push(canSplitSelectedCell ?
        this.standardMenuButton(
          mergeIcon,
          'Chat.Input.Editor.Toolbar.TableSplitCell',
          splitTableCell,
          {separator: true}
        ) :
        this.standardMenuButton(
          mergeIcon,
          'Chat.Input.Editor.Toolbar.TableUniteCells',
          mergeTableCells,
          {separator: true}
        )
      );
    }

    buttons.push(
      this.standardMenuButton(
        'bold',
        'Chat.Input.Editor.Toolbar.TableHeaderCell',
        toggleSelectedTableCellHeader,
        {
          active: isHeaderCell,
          separator: !canUnite && !canSplitSelectedCell
        }
      ),
      this.standardMenuButton(
        'table',
        'Chat.Input.Editor.Toolbar.TableBorderless',
        (state, dispatch) => toggleChatInputTableBooleanAttr(
          state,
          dispatch,
          tablePosition,
          'bordered'
        ),
        {active: !context.table.attrs.bordered, separator: true}
      ),
      this.standardMenuButton(
        'align_center',
        'Chat.Input.Editor.Toolbar.TableStriped',
        (state, dispatch) => toggleChatInputTableBooleanAttr(
          state,
          dispatch,
          tablePosition,
          'striped'
        ),
        {active: !!context.table.attrs.striped}
      ),
      this.standardMenuButton(
        'app_shrink',
        'Chat.Input.Editor.Toolbar.TableCompact',
        (state, dispatch) => toggleChatInputTableBooleanAttr(
          state,
          dispatch,
          tablePosition,
          'compact'
        ),
        {active: !!context.table.attrs.compact}
      )
    );

    const axis = kind === 'row' || kind === 'column' ?
      kind :
      kind === 'table' ?
        this.selectionAxis :
        undefined;
    if(axis) {
      const targets = this.view ?
        getChatInputTableMoveTargets(this.view.state, tablePosition, axis) :
        [];
      const fromIndex = axis === 'row' ?
        context.selectionRect.top :
        context.selectionRect.left;
      const selectionCount = axis === 'row' ?
        context.selectionRect.bottom - context.selectionRect.top :
        context.selectionRect.right - context.selectionRect.left;
      const backwardDelta = axis === 'column' && rtl ? 1 : -1;
      const forwardDelta = -backwardDelta;
      const moveCommand = (delta: number): ChatTableCommand => (state, dispatch) => (
        moveChatInputTableAxisRange(
          state,
          dispatch,
          tablePosition,
          axis,
          fromIndex,
          selectionCount,
          fromIndex + delta
        )
      );
      const moveButtons: ButtonMenuItemOptionsVerifiable[] = [];
      if(targets.includes(fromIndex + backwardDelta)) {
        moveButtons.push(this.standardMenuButton(
          axis === 'row' ? 'arrow_up' : 'arrow_left_square',
          axis === 'row' ?
            'Chat.Input.Editor.Toolbar.TableMoveUp' :
            'Chat.Input.Editor.Toolbar.TableMoveLeft',
          moveCommand(backwardDelta)
        ));
      }
      if(targets.includes(fromIndex + forwardDelta)) {
        moveButtons.push(this.standardMenuButton(
          axis === 'row' ? 'arrow_down' : 'arrow_right_square',
          axis === 'row' ?
            'Chat.Input.Editor.Toolbar.TableMoveDown' :
            'Chat.Input.Editor.Toolbar.TableMoveRight',
          moveCommand(forwardDelta)
        ));
      }
      if(moveButtons.length) {
        buttons.push(this.standardSubmenuButton(
          'select',
          'Chat.Input.Editor.Toolbar.TableMove',
          moveButtons
        ));
      }
    }

    if(kind === 'table') {
      buttons.push(this.standardMenuButton(
        'delete',
        'Chat.Input.Editor.Toolbar.TableDelete',
        (state, dispatch) => deleteChatInputTable(state, dispatch),
        {
          destructive: true,
          separator: true
        }
      ));
    }

    const standardMenu = ButtonMenuSync({buttons});
    this.menu.replaceChildren(...standardMenu.childNodes);
    this.applyStandardMenuAccessibility(this.menu, buttons);
    this.menuSubmenuOptions.forEach((option) => {
      option.element?.setAttribute('aria-haspopup', 'menu');
      option.onOpen?.();
    });
  }

  private positionMenu() {
    if(!this.menuKind || this.menu.hidden) return;
    const ownerDocument = this.dom.ownerDocument;
    const ownerWindow = ownerDocument.defaultView;
    const triggerRect = this.cellHandle.getBoundingClientRect();
    const menuRect = this.menu.getBoundingClientRect();
    const visualViewport = ownerWindow?.visualViewport;
    const {left, maxHeight, maxWidth, top} = getChatInputTableMenuLayout(
      triggerRect,
      menuRect,
      {
        height: visualViewport?.height ||
          ownerDocument.documentElement.clientHeight ||
          ownerWindow?.innerHeight ||
          0,
        left: visualViewport?.offsetLeft,
        top: visualViewport?.offsetTop,
        width: visualViewport?.width ||
          ownerDocument.documentElement.clientWidth ||
          ownerWindow?.innerWidth ||
          0
      }
    );
    this.menu.style.maxHeight = `${maxHeight}px`;
    this.menu.style.maxWidth = `${maxWidth}px`;
    this.menu.style.left = `${left}px`;
    this.menu.style.top = `${top}px`;
  }

  private openMenu(kind: ChatTableSelectionKind) {
    if(this.menu.classList.contains('active')) {
      this.closeMenu(false);
    } else if(contextMenuController.isOpened()) {
      contextMenuController.close();
    }
    this.menuKind = kind;
    this.renderStandardMenu(kind);
    getOverlayRoot().append(this.menu);
    this.menu.hidden = false;
    this.dom.classList.add('chat-input-table-menu-open');
    this.cellHandle.setAttribute('aria-expanded', 'true');
    const ownerDocument = this.dom.ownerDocument;
    ownerDocument.addEventListener('scroll', this.onMenuViewportChange, true);
    ownerDocument.defaultView?.addEventListener('resize', this.onMenuViewportChange);
    ownerDocument.defaultView?.visualViewport?.addEventListener(
      'resize',
      this.onMenuViewportChange
    );
    ownerDocument.defaultView?.visualViewport?.addEventListener(
      'scroll',
      this.onMenuViewportChange
    );
    this.positionMenu();
    contextMenuController.openBtnMenu(
      this.menu,
      () => this.closeMenu(false, true),
      this.cellHandle
    );
  }

  private closeMenu(restoreKeyboardFocus = true, fromController = false) {
    if(this.closingMenu) return;
    this.closingMenu = true;
    const ownerDocument = this.dom.ownerDocument;
    const shouldRestoreFocus = restoreKeyboardFocus &&
      this.menuOpenedWithKeyboard &&
      this.menuKind !== undefined;
    if(!fromController && this.menu.classList.contains('active')) {
      contextMenuController.close();
    }
    ownerDocument.removeEventListener('scroll', this.onMenuViewportChange, true);
    ownerDocument.defaultView?.removeEventListener('resize', this.onMenuViewportChange);
    ownerDocument.defaultView?.visualViewport?.removeEventListener(
      'resize',
      this.onMenuViewportChange
    );
    ownerDocument.defaultView?.visualViewport?.removeEventListener(
      'scroll',
      this.onMenuViewportChange
    );
    this.menuSubmenuOptions.splice(0).forEach((option) => option.onClose?.());
    this.menuSubmenus.clear();
    this.menuKind = undefined;
    this.menuOpenedWithKeyboard = false;
    // Keep the reusable menu rendered at its current position while the
    // standard .btn-menu transition removes opacity and scale. The inactive
    // menu becomes visibility:hidden through the shared menu CSS; setting the
    // hidden attribute here would turn it into display:none in the same frame.
    this.dom.classList.remove('chat-input-table-menu-open');
    this.cellHandle.setAttribute('aria-expanded', 'false');
    if(shouldRestoreFocus) queueMicrotask(() => this.cellHandle.focus());
    this.closingMenu = false;
  }

  public refreshChrome = () => {
    const documentSelected = this.view?.state.selection instanceof AllSelection;
    const context = this.tableInteractionActive || documentSelected ?
      this.getContext() :
      undefined;

    if(!context) {
      this.pointerTargetCell = undefined;
      this.activeCell = undefined;
      this.activeCellFrame.hidden = true;
      this.tableSelector.hidden = true;
      this.rowSelectors.forEach((selector) => selector.hidden = true);
      this.columnSelectors.forEach((selector) => selector.hidden = true);
      this.cellHandle.hidden = true;
      this.rangeEndHandle.hidden = true;
      this.closeMenu();
      return;
    }
    if(context.selectionKind === 'cell') this.selectionAxis = undefined;

    const activePosition = context.tableStart + (
      context.map.positionAt(context.rect.top, context.rect.left, context.table)
    );
    const modelActiveCell = this.cellElement(activePosition);
    if(this.pointerTargetCell === modelActiveCell) this.pointerTargetCell = undefined;
    const pointerTargetCell = this.pointerTargetCell?.isConnected ?
      this.pointerTargetCell :
      undefined;
    this.activeCell = pointerTargetCell || modelActiveCell;

    const selectionKind = pointerTargetCell ? 'cell' : context.selectionKind;
    const cells = pointerTargetCell ? [pointerTargetCell] : this.selectionCells();
    const bounds = this.selectionBounds(cells) || this.activeCell?.getBoundingClientRect();
    if(!bounds) {
      this.activeCellFrame.hidden = true;
      this.cellHandle.hidden = true;
      this.rangeEndHandle.hidden = true;
      return;
    }
    const tableRect = this.table.getBoundingClientRect();
    const wrapperRect = this.dom.getBoundingClientRect();
    this.activeCellFrame.hidden = false;
    const touchesTop = bounds.top <= tableRect.top + CHAT_TABLE_EDGE_TOLERANCE;
    const touchesRight = bounds.right >= tableRect.right - CHAT_TABLE_EDGE_TOLERANCE;
    const touchesBottom = bounds.bottom >= tableRect.bottom - CHAT_TABLE_EDGE_TOLERANCE;
    const touchesLeft = bounds.left <= tableRect.left + CHAT_TABLE_EDGE_TOLERANCE;
    this.activeCellFrame.classList.toggle('has-top-left-radius', touchesTop && touchesLeft);
    this.activeCellFrame.classList.toggle('has-top-right-radius', touchesTop && touchesRight);
    this.activeCellFrame.classList.toggle(
      'has-bottom-right-radius',
      touchesBottom && touchesRight
    );
    this.activeCellFrame.classList.toggle(
      'has-bottom-left-radius',
      touchesBottom && touchesLeft
    );
    this.activeCellFrame.style.left = `${bounds.left - wrapperRect.left}px`;
    this.activeCellFrame.style.top = `${bounds.top - wrapperRect.top}px`;
    this.activeCellFrame.style.width = `${bounds.width}px`;
    this.activeCellFrame.style.height = `${bounds.height}px`;
    if(documentSelected) {
      this.tableSelector.hidden = true;
      this.rowSelectors.forEach((selector) => selector.hidden = true);
      this.columnSelectors.forEach((selector) => selector.hidden = true);
      this.cellHandle.hidden = true;
      this.rangeEndHandle.hidden = true;
      this.closeMenu();
      return;
    }
    this.ensureAxisSelectors(context.map.height, context.map.width);
    const rtl = getComputedStyle(this.table).direction === 'rtl';
    const tableInlineEdge = rtl ?
      tableRect.right - wrapperRect.left :
      tableRect.left - wrapperRect.left - CHAT_TABLE_SELECTOR_SIZE;
    this.tableSelector.hidden = false;
    this.tableSelector.style.left = `${tableInlineEdge}px`;
    this.tableSelector.style.top = `${
      tableRect.top - wrapperRect.top - CHAT_TABLE_SELECTOR_SIZE
    }px`;
    this.tableSelector.style.width = `${CHAT_TABLE_SELECTOR_SIZE}px`;
    this.tableSelector.style.height = `${CHAT_TABLE_SELECTOR_SIZE}px`;
    this.axisSegments('row').forEach((segment) => {
      const selector = this.rowSelectors[segment.index];
      selector.hidden = false;
      selector.style.left = `${tableInlineEdge}px`;
      selector.style.top = `${segment.start}px`;
      selector.style.width = `${CHAT_TABLE_SELECTOR_SIZE}px`;
      selector.style.height = `${segment.size}px`;
    });
    this.axisSegments('column').forEach((segment) => {
      const selector = this.columnSelectors[segment.index];
      selector.hidden = false;
      selector.style.left = `${segment.start}px`;
      selector.style.top = `${
        tableRect.top - wrapperRect.top - CHAT_TABLE_SELECTOR_SIZE
      }px`;
      selector.style.width = `${segment.size}px`;
      selector.style.height = `${CHAT_TABLE_SELECTOR_SIZE}px`;
    });

    this.cellHandle.hidden = false;
    if(selectionKind === 'row') {
      this.cellHandle.style.left = `${rtl ?
        bounds.right - wrapperRect.left :
        bounds.left - wrapperRect.left
      }px`;
      this.cellHandle.style.top = `${
        (bounds.top + bounds.bottom) / 2 - wrapperRect.top
      }px`;
      this.cellHandle.classList.add('is-row');
    } else {
      this.cellHandle.style.left = `${
        (bounds.left + bounds.right) / 2 - wrapperRect.left
      }px`;
      this.cellHandle.style.top = `${bounds.top - wrapperRect.top}px`;
      this.cellHandle.classList.remove('is-row');
    }
    const moveAxis = selectionKind === 'row' || selectionKind === 'column' ?
      selectionKind :
      selectionKind === 'table' ?
        this.selectionAxis :
        undefined;
    const draggable = Boolean(moveAxis && this.view && getChatInputTableMoveTargets(
      this.view.state,
      context.tableStart - 1,
      moveAxis
    ).length);
    this.cellHandle.classList.toggle('is-draggable', draggable);

    const rangeControlsVisible = !!this.view;
    this.rangeEndHandle.hidden = !rangeControlsVisible;
    if(rangeControlsVisible) {
      this.rangeEndHandle.style.left = `${bounds.right - wrapperRect.left}px`;
      this.rangeEndHandle.style.top = `${bounds.bottom - wrapperRect.top}px`;
    }

    if(this.menuKind && this.menuKind !== selectionKind) {
      this.closeMenu();
    } else if(this.menuKind) {
      this.renderStandardMenu(this.menuKind);
    }
    this.cellHandle.setAttribute('aria-expanded', this.menuKind ? 'true' : 'false');
  };

  private updateRichMessageAttributes(node: ProseMirrorNode) {
    this.table.dataset.bordered = node.attrs.bordered ? 'true' : 'false';
    this.table.classList.toggle(genericTableStyles.bordered, !!node.attrs.bordered);
    this.table.classList.toggle(genericTableStyles.striped, !!node.attrs.striped);
    this.tableBorder.hidden = !node.attrs.bordered;
    if(node.attrs.striped) this.table.dataset.striped = 'true';
    else delete this.table.dataset.striped;
    this.dom.classList.toggle(instantViewStyles.TableCompact, !!node.attrs.compact);
  }

  public update(node: ProseMirrorNode) {
    if(!super.update(node)) return false;
    this.updateRichMessageAttributes(node);
    queueMicrotask(() => {
      this.refreshChrome();
    });
    return true;
  }

  public getTablePosition() {
    if(!this.view) return;
    if(!this.contentDOM.isConnected) return;
    try {
      const position = this.view.posAtDOM(this.contentDOM, 0) - 1;
      return position >= 0 ? position : undefined;
    } catch{
      return;
    }
  }

  public stopEvent(event: Event) {
    return event.target instanceof globalThis.Node && (
      this.controls.contains(event.target) ||
      this.menu.contains(event.target)
    );
  }

  public destroy() {
    this.finishRangeDrag();
    this.finishPointerSession();
    this.resizeObserver?.disconnect();
    this.resizeObserver = undefined;
    this.scroll.removeEventListener('scroll', this.onTableScroll);
    this.verticalScroller?.removeEventListener('scroll', this.onTableScroll);
    this.verticalScroller = undefined;
    this.dom.removeEventListener('keydown', this.onTableKeyDown);
    this.table.removeEventListener('mousedown', this.onTableCellMouseDown);
    this.table.removeEventListener('click', this.onTableCellClick);
    this.dom.ownerDocument.removeEventListener('pointerdown', this.onDocumentPointerDown, true);
    this.view?.dom.removeEventListener('focusin', this.onEditorFocusIn);
    this.view?.dom.removeEventListener('focusout', this.onEditorFocusOut);
    this.cellHandle.removeEventListener('click', this.onGripClick);
    this.cellHandle.removeEventListener('keydown', this.onGripKeyDown);
    this.cellHandle.removeEventListener('pointerdown', this.onGripPointerDown);
    this.menu.removeEventListener('keydown', this.onMenuKeyDown);
    this.closeMenu(false);
    this.menu.remove();
    if(this.view) unregisterChatTableView(this.view, this);
    this.view = undefined;
  }
}

export const ChatTableKit = TableKit.configure({
  table: {
    allowTableNodeSelection: true,
    cellMinWidth: 64,
    HTMLAttributes: {class: classNames('chat-input-table', genericTableStyles.genericTable)},
    renderWrapper: true,
    resizable: false,
    View: ChatTableView
  },
  tableCell: false,
  tableHeader: false,
  tableRow: {
    HTMLAttributes: {class: classNames('chat-input-table-row', genericTableStyles.genericRow)}
  }
});

export const ChatTableChrome = Extension.create({
  name: 'chatTableChrome',

  addProseMirrorPlugins() {
    return [new Plugin({
      key: CHAT_TABLE_CHROME_PLUGIN_KEY,
      view(editorView) {
        let documentSelected = editorView.state.selection instanceof AllSelection;
        return {
          update(updatedView, previousState) {
            if(previousState.selection.eq(updatedView.state.selection)) return;
            const nextDocumentSelected = updatedView.state.selection instanceof AllSelection;
            const refreshEveryTable = documentSelected || nextDocumentSelected;
            documentSelected = nextDocumentSelected;
            const activeTablePositions = new Set([
              selectionTablePosition(previousState.selection),
              selectionTablePosition(updatedView.state.selection)
            ]);
            chatTableViews.forEach((tableView) => {
              if(!updatedView.dom.contains(tableView.dom)) return;
              if(
                refreshEveryTable ||
                activeTablePositions.has(tableView.getTablePosition())
              ) {
                tableView.refreshChrome();
              }
            });
          }
        };
      }
    })];
  }
});
