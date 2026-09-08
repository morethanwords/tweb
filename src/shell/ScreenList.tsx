import {For, Show, createEffect, createMemo, createSignal, onCleanup} from 'solid-js';
import {Portal} from 'solid-js/web';
import {documentTransitions, formatStepNumber, stepReference, stepSummary, folderStepIds, isFallbackStep, folderDeletionReason, deletionReason} from './core';
import type {ShellDocument} from './core/types';
import {ScreenNameInput} from './ScreenNameInput';
import {createScreenDrag} from './screen-drag';
import './FolderSidebar.scss';

export interface ScreenListProps {
  document: ShellDocument; selectedStepId: string;
  revision: number; dragDisabled: boolean;
  onSelect: (id: string) => void; onAdd: () => void; addDisabled: boolean;
  onMove: (stepId: string, index: number, baseRevision: number) => void;
  onExternalHover: (stepId: string, x: number, y: number) => boolean;
  onExternalDrop: (stepId: string, x: number, y: number, baseRevision: number) => 'changed' | 'noop' | 'moved' | 'kept' | false;
  onExternalCancel: () => void; onInteractionStart: () => boolean | void;
  onDragStart: () => boolean | void;
  linkTargetStepId?: string | null;
  /** Folder tab under a dragged screen. */
  dropTargetFolderId?: string | null;
  renamingStepId?: string; renameValue: string; onRename: (id: string) => void;
  onRenameInput: (value: string) => void; onRenameFinish: (cancel?: boolean) => void;
  composing: (value: boolean) => void;
  /** Hovering a screen avatar peeks that screen in the chat; null ends the peek. */
  onPeek: (stepId: string | null) => void;
  /** Sidebar deletion runs only after the inline confirmation. */
  onDelete: (stepId: string) => void; deleteDisabled: boolean;
  selectedFolderId: string; onSelectFolder: (id: string) => void;
  onAddFolder: () => void; onDeleteFolder: (id: string) => void;
  folderAddDisabled: boolean; folderEditingDisabled: boolean;
  renamingFolderId?: string; folderRenameValue: string;
  onRenameFolder: (id: string) => void;
  onFolderRenameInput: (value: string) => void;
  onFolderRenameFinish: (cancel?: boolean) => void;
}

export function ScreenList(props: ScreenListProps) {
  const hasLogic = createMemo(() => Object.values(props.document.blocks).some(block => block.type !== 'message'));
  const links = createMemo(() => hasLogic() ? documentTransitions(props.document).filter(link => link.transition.type === 'screen') : []);
  const incoming = (id: string) => links().filter(link => link.transition.type === 'screen' && link.transition.screenId === id);
  const outgoing = (id: string) => links().filter(link => link.stepId === id);
  const folderId = createMemo(() => Object.hasOwn(props.document.folders, props.selectedFolderId) ? props.selectedFolderId : props.document.folderOrder[0]);
  const screens = createMemo(() => folderStepIds(props.document, folderId()));
  const folderTitle = () => props.document.content.folders[folderId()].title;
  const deleteReason = () => folderDeletionReason(props.document, folderId());
  const [menuOpen, setMenuOpen] = createSignal(false);
  const [menuNight, setMenuNight] = createSignal(false);
  const [menuPositioned, setMenuPositioned] = createSignal(false);
  let menuFolderId: string | undefined;
  let menuButton!: HTMLButtonElement, menu!: HTMLDivElement;
  let screenList!: HTMLDivElement;
  let frame: number | undefined;
  let disposed = false;
  const viewport = window.visualViewport;
  const screenDrag = createScreenDrag({
    document: () => props.document, revision: () => props.revision,
    order: () => props.document.folders[folderId()].stepIds,
    container: () => screenList, disabled: () => props.dragDisabled,
    onInteractionStart: props.onInteractionStart, onDragStart: props.onDragStart, onMove: props.onMove,
    onExternalHover: props.onExternalHover, onExternalDrop: props.onExternalDrop, onExternalCancel: props.onExternalCancel
  });

  function closeMenu(restoreFocus = false): void {
    setMenuOpen(false);
    if(restoreFocus && menuButton.isConnected) menuButton.focus({preventScroll: true});
  }
  function positionMenu(): void {
    if(disposed || !menuOpen() || !menu?.isConnected) return;
    const left = viewport?.offsetLeft ?? 0, top = viewport?.offsetTop ?? 0;
    const width = viewport?.width ?? window.innerWidth, height = viewport?.height ?? window.innerHeight;
    const bounds = menuButton.getBoundingClientRect();
    menu.style.width = `${Math.min(218, Math.max(0, width - 24))}px`;
    menu.style.maxHeight = `${Math.max(0, height - 24)}px`;
    const box = menu.getBoundingClientRect();
    menu.style.left = `${Math.max(left + 12, Math.min(bounds.right - box.width, left + width - box.width - 12))}px`;
    const below = bounds.bottom + 4;
    menu.style.top = `${Math.max(top + 12, Math.min(below + box.height <= top + height - 12 ? below : bounds.top - box.height - 4, top + height - box.height - 12))}px`;
    setMenuPositioned(true);
  }
  function schedulePosition(): void {
    if(disposed || !menuOpen() || frame !== undefined) return;
    frame = requestAnimationFrame(() => {frame = undefined; positionMenu();});
  }
  function outside(event: PointerEvent): void {
    if(event.target instanceof Node && !menu.contains(event.target) && !menuButton.contains(event.target)) closeMenu();
  }
  function menuKeys(event: KeyboardEvent): void {
    if(event.key === 'Escape') {event.preventDefault(); event.stopPropagation(); closeMenu(true);}
    else if(event.key === 'Tab') {menuButton.focus({preventScroll: true}); closeMenu();}
    else if(['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      const items = [...menu.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')];
      const index = items.findIndex(item => item === document.activeElement);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
      items[next]?.focus({preventScroll: true});
    }
  }
  createEffect(() => {
    const current = folderId(), disabled = props.folderEditingDisabled;
    if(disabled || menuFolderId && current !== menuFolderId) setMenuOpen(false);
  });
  createEffect(() => {
    if(!menuOpen()) return;
    let active = true;
    queueMicrotask(() => {
      if(!active || disposed || !menuOpen()) return;
      positionMenu(); menu.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus({preventScroll: true});
    });
    window.addEventListener('pointerdown', outside, true);
    window.addEventListener('keydown', menuKeys, true);
    window.addEventListener('resize', schedulePosition);
    document.addEventListener('scroll', schedulePosition, true);
    viewport?.addEventListener('resize', schedulePosition);
    viewport?.addEventListener('scroll', schedulePosition);
    onCleanup(() => {
      active = false;
      if(frame !== undefined) {cancelAnimationFrame(frame); frame = undefined;}
      window.removeEventListener('pointerdown', outside, true);
      window.removeEventListener('keydown', menuKeys, true);
      window.removeEventListener('resize', schedulePosition);
      document.removeEventListener('scroll', schedulePosition, true);
      viewport?.removeEventListener('resize', schedulePosition);
      viewport?.removeEventListener('scroll', schedulePosition);
    });
  });
  let peekTimer: ReturnType<typeof setTimeout> | undefined;
  let peeking = false;
  function endPeek(): void {
    if(peekTimer !== undefined) {clearTimeout(peekTimer); peekTimer = undefined;}
    if(peeking) {peeking = false; props.onPeek(null);}
  }
  function schedulePeek(id: string): void {
    endPeek();
    peekTimer = setTimeout(() => {
      peekTimer = undefined;
      if(disposed || screenDrag.dragging() || !Object.hasOwn(props.document.steps, id)) return;
      peeking = true; props.onPeek(id);
    }, 120);
  }
  createEffect(() => {if(screenDrag.dragging()) endPeek();});
  const [confirmDelete, setConfirmDelete] = createSignal<string | null>(null);
  createEffect(() => {folderId(); if(props.deleteDisabled || screenDrag.dragging()) setConfirmDelete(null);});
  function cancelDelete(id: string): void {
    setConfirmDelete(null);
    screenList.closest('.folder-sidebar')?.querySelector<HTMLButtonElement>(`[data-screen-id="${id}"] .screen-delete-action`)?.focus({preventScroll: true});
  }
  onCleanup(() => {disposed = true; endPeek();});

  /** One sidebar row; ordinary screens scroll, the folder fallback stays pinned below the add button. */
  function screenRow(id: string) {
    const summary = createMemo(() => stepSummary(props.document, id));
    const title = () => props.document.content.steps[id].title || 'Без названия';
    const reference = () => stepReference(props.document, id);
    const fallback = () => isFallbackStep(props.document, id);
    const deleteReason = () => deletionReason(props.document, id);
    return <div data-testid={`step-nav-${id}`} data-screen-id={id} data-screen-sortable={!fallback() ? 'true' : undefined} class="screen-chat-row" classList={{'is-folder-fallback': fallback(), 'is-dragging': screenDrag.dragging() === id, 'is-link-target': props.linkTargetStepId === id}}>
        <Show when={fallback()}><span class="folder-fallback-label" data-testid={`step-fallback-${id}`}><span aria-hidden="true">↩</span> Если непонятно</span></Show>
        <button class="screen-chat" classList={{selected: props.selectedStepId === id}} aria-label={`Экран ${reference()}`} aria-description={!fallback() ? 'Нажмите, чтобы открыть. Перетащите для сортировки, на папку, чтобы переместить, или на кнопку, чтобы назначить переход.' : undefined} aria-current={props.selectedStepId === id ? 'page' : undefined} onPointerDown={event => {if(!fallback()) screenDrag.begin(id, event);}} onClick={() => {if(screenDrag.allowClick()) props.onSelect(id);}}>
        <span class="screen-avatar" classList={{'is-entry': summary().isEntry, 'is-terminal': summary().isTerminal && !fallback(), 'is-fallback': fallback()}} aria-hidden="true"
          onPointerEnter={event => {if(event.pointerType !== 'touch') schedulePeek(id);}} onPointerLeave={endPeek} onPointerDown={endPeek}>{formatStepNumber(props.document.steps[id].number)}</span>
        <span class="screen-chat-copy"><span class="screen-chat-title"><span class="screen-chat-name" classList={{'is-renaming': props.renamingStepId === id}}>{title()}</span><Show when={summary().isEntry}><span class="screen-badge entry" data-testid={`step-start-${id}`}>Начало</span></Show><Show when={summary().isTerminal && !fallback()}><span class="screen-badge terminal" data-testid={`step-end-${id}`}>Конец</span></Show></span>
          <span class="screen-chat-preview" data-testid={`step-preview-${id}`}>{summary().preview}</span>
          <Show when={hasLogic()}><span class="screen-connections" title={incoming(id).map(link => `${stepReference(props.document, link.stepId)} / ${link.label}`).join('\n') || 'Нет входящих переходов'} aria-label={`${incoming(id).length} входящих, ${outgoing(id).length} исходящих переходов`}>↙ {incoming(id).length}　↗ {outgoing(id).length}</span></Show>
          <Show when={summary().isEmpty || summary().unassigned > 0}><span class="screen-draft">{summary().isEmpty ? 'Пустой экран' : 'Есть кнопки без перехода'}</span></Show>
        </span>
        </button>
        <button type="button" class="screen-rename-action" aria-label={`Переименовать экран ${reference()}`} title="Переименовать" onClick={() => props.onRename(id)}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="m16 3 5 5M4 20l5-1L21 7a2.1 2.1 0 0 0-5-3L4 16z" /></svg>
        </button>
        <Show when={!fallback()}><button type="button" class="screen-delete-action" aria-label={`Удалить экран ${reference()}`} title={deleteReason() ?? 'Удалить экран'} disabled={props.deleteDisabled || !!deleteReason()} onClick={() => {endPeek(); setConfirmDelete(id);}}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></svg>
        </button></Show>
        <Show when={props.renamingStepId === id}><div class="sidebar-name-editor"><ScreenNameInput testId={`rename-sidebar-${id}`} value={props.renameValue} onInput={props.onRenameInput} onFinish={props.onRenameFinish} composing={props.composing} /></div></Show>
        <Show when={confirmDelete() === id}><div class="screen-delete-confirm" role="alertdialog" aria-label={`Удалить экран ${reference()}?`} data-testid={`delete-confirm-${id}`}
          onKeyDown={event => {if(event.key === 'Escape') {event.preventDefault(); event.stopPropagation(); cancelDelete(id);}}}>
          <span>Удалить экран {formatStepNumber(props.document.steps[id].number)}?</span>
          <button type="button" class="danger-button" onClick={() => {setConfirmDelete(null); props.onDelete(id);}}>Удалить</button>
          <button type="button" class="quiet-button" ref={element => queueMicrotask(() => {if(element.isConnected) element.focus({preventScroll: true});})} onClick={() => cancelDelete(id)}>Отмена</button>
        </div></Show>
      </div>;
  }

  return <div class="folder-sidebar" classList={{'is-peekable': !props.dragDisabled}}>
    <nav class="folder-rail" aria-label="Папки бота">
      <div class="folder-rail-list"><For each={props.document.folderOrder}>{id => <button type="button" class="folder-tab" classList={{selected: folderId() === id, 'is-drop-target': props.dropTargetFolderId === id}} data-testid={`folder-tab-${id}`} data-folder-id={id}
        aria-label={`Папка ${props.document.content.folders[id].title}`} aria-current={folderId() === id ? 'page' : undefined} onClick={() => {closeMenu(); props.onSelectFolder(id);}}>
        <span class="folder-tab-icon" aria-hidden="true"><svg viewBox="0 0 24 24" width="25" height="25" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7V5a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z"/><path d="M3 8h18"/></svg></span>
        <span class="folder-tab-name" data-testid={`folder-name-${id}`}>{props.document.content.folders[id].title}</span>
      </button>}</For></div>
      <button type="button" class="folder-add" data-testid="add-folder" aria-label="Добавить папку" title="Добавить папку" disabled={props.folderAddDisabled} onClick={() => {closeMenu(); props.onAddFolder();}}><svg viewBox="0 0 24 24" width="23" height="23" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg></button>
    </nav>
    <nav class="folder-screens" aria-label="Экраны бота">
      <div class="folder-heading">
        <Show when={props.renamingFolderId === folderId()} fallback={<button type="button" class="folder-title" data-testid="selected-folder-title" aria-label={`Переименовать папку ${folderTitle()}`} disabled={props.folderEditingDisabled} onClick={() => props.onRenameFolder(folderId())}>{folderTitle()}</button>}>
          <div class="folder-title-editor"><ScreenNameInput label="Название папки" testId={`rename-folder-${folderId()}`} value={props.folderRenameValue} onInput={props.onFolderRenameInput} onFinish={props.onFolderRenameFinish} composing={props.composing}/></div>
        </Show>
        <span class="folder-screen-count" aria-label={`${screens().length} экранов`}>{screens().length}</span>
        <button type="button" ref={element => {menuButton = element;}} class="folder-menu-trigger" aria-label="Действия с папкой" aria-haspopup="menu" aria-expanded={menuOpen()} disabled={props.folderEditingDisabled} onClick={() => {
          if(menuOpen()) closeMenu();
          else {menuFolderId = folderId(); setMenuNight(!!menuButton.closest('.night')); setMenuPositioned(false); setMenuOpen(true);}
        }}>⋮</button>
      </div>
      <div ref={element => {screenList = element;}} class="folder-screen-list chat-list" classList={{'is-screen-dragging': !!screenDrag.dragging()}} data-testid="folder-screen-list">
    <For each={props.document.folders[folderId()].stepIds}>{screenRow}</For>
    <Show when={screenDrag.markerTop() !== null}><span class="screen-order-marker" aria-hidden="true" style={{top: `${screenDrag.markerTop()}px`}} /></Show>
    <span class="screen-drag-announcement" role="status" aria-live="polite">{screenDrag.announcement()}</span>
      </div>
      <div class="folder-screen-pinned">
        <button class="add-step" data-testid="add-step" disabled={props.addDisabled} onClick={props.onAdd}>＋ Добавить экран</button>
        <Show when={props.document.folders[folderId()].fallbackStepId} keyed>{screenRow}</Show>
      </div>
    </nav>
    <Show when={menuOpen()}><Portal><div ref={element => {menu = element;}} class="folder-action-menu" classList={{night: menuNight(), 'is-positioned': menuPositioned()}} role="menu" aria-label="Действия с папкой" data-testid="folder-actions-menu">
      <button type="button" role="menuitem" onClick={() => {const id = folderId(); closeMenu(); props.onRenameFolder(id);}}>Переименовать папку</button>
      <button type="button" role="menuitem" class="folder-delete" aria-disabled={!!deleteReason()} title={deleteReason() ?? undefined} onClick={() => {if(deleteReason()) return; const id = folderId(); closeMenu(true); props.onDeleteFolder(id);}}>Удалить папку</button>
    </div></Portal></Show>
  </div>;
}
