import {render} from 'solid-js/web';
import createEditor from '@components/chat/inputEditor';
import {InstantViewBlocks} from '@components/instantView';
import {instantViewStyles as styles} from '@components/instantViewFormatting';
import genericTableStyles from '@components/genericTable.module.scss';
import {richMessageToPage} from '@lib/richMessage';
import HotReloadGuard from '@lib/solidjs/hotReloadGuardProvider';
import type {JSONContent} from '@tiptap/core';
import type {EditorView} from '@tiptap/pm/view';

export type RichTableSurface = 'editor' | 'instant-view' | 'message';
const VIEW_SURFACES = ['instant-view', 'message'] as const;

/**
 * One table drawn the three ways it is seen — in the composer, in Instant View and in a message —
 * side by side, in the app's own styles, so a spec can measure what jsdom cannot lay out.
 */
export function mountRichTables(width: number) {
  const grid = document.createElement('div');
  grid.style.cssText = 'position:absolute;inset:0;z-index:2;display:flex;align-items:flex-start;gap:20px;padding:20px;background:white;';
  document.body.append(grid);
  const hosts = {} as Record<RichTableSurface, HTMLElement>;
  for(const surface of ['editor', ...VIEW_SURFACES] as const) {
    const host = hosts[surface] = document.createElement('section');
    host.dataset.richTableSurface = surface;
    host.style.cssText = `width:${width}px;flex:0 0 ${width}px;`;
    grid.append(host);
  }

  const input = document.createElement('div');
  input.className = 'input-message-input';
  input.style.cssText = 'width:100%;max-height:none;overflow:visible;';
  hosts.editor.append(input);
  const editor = createEditor(input);
  editor.setExpanded(true);

  let disposers: VoidFunction[] = [];
  const table = (surface: RichTableSurface) => hosts[surface].querySelector('table')!;
  const cells = (surface: RichTableSurface, row: number) => [
    ...table(surface).querySelectorAll<HTMLElement>(':scope > tbody > tr')[row].children
  ].filter((cell): cell is HTMLElement => cell.tagName === 'TD' || cell.tagName === 'TH');

  return {
    /** Puts the table into the composer and draws what it sends in the other two. */
    setTable(content: JSONContent) {
      if(!editor.setDocument({type: 'doc', content: [content]})) return false;
      this.redrawViews();
      return true;
    },
    redrawViews() {
      disposers.forEach((dispose) => dispose());
      const page = richMessageToPage(editor.getRichMessage().output);
      disposers = VIEW_SURFACES.map((surface) => {
        hosts[surface].replaceChildren();
        return render(() => HotReloadGuard({
          get children() {
            return InstantViewBlocks({
              webPageId: '0',
              page,
              class: surface === 'message' ? styles.RichMessage : undefined,
              openNewPage: () => {},
              collapse: () => {}
            });
          }
        }), hosts[surface]);
      });
    },
    /** Puts the caret at the end of a composer cell, counted across rows. */
    focusCell(index: number) {
      const cell = table('editor').querySelectorAll('th, td')[index];
      const paragraph = cell?.querySelector('[data-chat-input-paragraph]') || cell?.firstElementChild;
      if(!paragraph) return false;
      const {view} = (editor as unknown as {editor: {view: EditorView}}).editor;
      const position = view.posAtDOM(paragraph, 0) + view.state.doc.resolve(view.posAtDOM(paragraph, 0)).parent.content.size;
      editor.restoreSelection({from: position, to: position}, true);
      return view.state.selection.from === position;
    },
    addColumnAfter() {
      return editor.addTableColumnAfter();
    },
    columnWidths(surface: RichTableSurface, row = 0) {
      return cells(surface, row).map((cell) => Math.round(cell.getBoundingClientRect().width * 10) / 10);
    },
    rowHeights(surface: RichTableSurface) {
      return [...table(surface).querySelectorAll<HTMLElement>(':scope > tbody > tr')]
      .map((row) => Math.round(row.getBoundingClientRect().height * 10) / 10);
    },
    /** Whether the table is wider than the room it has, which its wrapper then scrolls. */
    overflows(surface: RichTableSurface) {
      const wrapper = table(surface).parentElement!;
      return wrapper.scrollWidth > wrapper.clientWidth + 1;
    },
    /** Whether a cell's content runs past the cell's edge instead of wrapping inside it. */
    spills(surface: RichTableSurface) {
      return [...table(surface).querySelectorAll<HTMLElement>('th, td')]
      .some((cell) => cell.scrollWidth > cell.clientWidth + 1);
    },
    cellStyle(surface: RichTableSurface, row: number, column: number) {
      const cell = cells(surface, row)[column];
      const style = getComputedStyle(cell);
      return {
        tag: cell.tagName,
        fontWeight: style.fontWeight,
        textAlign: style.textAlign,
        paddingTop: style.paddingTop,
        background: getComputedStyle(cell.parentElement!).backgroundColor
      };
    },
    /** Whether the bordered table's outline is drawn over it. */
    hasBorder(surface: RichTableSurface) {
      const border = table(surface).querySelector<HTMLElement>(`:scope > .${genericTableStyles.border}`);
      return !!border && !border.hidden && getComputedStyle(border).borderTopStyle !== 'none';
    }
  };
}

export type RichTablesHarness = ReturnType<typeof mountRichTables>;
