import {For, Show, createEffect, createMemo, createSignal, onCleanup, onMount, untrack} from 'solid-js';
import {createController, type Demo, type Dependencies} from './controller';
import {Inspector, type Inspection} from './Inspector';
import Bubble from './native/Bubble';
import Keyboard from './native/Keyboard';
import {TestKeyboard} from './TestKeyboard';
import {ScreenNameInput} from './ScreenNameInput';
import Typing from './native/Typing';
import {stepMessageIds, deletionReason, allStepIds, stepFolderId, isFallbackStep, folderDeletionReason, formatStepNumber, stepReference, messageText, buttonReadiness, activationReadiness, stepSummary, keyboardDraft, isActiveBotMessage, type RunMessage} from './core';
import {ShellLimits, type CodeBlock, type AskBlock} from './core/types';
import {AddElement} from './logic/AddElement';
import {LogicBlockCard} from './logic/LogicBlockCard';
import {LogicTestControls} from './logic/LogicTestControls';
import {createLogicDraft, type LogicBlock, type LogicDraft} from './logic/drafts';
import {BlockGrip} from './logic/BlockGrip';
import {LogicCodeDialog} from './LogicCodeDialog';
import './LogicIntegration.scss';
import {ScreenList} from './ScreenList';
import {TestComposer} from './TestComposer';
import {Composer} from './Composer';
import {EditableKeyboard} from './EditableKeyboard';
import {EditorHelp} from './EditorHelp';
import {MessageActions} from './MessageActions';
import {CompanionPanel} from './CompanionPanel';
import './native/native.scss';
import './shell.scss';

export function App(props: Dependencies = {}) {
  const c = createController(props);
  const [theme, setTheme] = createSignal<'day' | 'night'>('day');
  const [drawer, setDrawer] = createSignal(false);
  const [inspection, setInspection] = createSignal<Inspection | null>(null);
  const [prompt, setPrompt] = createSignal('');
  const [demo, setDemo] = createSignal<Demo | null>(null);
  const [composing, setComposing] = createSignal(false);
  const [showOptions, setShowOptions] = createSignal(false);
  const [testEditWidth, setTestEditWidth] = createSignal<number>();
  const [renaming, setRenaming] = createSignal<{id: string; surface: 'header' | 'sidebar' | 'folder'; value: string; revision: number} | null>(null);
  const [fold, setFold] = createSignal<{runId: string; before: number} | null>(null);
  const [historyOpen, setHistoryOpen] = createSignal(false);
  const [buttonDropStepId, setButtonDropStepId] = createSignal<string | null>(null);
  const [screenDropFolderId, setScreenDropFolderId] = createSignal<string | null>(null);
  const [screenDropButtonId, setScreenDropButtonId] = createSignal<string | null>(null);
  const [screenDropMessageId, setScreenDropMessageId] = createSignal<string | null>(null);
  const [activeDrag, setActiveDrag] = createSignal<'button' | 'screen' | null>(null);
  const [expandedBlock, setExpandedBlock] = createSignal<string | null>(null);
  const [logicRevision, setLogicRevision] = createSignal(0);
  const [newLogic, setNewLogic] = createSignal<(LogicDraft & {stepId: string; afterBlockId: string | null}) | null>(null);
  let pendingLogic: {blockId: string; dirty: boolean; reveal: () => void} | null = null;
  createEffect(() => {logicRevision(); c.setCompanionDraftActive(!!inspection() || !!renaming() || !!newLogic() || !!expandedBlock());});
  const [codeDialog, setCodeDialog] = createSignal<{block: CodeBlock; apply(source: string): void} | null>(null);
  const [peek, setPeek] = createSignal<string | null>(null);
  let peekScroll = 0;
  let shell!: HTMLDivElement;
  let scroller!: HTMLDivElement;
  let sidebar!: HTMLElement;
  let sidebarTrigger!: HTMLButtonElement;
  let linkScrollFrame: number | undefined;
  let linkScrollX = 0, linkScrollY = 0;
  let previousScroll = 0;
  const downloads = new Map<string, ReturnType<typeof setTimeout>>();
  const document = createMemo(() => c.editor().document);
  const visibleDocument = createMemo(() => c.run()?.document ?? document());
  const test = () => c.run() !== null;
  const selected = createMemo(() => c.editor().selectedStepId);
  const transcriptCount = createMemo(() => c.run()?.messages.length ?? 0);
  const runIdentity = createMemo(() => c.run()?.id);
  /** The screen shown in the editor: a hovered sidebar avatar peeks another screen without selecting it. */
  const viewed = () => {const id = peek(); return id !== null && Object.hasOwn(document().steps, id) ? id : selected();};
  const selectedSummary = () => stepSummary(document(), viewed());
  const activeTestStep = () => c.run()?.cursor.stepId ?? selected();
  const historyCount = () => fold()?.runId === c.run()?.id ? Math.min(fold()?.before ?? 0, c.run()?.messages.length ?? 0) : 0;
  const currentStepId = () => test() ? activeTestStep() : viewed();
  const currentReference = () => stepReference(visibleDocument(), currentStepId());
  // Folder browsing follows the selected screen, so a peek never moves the sidebar.
  const anchorStepId = () => test() ? activeTestStep() : selected();
  const activeFolder = createMemo(() => stepFolderId(visibleDocument(), anchorStepId()));
  const viewIdentity = createMemo(() => `${c.run()?.id ?? 'edit'}:${anchorStepId()}`);
  const [browsedFolder, setBrowsedFolder] = createSignal<string>();
  const selectedFolder = () => {
    const folderId = browsedFolder();
    return folderId && visibleDocument().folders[folderId] ? folderId : activeFolder();
  };
  createEffect(() => {viewIdentity(); setBrowsedFolder(activeFolder());});
  function clearLinkTargets(): void {
    setButtonDropStepId(null);
    setScreenDropButtonId(null);
    setScreenDropMessageId(null);
    setScreenDropFolderId(null);
  }
  function stopLinkAutoScroll(): void {
    if(linkScrollFrame !== undefined) cancelAnimationFrame(linkScrollFrame);
    linkScrollFrame = undefined;
  }
  function autoScrollScreensAt(x: number, y: number): void {
    linkScrollX = x; linkScrollY = y;
    if(linkScrollFrame !== undefined) return;
    const tick = () => {
      linkScrollFrame = undefined;
      if(activeDrag() !== 'button') return;
      const list = shell.querySelector<HTMLElement>('.folder-screen-list');
      if(!list) return;
      const box = list.getBoundingClientRect();
      if(linkScrollX < box.left || linkScrollX > box.right || linkScrollY < box.top || linkScrollY > box.bottom) return;
      const delta = linkScrollY < box.top + 34 ? -10 : linkScrollY > box.bottom - 34 ? 10 : 0;
      if(!delta) return;
      const before = list.scrollTop;
      list.scrollTop += delta;
      if(list.scrollTop === before) return;
      setButtonDropStepId(screenAt(linkScrollX, linkScrollY));
      linkScrollFrame = requestAnimationFrame(tick);
    };
    linkScrollFrame = requestAnimationFrame(tick);
  }
  function acquireDrag(kind: 'button' | 'screen'): boolean {
    if(activeDrag() !== null) return false;
    setActiveDrag(kind);
    return true;
  }
  function finishDrag(kind: 'button' | 'screen'): void {
    clearLinkTargets();
    if(kind === 'button') stopLinkAutoScroll();
    if(activeDrag() === kind) setActiveDrag(null);
  }
  function screenAt(x: number, y: number): string | null {
    if(test() || window.innerWidth < 900) return null;
    const element = window.document.elementFromPoint(x, y);
    if(!element || !shell.contains(element)) return null;
    const row = element instanceof Element ? element.closest<HTMLElement>('[data-screen-id]') : null;
    const stepId = row?.dataset.screenId;
    return stepId && Object.hasOwn(document().steps, stepId) ? stepId : null;
  }
  function screenButtonTargetAt(x: number, y: number): {kind: 'button'; buttonId: string} | {kind: 'add'; stepId: string; messageId: string} | null {
    if(test() || window.innerWidth < 900) return null;
    const element = window.document.elementFromPoint(x, y);
    if(!element || !shell.contains(element)) return null;
    const button = element instanceof Element ? element.closest<HTMLButtonElement>('.editable-keyboard [data-button-id]') : null;
    const buttonId = button?.dataset.buttonId;
    if(buttonId && Object.hasOwn(document().buttons, buttonId)) return {kind: 'button', buttonId};
    const add = element instanceof Element ? element.closest<HTMLButtonElement>('.editable-keyboard .shell-add-button') : null;
    if(!add || add.disabled) return null;
    const owner = add.closest<HTMLElement>('.screen-message[data-step-id][data-message-id]');
    const stepId = owner?.dataset.stepId, messageId = owner?.dataset.messageId;
    if(!stepId || !messageId || !Object.hasOwn(document().steps, stepId) || !stepMessageIds(document(), stepId).includes(messageId)) return null;
    const rows = document().messages[messageId].rows;
    if(Object.keys(document().buttons).length >= ShellLimits.buttons || rows.length >= ShellLimits.rows && rows.every(row => row.buttonIds.length >= ShellLimits.buttonsPerRow)) return null;
    return {kind: 'add', stepId, messageId};
  }
  function hoverButtonOnScreen(_buttonId: string, x: number, y: number): boolean {
    const stepId = screenAt(x, y);
    setButtonDropStepId(stepId);
    setScreenDropButtonId(null);
    setScreenDropMessageId(null);
    autoScrollScreensAt(x, y);
    return stepId !== null;
  }
  function dropButtonOnScreen(buttonId: string, x: number, y: number, baseRevision: number): 'changed' | 'noop' | false {
    const stepId = screenAt(x, y);
    if(!stepId || !Object.hasOwn(document().buttons, buttonId)) return false;
    if(document().buttons[buttonId].transition?.type === 'screen' && (document().buttons[buttonId].transition as {type: 'screen'; screenId: string}).screenId === stepId) return 'noop';
    const before = c.editor().revision;
    c.mutate({type: 'set_button_transition', buttonId, transition: {type: 'screen', screenId: stepId}}, baseRevision);
    return !c.editor().error && c.editor().revision === before + 1 ? 'changed' : false;
  }
  function folderAt(x: number, y: number): string | null {
    if(test()) return null;
    const element = window.document.elementFromPoint(x, y);
    if(!element || !shell.contains(element)) return null;
    const folderId = element.closest<HTMLElement>('[data-folder-id]')?.dataset.folderId;
    return folderId && Object.hasOwn(document().folders, folderId) ? folderId : null;
  }
  function hoverScreenOnButton(_stepId: string, x: number, y: number): boolean {
    const folderId = folderAt(x, y);
    if(folderId) {clearLinkTargets(); setScreenDropFolderId(folderId); return true;}
    setScreenDropFolderId(null);
    const target = screenButtonTargetAt(x, y);
    setScreenDropButtonId(target?.kind === 'button' ? target.buttonId : null);
    setScreenDropMessageId(target?.kind === 'add' ? target.messageId : null);
    setButtonDropStepId(null);
    return target !== null;
  }
  function dropScreenOnButton(stepId: string, x: number, y: number, baseRevision: number): 'changed' | 'noop' | 'moved' | 'kept' | false {
    if(activeDrag() !== 'screen' || c.editor().revision !== baseRevision || !Object.hasOwn(document().steps, stepId)) return false;
    const folderId = folderAt(x, y);
    if(folderId) {
      if(stepFolderId(document(), stepId) === folderId) return 'kept';
      const before = c.editor().revision;
      c.mutate({type: 'move_step_to_folder', stepId, folderId}, baseRevision);
      if(c.editor().error || c.editor().revision !== before + 1) return false;
      setBrowsedFolder(folderId);
      return 'moved';
    }
    const target = screenButtonTargetAt(x, y);
    if(!target) return false;
    const before = c.editor().revision;
    if(target.kind === 'button') {
      if(document().buttons[target.buttonId].transition?.type === 'screen' && (document().buttons[target.buttonId].transition as {type: 'screen'; screenId: string}).screenId === stepId) return 'noop';
      c.mutate({type: 'set_button_transition', buttonId: target.buttonId, transition: {type: 'screen', screenId: stepId}}, baseRevision);
    } else {
      const keyboard = keyboardDraft(document(), target.stepId, target.messageId);
      const buttonId = c.id('button');
      const row = [...keyboard.rows].reverse().find(row => row.buttonIds.length < ShellLimits.buttonsPerRow);
      if(row) row.buttonIds.push(buttonId);
      else keyboard.rows.push({id: c.id('row'), buttonIds: [buttonId]});
      keyboard.buttons[buttonId] = {transition: {type: 'screen', screenId: stepId}, color: 'default'};
      keyboard.labels[buttonId] = document().content.steps[stepId].title;
      c.mutate({type: 'set_keyboard', stepId: target.stepId, messageId: target.messageId, keyboard}, baseRevision);
    }
    return !c.editor().error && c.editor().revision === before + 1 ? 'changed' : false;
  }
  function beginDragInteraction(): boolean {
    clearLinkTargets();
    if(test() || composing() || !canLeaveLogic() || !finishRename()) return false;
    c.manual(); c.finishText(); closeLogic(); setInspection(null); setShowOptions(false);
    return true;
  }
  function selectFolder(folderId: string) {
    if(composing() || !canLeaveLogic() || !finishRename()) return;
    c.finishText(); closeLogic(); setInspection(null); setShowOptions(false);
    if(visibleDocument().folders[folderId]) setBrowsedFolder(folderId);
  }
  function peekStep(stepId: string | null) {
    if(stepId === null) {
      if(peek() !== null) {setPeek(null); requestAnimationFrame(() => {scroller.scrollTop = peekScroll;});}
      return;
    }
    if(test() || composing() || c.editor().textEdit || pendingLogic?.dirty || expandedBlock() || newLogic() || inspection() || renaming() || activeDrag() || stepId === selected()) return;
    if(peek() === null) peekScroll = scroller.scrollTop;
    setPeek(stepId);
    requestAnimationFrame(() => {scroller.scrollTop = 0;});
  }
  function beginFolderRename(folderId: string) {
    if(test() || composing() || !canLeaveLogic() || !finishRename()) return;
    c.manual(); c.finishText(); closeLogic(); setInspection(null); setShowOptions(false);
    setRenaming({id: folderId, surface: 'folder', value: document().content.folders[folderId].title, revision: c.editor().revision});
  }
  function addFolder() {
    if(test() || composing() || !canLeaveLogic() || !finishRename()) return;
    const folderId = c.id('folder'), stepId = c.id('screen');
    c.mutate({type: 'add_folder', folderId, title: 'Новая папка', stepId, messageId: c.id('message'),
      fallbackStepId: c.id('screen'), fallbackMessageId: c.id('message'), rowId: c.id('row'), buttonId: c.id('button')});
    if(c.editor().error) return;
    c.select(stepId); setBrowsedFolder(folderId); beginFolderRename(folderId);
  }
  function deleteFolder(folderId: string) {
    if(test() || composing() || !canLeaveLogic() || !finishRename()) return;
    c.finishText();
    const reason = folderDeletionReason(document(), folderId);
    if(reason) {c.setNotice(reason); return;}
    c.mutate({type: 'delete_folder', folderId});
  }
  function moveToFolder(stepId: string, folderId: string) {
    if(test() || composing() || !canLeaveLogic() || !finishRename()) return;
    c.mutate({type: 'move_step_to_folder', stepId, folderId});
    if(!c.editor().error) setBrowsedFolder(folderId);
  }
  function centerMessage(messageId: string) {
    requestAnimationFrame(() => {
      const element = window.document.getElementById(`message-${messageId}`);
      if(!element) return;
      const viewport = scroller.getBoundingClientRect();
      const message = element.getBoundingClientRect();
      scroller.scrollTop += message.top + message.height / 2 - (viewport.top + viewport.height / 2);
    });
  }
  function centerStepMessage(stepId: string) {
    const messageId = stepMessageIds(document(), stepId)[0];
    if(messageId) centerMessage(messageId);
  }
  function renameInput(value: string) {setRenaming(state => state ? {...state, value} : null);}
  function finishRename(cancel = false): boolean {
    const state = renaming();
    if(!state) return true;
    if(composing()) return false;
    if(!cancel && state.value.trim()) {
      if(state.surface === 'folder') {
        if(test()) return false;
        c.mutate({type: 'set_folder_title', folderId: state.id, title: state.value.trim()}, state.revision);
        if(c.editor().error) return false;
      } else if(!c.renameStep(state.id, state.value.trim(), state.revision)) return false;
    }
    setRenaming(null);
    return true;
  }
  function beginRename(stepId: string, surface: 'header' | 'sidebar') {
    if(composing() || !canLeaveLogic() || !finishRename()) return;
    c.manual(); c.finishText(); closeLogic(); setInspection(null); setShowOptions(false);
    setRenaming({id: stepId, surface, value: document().content.steps[stepId].title, revision: c.editor().revision});
  }
  function select(id: string) {
    if(!canLeaveLogic() || !finishRename()) return;
    closeLogic();
    if(test()) {
      const before = c.run()!.messages.length;
      if(c.jumpTest(id)) {
        setFold({runId: c.run()!.id, before}); setHistoryOpen(false);
        setDrawer(false);
        requestAnimationFrame(() => {scroller.scrollTop = scroller.scrollHeight;});
      }
      return;
    }
    c.select(id); setDrawer(false); setShowOptions(false);
    centerStepMessage(id);
  }
  function inspect(stepId: string, messageId: string, anchor: HTMLElement, buttonId?: string, sourceOccurrenceId?: string) {
    if(composing() || !canLeaveLogic() || !finishRename()) return;
    const rows = document().messages[messageId]?.rows;
    if(!rows) return;
    if(!buttonId && (Object.keys(document().buttons).length >= ShellLimits.buttons || rows.length >= ShellLimits.rows && rows.every(row => row.buttonIds.length >= ShellLimits.buttonsPerRow))) {c.setNotice('Достигнут лимит кнопок. Удалите одну из существующих.'); return;}
    c.manual(); closeLogic(); c.select(stepId); c.finishText(); setDrawer(false); setShowOptions(false);
    if(!document().messages[messageId]) return;
    setInspection({stepId, messageId, anchor, buttonId, sourceOccurrenceId});
  }
  function startAt(stepId?: string) {
    if(composing() || !canLeaveLogic() || !finishRename()) return;
    if(!test()) previousScroll = scroller.scrollTop;
    closeLogic(); setDrawer(false); setInspection(null); setShowOptions(false); c.startTest(stepId);
  }
  function start() {startAt();}
  function exit() {
    if(!finishRename()) return;
    c.exitTest();
    requestAnimationFrame(() => {scroller.scrollTop = previousScroll;});
  }
  function exportDocument() {
    if(composing() || !finishRename()) return;
    setInspection(null);
    try {
      const snapshot = c.exportSnapshot();
      const url = URL.createObjectURL(new Blob([snapshot.json], {type: 'application/json'}));
      const a = window.document.createElement('a'); a.href = url; a.download = snapshot.filename; a.click();
      downloads.set(url, setTimeout(() => {URL.revokeObjectURL(url); downloads.delete(url);}, 1000));
      c.setNotice(`Скачивание JSON запрошено · версия ${snapshot.revision}.`);
    } catch(error) {c.setNotice(error instanceof Error ? error.message : 'Не удалось подготовить JSON.');}
  }
  function shellKeys(event: KeyboardEvent) {
    if(peek() !== null) peekStep(null);
    if((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === 'e' && !composing() && !codeDialog()) {
      event.preventDefault();
      exportDocument();
    }
  }
  function addStep() {
    if(!canLeaveLogic() || !finishRename()) return;
    const stepId = c.id('screen');
    const messageId = c.id('message');
    c.mutate({type: 'add_step', stepId, messageId, afterStepId: stepFolderId(document(), selected()) === selectedFolder() ? selected() : document().folders[selectedFolder()].fallbackStepId, content: {title: 'Новый экран', text: ''}});
    if(c.editor().error) return;
    select(stepId); c.beginText(stepId, messageId);
  }
  function addMessage(stepId: string, afterBlockId?: string | null) {
    if(!finishRename() || !canLeaveLogic()) return;
    closeLogic();
    const messageId = c.id('message');
    if(!c.beginNewMessage(stepId, messageId, afterBlockId)) return;
    centerMessage(messageId);
  }
  /** The composer appends a bubble to the current screen; a trailing empty message takes the text instead. */
  function sendAuthoredMessage(text: string): boolean {
    if(test() || composing() || !canLeaveLogic() || !finishRename()) return false;
    closeLogic(); setInspection(null); setShowOptions(false);
    c.manual(); c.finishText();
    if(c.editor().error) return false;
    const stepId = selected();
    const lastBlockId = document().steps[stepId].blockIds.at(-1) ?? null;
    const last = lastBlockId ? document().blocks[lastBlockId] : null;
    const emptyTail = last?.type === 'message' && !document().content.messages[last.messageId].trim() ? last.messageId : null;
    const messageId = emptyTail ?? c.id('message');
    c.mutate(emptyTail
      ? {type: 'set_message_text', stepId, messageId, text}
      : {type: 'add_block', stepId, afterBlockId: lastBlockId, block: {id: messageId, type: 'message', messageId}, messageText: text});
    if(c.editor().error) return false;
    centerMessage(messageId);
    return true;
  }
  function closeLogic() {if(expandedBlock() || newLogic()) c.dismissNotice(); pendingLogic = null; setExpandedBlock(null); setNewLogic(null);}
  function canLeaveLogic(nextId?: string): boolean {
    if(pendingLogic?.dirty && pendingLogic.blockId !== nextId) {
      pendingLogic.reveal();
      window.document.getElementById(`block-${pendingLogic.blockId}`)?.scrollIntoView({block: 'nearest'});
      c.setNotice('Сначала примените или отмените текущую правку.');
      return false;
    }
    return true;
  }
  function prepareLogic(): boolean {
    if(test() || composing() || !finishRename()) return false;
    c.manual(); c.finishText(); setInspection(null); setShowOptions(false);
    return !c.editor().error;
  }
  function addElement(stepId: string, type: LogicBlock['type'] | 'message', afterBlockId: string | null) {
    if(!prepareLogic() || !canLeaveLogic()) return;
    closeLogic();
    if(type === 'message') {addMessage(stepId, afterBlockId); return;}
    const draft = createLogicDraft(type, c.id('block'), c.id);
    setLogicRevision(c.editor().revision);
    setNewLogic({...draft, stepId, afterBlockId});
    setExpandedBlock(draft.block.id);
    requestAnimationFrame(() => window.document.getElementById(`block-${draft.block.id}`)?.scrollIntoView({block: 'nearest'}));
  }
  function expandLogic(blockId: string) {
    if(!prepareLogic() || !canLeaveLogic(blockId)) return;
    closeLogic(); setLogicRevision(c.editor().revision); setExpandedBlock(blockId);
  }
  function blockIds(stepId: string): string[] {
    const ids = [...document().steps[stepId].blockIds];
    const draft = newLogic();
    if(draft?.stepId === stepId && !ids.includes(draft.block.id)) ids.splice(draft.afterBlockId === null ? 0 : ids.indexOf(draft.afterBlockId) + 1, 0, draft.block.id);
    return ids;
  }
  function moveBlock(stepId: string, blockId: string, index: number) {
    if(!canLeaveLogic() || !prepareLogic()) return;
    closeLogic(); c.mutate({type: 'move_block', stepId, blockId, index});
  }
  function reorderBlock(stepId: string, blockId: string, targetId: string, after: boolean) {
    const ids = document().steps[stepId].blockIds.filter(id => id !== blockId);
    const index = ids.indexOf(targetId);
    if(index < 0) return;
    moveBlock(stepId, blockId, index + (after ? 1 : 0));
  }
  function openTrace(stepId: string, blockId: string) {
    c.exitTest(); select(stepId);
    const block = document().blocks[blockId];
    if(block && block.type !== 'message') expandLogic(blockId);
    requestAnimationFrame(() => window.document.getElementById(`block-${blockId}`)?.scrollIntoView({block: 'center'}));
  }
  function LogicEditor(props: {stepId: string; blockId: string}) {
    const creating = () => newLogic()?.block.id === props.blockId;
    const block = () => (creating() ? newLogic()!.block : document().blocks[props.blockId]) as LogicBlock;
    const index = () => document().steps[props.stepId].blockIds.indexOf(props.blockId);
    return <LogicBlockCard document={document()} block={block()} expanded={expandedBlock() === props.blockId}
      isNew={creating()} messageText={creating() ? newLogic()?.messageText : block().type === 'ask' ? document().content.messages[(block() as AskBlock).messageId] : undefined}
      error={expandedBlock() === props.blockId ? c.editor().error ?? undefined : undefined}
      onExpand={() => expandLogic(props.blockId)} onCancel={closeLogic}
      onApply={(value, messageText) => {
        const draft = newLogic();
        c.mutate(creating() && draft
          ? {type: 'add_block', stepId: props.stepId, afterBlockId: draft.afterBlockId, block: value, messageText: messageText ?? null}
          : {type: 'set_block', stepId: props.stepId, block: value, messageText: messageText ?? null}, logicRevision());
        if(c.editor().error) return false;
        closeLogic(); return true;
      }}
      onDelete={creating() ? undefined : () => {c.mutate({type: 'delete_block', stepId: props.stepId, blockId: props.blockId}); if(!c.editor().error) closeLogic();}}
      onMove={direction => moveBlock(props.stepId, props.blockId, index() + direction)}
      canMoveUp={!creating() && index() > 0} canMoveDown={!creating() && index() < document().steps[props.stepId].blockIds.length - 1}
      onReorder={(targetId, after) => reorderBlock(props.stepId, props.blockId, targetId, after)}
      newId={c.id} onOpenCode={(value, apply) => setCodeDialog({block: structuredClone(value), apply})} onCompositionChange={setComposing}
      onDraftState={(dirty, reveal) => {if(expandedBlock() === props.blockId) pendingLogic = {blockId: props.blockId, dirty, reveal};}}/>
  }
  function deleteMessage(stepId: string, messageId: string) {
    if(c.editor().textEdit?.creation && c.editor().textEdit?.messageId === messageId) {c.finishText(true); return;}
    c.finishText();
    if(!stepMessageIds(document(), stepId).includes(messageId)) return;
    c.mutate({type: 'delete_message', stepId, messageId});
  }
  function deleteStep(stepId: string) {
    if(test() || composing() || !canLeaveLogic() || !finishRename()) return;
    c.finishText();
    const reason = deletionReason(document(), stepId);
    if(reason) {c.setNotice(reason); return;}
    closeLogic(); setInspection(null); setShowOptions(false);
    c.mutate({type: 'delete_step', stepId});
  }
  function removeStep() {deleteStep(selected());}
  function beforeUnload(event: BeforeUnloadEvent) {
    if(props.companion) {
      if(props.companion.state().pending || props.companion.state().draftActive) {event.preventDefault(); event.returnValue = '';}
      return;
    }
    if(c.editor().changed && c.exportRevision() !== c.editor().revision) {event.preventDefault(); event.returnValue = '';}
  }
  function layoutResize() {if(window.innerWidth >= 900) setDrawer(false);}
  onMount(() => {window.addEventListener('beforeunload', beforeUnload); window.addEventListener('resize', layoutResize); window.addEventListener('keydown', shellKeys); shell.addEventListener('click', protectComposition, true); shell.addEventListener('pointerdown', protectComposition, true); centerStepMessage(selected());});
  onCleanup(() => {
    stopLinkAutoScroll(); c.dispose(); window.removeEventListener('beforeunload', beforeUnload); window.removeEventListener('resize', layoutResize); window.removeEventListener('keydown', shellKeys); shell.removeEventListener('click', protectComposition, true); shell.removeEventListener('pointerdown', protectComposition, true);
    for(const [url, timer] of downloads) {clearTimeout(timer); URL.revokeObjectURL(url);}
  });
  createEffect(() => {
    const count = transcriptCount();
    const identity = runIdentity();
    if(identity && count && !untrack(c.runTextEdit)) requestAnimationFrame(() => {scroller.scrollTop = scroller.scrollHeight;});
  });
  createEffect(() => {
    if(drawer() && !sidebar.contains(window.document.activeElement)) sidebar.querySelector<HTMLElement>('button, textarea')?.focus();
  });
  function closeDrawer() {setDrawer(false); sidebarTrigger?.focus();}
  function drawerKeys(event: KeyboardEvent) {
    if(!drawer() || window.innerWidth >= 900) return;
    if(event.key === 'Escape') {event.preventDefault(); closeDrawer();}
    if(event.key !== 'Tab') return;
    const elements = Array.from(sidebar.querySelectorAll<HTMLElement>('button:not(:disabled), textarea, input, select, a[href], summary')).filter(el => el.offsetParent !== null);
    const first = elements[0], last = elements.at(-1);
    if(event.shiftKey && window.document.activeElement === first) {event.preventDefault(); last?.focus();}
    else if(!event.shiftKey && window.document.activeElement === last) {event.preventDefault(); first?.focus();}
  }
  const demoOptions: {id: Demo; title: string; prompt: string}[] = [
    {id: 'greeting', title: 'Изменить приветствие', prompt: 'Замени приветствие на короткое знакомство с проектом.'},
    {id: 'detail', title: 'Добавить «О проекте»', prompt: 'Добавь экран «О проекте», кнопку из начала и возврат.'},
    {id: 'menu', title: 'Добавить новый раздел', prompt: 'Добавь новый раздел с кнопкой перехода и возвратом в начало.'}
  ];
  function protectComposition(event: MouseEvent | PointerEvent) {
    if(composing() && !(event.target instanceof HTMLElement && event.target.matches('.message-editor, .screen-title-input, .logic-card input, .logic-card textarea'))) {event.preventDefault(); event.stopPropagation();}
  }
  function AuthorMessage(props: {stepId: string; blockId: string; messageId: string}) {
                const id = props.stepId, messageId = props.messageId;
                const index = () => document().steps[id].blockIds.indexOf(props.blockId);
                const editing = () => c.editor().textEdit?.messageId === messageId;
                const blankCanvas = () => stepMessageIds(document(), id).length === 1 && (
                  !document().content.messages[messageId].trim() || editing() && !c.editor().textEdit!.before.content.messages[messageId].trim()
                );
                const beginEditing = () => {
                  if(!editing() && canLeaveLogic() && finishRename()) {closeLogic(); c.beginText(id, messageId);}
                };
                return <div class="screen-message" id={`message-${messageId}`} data-message-id={messageId} data-step-id={id}>
              <Bubble class={blankCanvas() ? 'is-empty-message' : ''} groupFirst={index() === 0} groupLast={index() === document().steps[id].blockIds.length - 1} hasKeyboard={document().messages[messageId].rows.length > 0} text={document().content.messages[messageId] || 'Напишите сообщение…'} time="12:00" onDelete={editing() && document().steps[id].blockIds.length > 1 ? () => deleteMessage(id, messageId) : undefined} editor={<InlineText stepId={id} value={document().content.messages[messageId]} active={editing()} autoFocus={editing() || blankCanvas()} deferredFocus={blankCanvas()} persistent onBegin={() => {setShowOptions(false); beginEditing();}} onInput={text => {beginEditing(); c.inputText(text);}} onResize={() => centerMessage(messageId)} onFinish={cancel => {if(editing()) {c.finishText(cancel); centerMessage(messageId);}}} composing={setComposing} />}>
                <EditableKeyboard document={document()} stepId={id} messageId={messageId} revision={c.editor().revision} onInspect={(buttonId, element) => inspect(id, messageId, element, buttonId)} onNavigate={select} onAdd={() => {const anchor = window.document.querySelector<HTMLElement>(`#message-${messageId} .shell-add-button`); if(anchor) inspect(id, messageId, anchor);}} newRowId={() => c.id('row')} onInteractionStart={beginDragInteraction}
                  onDragStart={() => acquireDrag('button')} onExternalHover={hoverButtonOnScreen} onExternalDrop={dropButtonOnScreen} onExternalCancel={() => finishDrag('button')} linkTargetButtonId={screenDropButtonId()} linkTargetAdd={screenDropMessageId() === messageId}
                  onMove={(rows, baseRevision) => {
                  const keyboard = keyboardDraft(document(), id, messageId);
                  keyboard.rows = rows;
                  c.mutate({type: 'set_keyboard', stepId: id, messageId, keyboard}, baseRevision);
                }} />
              </Bubble>
              </div>;
  }
  function RunBubble(props: {message: RunMessage; index: number}) {
    const message = props.message;
    const run = () => c.run()!;
    const bot = message.kind === 'bot' ? message : null;
    const rows = () => bot ? run().document.messages[bot.messageId].rows : [];
    const ask = () => bot ? Object.values(run().document.blocks).find((block): block is AskBlock => block.type === 'ask' && block.messageId === bot.messageId) : undefined;
    const choices = () => ask()?.answerType === 'choice' ? ask()!.choices : [];
    const activeAsk = () => {const pending = run().pending; return !!bot && pending?.kind === 'ask' && pending.activationId === bot.activationId;};
    const editing = () => c.runTextEdit()?.sourceOccurrenceId === message.id;
    const groupedWith = (index: number) => {
      const adjacent = run().messages[index];
      return !!bot && adjacent?.kind === 'bot' && adjacent.stepId === bot.stepId;
    };
    const beginRunEditing = (width: number) => {
      if(!bot || composing() || !finishRename()) return;
      setInspection(null); setTestEditWidth(width); c.beginRunText(message.id);
    };
    return <div id={`occurrence-${message.id}`} class="run-message" data-message-kind={message.kind} data-testid={message.kind === 'bot' ? 'run-bot' : 'run-user'}>
      <MessageActions text={messageText(run(), message)} theme={theme()} disabled={composing() || !!inspection() || !!renaming()} onEdit={bot ? beginRunEditing : undefined}>
        <Bubble text={messageText(run(), message)} outgoing={message.kind === 'user' || message.kind === 'text'}
          time={new Date(message.at).toLocaleTimeString('ru-RU', {hour: '2-digit', minute: '2-digit'})}
          groupFirst={props.index === historyCount() || !groupedWith(props.index - 1)}
          groupLast={props.index === historyCount() - 1 || !groupedWith(props.index + 1)}
          hasKeyboard={rows().length > 0 || choices().length > 0} editorWidth={testEditWidth()}
          onEdit={bot ? beginRunEditing : undefined} showEditAction={editing()} onFinishEdit={() => c.finishText()}
          editor={<Show when={editing() && bot}><InlineText stepId={message.stepId} value={bot ? c.editor().document.content.messages[bot.messageId] : ''} active onInput={c.inputText} onFinish={cancel => c.finishText(cancel)} composing={setComposing} /></Show>}>
          <Show when={bot}>{source => <TestKeyboard
            rows={rows().map(row => ({id: row.id, buttons: row.buttonIds.map(id => ({id,
              label: run().document.content.buttons[id], color: run().document.buttons[id].color,
              disabled: !!activationReadiness(run(), message.id, id)
            }))}))}
            identity={`${run().id}:${message.id}:${c.editor().revision}:${run().phase}:${run().activeMessageId}`}
            disabledEditing={composing() || !!inspection() || !!c.runTextEdit() || !!renaming()}
            onButton={id => c.activate(message.id, id)}
            onInspect={(id, anchor) => inspect(source().stepId, source().messageId, anchor, id, message.id)}
          />}</Show>
          <Show when={choices().length}><Keyboard rows={Array.from({length: Math.ceil(choices().length / Math.ceil(choices().length / ShellLimits.rows))}, (_, row) => {const width = Math.ceil(choices().length / ShellLimits.rows); return {id: `choices-${row}`, buttons: choices().slice(row * width, (row + 1) * width).map(choice => ({id: choice.id, label: choice.label, disabled: !activeAsk()}))};})} onButton={c.answerChoice}/></Show>
        </Bubble>
      </MessageActions>
      <Show when={bot && isActiveBotMessage(run(), message.id)}><For each={rows().flatMap(row => row.buttonIds).map(id => buttonReadiness(run().document, id)).filter((issue): issue is string => !!issue)}>{issue => <p class="inline-notice error" role="alert">{issue}</p>}</For></Show>
    </div>;
  }
  return <div ref={element => {shell = element;}} class="shell native-chat logic-themed" inert={codeDialog() ? true : undefined} classList={{night: theme() === 'night'}} data-theme={theme()} data-shell-document-id={document().id}>
    <Show when={drawer()}><div class="drawer-backdrop" onClick={closeDrawer} /></Show>
    <aside ref={element => {sidebar = element;}} class="sidebar" classList={{'is-open': drawer()}} aria-label="Редактор бота" onKeyDown={drawerKeys}>
      <div class="brand"><span class="brand-mark">R</span><strong>Robochat</strong><span class="local-badge">Локально</span><button class="icon-button mobile-only" aria-label="Закрыть навигацию" onClick={closeDrawer}>×</button></div>
      <Show when={props.companion} fallback={<section class="ai-panel" aria-label="AI-редактирование"><div class="section-heading"><h2>Что изменим?</h2><span class="muted">{props.aiAdapter ? 'AI' : 'AI · демо'}</span></div>
        <textarea aria-label="Запрос к AI" placeholder="Опишите бота или нужное изменение…" value={prompt()} disabled={test()} onInput={event => {setPrompt(event.currentTarget.value); setDemo(null);}} />
        <div class="ai-actions"><Show when={c.ai()} fallback={<button class="primary-button" disabled={test() || composing()} onClick={() => {if(finishRename()) c.applyAi(prompt(), demo());}}>Применить с AI</button>}><button class="quiet-button" onClick={() => c.cancelAi('Запрос отменён. Документ не изменён.')}>Отменить запрос</button></Show></div>
        <details class="demo-options"><summary>Попробовать локальный пример</summary><For each={demoOptions}>{item => <button classList={{chosen: demo() === item.id}} disabled={test()} onClick={() => {setDemo(item.id); setPrompt(item.prompt);}}>{item.title}</button>}</For></details>
      </section>}>{bridge => <CompanionPanel bridge={bridge()} onSelect={select} beforeAction={() => {
        if(composing() || !canLeaveLogic() || !finishRename()) return false;
        c.finishText();
        if(inspection()) {c.setNotice('Сначала примените или отмените правку кнопки.'); return false;}
        closeLogic(); c.setCompanionDraftActive(false); return true;
      }} onDiscard={() => {
        if(composing()) return;
        c.finishText(true); setInspection(null); setRenaming(null); closeLogic(); c.setCompanionDraftActive(false);
        void bridge().discard();
      }} />}</Show>
      <ScreenList selectedFolderId={selectedFolder()} onSelectFolder={selectFolder} onAddFolder={addFolder} onDeleteFolder={deleteFolder} folderEditingDisabled={test() || composing()} folderAddDisabled={test() || composing() || allStepIds(document()).length + 2 > ShellLimits.steps || Object.keys(document().messages).length + 2 > ShellLimits.documentMessages || Object.keys(document().buttons).length + 1 > ShellLimits.buttons || document().nextStepNumber + 1 > ShellLimits.stepNumber} renamingFolderId={renaming()?.surface === 'folder' ? renaming()?.id : undefined} folderRenameValue={renaming()?.value ?? ''} onRenameFolder={beginFolderRename} onFolderRenameInput={renameInput} onFolderRenameFinish={finishRename} document={visibleDocument()} selectedStepId={test() ? activeTestStep() : selected()} onSelect={select} onAdd={addStep} renamingStepId={renaming()?.surface === 'sidebar' ? renaming()?.id : undefined} renameValue={renaming()?.value ?? ''} onRename={id => beginRename(id, 'sidebar')} onRenameInput={renameInput} onRenameFinish={finishRename} composing={setComposing} onPeek={peekStep} onDelete={deleteStep} deleteDisabled={test() || composing()} addDisabled={test() || allStepIds(document()).length >= ShellLimits.steps || document().nextStepNumber > ShellLimits.stepNumber}
        revision={c.editor().revision} dragDisabled={test() || composing()} linkTargetStepId={buttonDropStepId()} dropTargetFolderId={screenDropFolderId()}
        onInteractionStart={beginDragInteraction} onDragStart={() => acquireDrag('screen')} onExternalHover={hoverScreenOnButton} onExternalDrop={dropScreenOnButton} onExternalCancel={() => finishDrag('screen')}
        onMove={(stepId, index, baseRevision) => c.mutate({type: 'move_step', stepId, index}, baseRevision)} />
      <footer class="sidebar-footer"><div class="mode-switch" aria-label="Режим"><button data-testid="mode-edit" classList={{active: !test()}} disabled={composing()} onClick={exit}>Редактировать</button><button data-testid="mode-test" classList={{active: test()}} disabled={composing()} onClick={start}>Пройти бота</button></div></footer>
    </aside>
    <main class="chat-panel" inert={drawer() ? true : undefined}>
      <header class="chat-header"><button ref={element => {sidebarTrigger = element;}} class="icon-button mobile-only" aria-label="Открыть навигацию" onClick={() => {setInspection(null); setDrawer(true);}}>☰</button><div class="bot-avatar" aria-hidden="true">AI</div><div class="bot-heading"><div class="screen-heading-line"><span class="screen-number" aria-label={`Экран ${formatStepNumber(visibleDocument().steps[currentStepId()].number)}`}>{formatStepNumber(visibleDocument().steps[currentStepId()].number)}</span><Show when={renaming()?.surface === 'header'} fallback={<button type="button" class="screen-title-trigger" aria-label={`Переименовать экран ${currentReference()}`} title="Переименовать экран" onClick={() => beginRename(currentStepId(), 'header')}>{visibleDocument().content.steps[currentStepId()].title || 'Новый экран'}</button>}><ScreenNameInput testId="rename-header" value={renaming()?.value ?? ''} onInput={renameInput} onFinish={finishRename} composing={setComposing} /></Show></div><span>{test() ? 'Тест · ' + visibleDocument().bot.username : isFallbackStep(document(), selected()) ? 'Если ввод не распознан' : selectedSummary().isEntry ? 'Начальный экран бота' : selectedSummary().isTerminal ? 'Конец ветки' : visibleDocument().bot.username + ' · экран'}</span></div>
        <Show when={!test()}><button class="icon-button" aria-label="Отменить последнее изменение" title="Отменить последнее изменение" disabled={composing() || (props.companion ? props.companion.state().status !== 'ready' || props.companion.state().pending > 0 : !c.editor().history.length && !c.editor().textEdit)} onClick={() => {if(finishRename()) {closeLogic(); c.undo();}}}><svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 14a8 8 0 1 0-1 4M4 4v6h6" /></svg></button></Show>
        <Show when={!test()}><button class="icon-button" aria-label="Настройки экрана" onClick={() => {if(!finishRename()) return; c.finishText(); setShowOptions(!showOptions());}}>⋮</button></Show>
        <Show when={!test()}><EditorHelp theme={theme()} /></Show>
        <Show when={test()}><button class="icon-button" aria-label="Начать заново" title="Начать заново" disabled={composing()} onClick={start}><svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 10a8 8 0 1 1 1 8M4 4v6h6" /></svg></button></Show>
        <button class="icon-button" aria-label={theme() === 'day' ? 'Тёмная тема' : 'Светлая тема'} onClick={() => setTheme(theme() === 'day' ? 'night' : 'day')}>{theme() === 'day' ? '☾' : '☀'}</button>
        <button class="quiet-button header-mode" disabled={composing()} onClick={() => test() ? exit() : start()}>{test() ? 'В редактор' : 'Пройти'}</button>
      </header>
      <div ref={element => {scroller = element;}} class="chat-scroll native-wallpaper" classList={{'is-editor-mode': !test()}} data-testid="chat-scroll">
        <div class="chat-story"><div class="date-label" data-testid="screen-boundary">{test() ? `Тест · ${currentReference()}` : isFallbackStep(document(), selected()) ? `↩ ${currentReference()}` : selectedSummary().isEntry ? `${currentReference()} · Начало бота` : selectedSummary().isTerminal ? `✓ ${currentReference()} · Конец ветки` : currentReference()}</div>
          <Show when={!test()} fallback={<>
            <Show when={historyCount() > 0}><details class="run-history" data-testid="run-history" open={historyOpen()} onToggle={event => setHistoryOpen(event.currentTarget.open)}>
              <summary data-testid="history-toggle">Предыдущие сообщения · {historyCount()}</summary>
              <For each={c.run()?.messages.slice(0, historyCount())}>{(message, index) => <RunBubble message={message} index={index()} />}</For>
            </details></Show>
            <For each={c.run()?.messages.slice(historyCount())}>{(message, index) => <RunBubble message={message} index={historyCount() + index()} />}</For>
            <Show when={c.run()?.pending?.kind === 'step' || c.run()?.pending?.kind === 'code'}><Typing /></Show>
            <Show when={c.run()?.phase === 'ended'}><div class="date-label">✓ Конец ветки</div></Show>
            <Show when={c.run()?.phase === 'limited'}><div class="path-end">Достигнут лимит тестового разговора.</div></Show>
            <Show when={c.run()?.error}><p class="inline-notice error" role="alert">{c.run()?.error}</p></Show>
          </>}>
            <For each={[viewed()]}>{id => <section id={`step-${id}`} data-testid={`story-step-${id}`} class="story-step" classList={{'is-selected': selected() === id, 'is-peek': peek() !== null}} inert={peek() !== null ? true : undefined}>
              <Show when={selected() === id && showOptions()}><div class="step-options"><button class="quiet-button" disabled={composing()} onClick={() => startAt(id)}>Пройти с этого экрана</button><Show when={!isFallbackStep(document(), id)}><label class="screen-folder-field">Папка экрана<select aria-label="Папка экрана" value={stepFolderId(document(), id)} onChange={event => moveToFolder(id, event.currentTarget.value)}><For each={document().folderOrder}>{folderId => <option value={folderId}>{document().content.folders[folderId].title}</option>}</For></select></label></Show><div class="step-tools"><button disabled={id === document().entryStepId || isFallbackStep(document(), id)} onClick={() => c.mutate({type: 'set_entry', stepId: id})}>Сделать началом</button><button class="danger-button" disabled={isFallbackStep(document(), id)} onClick={removeStep}>Удалить</button></div></div></Show>
              <For each={blockIds(id)}>{blockId => {
                const block = () => newLogic()?.block.id === blockId ? newLogic()!.block : document().blocks[blockId];
                const messageId = () => block()?.type === 'message' ? (block() as {messageId: string}).messageId : '';
                return <div class="screen-block" id={`block-${blockId}`} data-block-id={blockId}>
                  <div class="logic-insertion"><AddElement theme={theme()} disabled={composing()} onBeforeOpen={prepareLogic} onChoose={type => {const index = document().steps[id].blockIds.indexOf(blockId); addElement(id, type, index > 0 ? document().steps[id].blockIds[index - 1] : null);}}/></div>
                  <Show when={messageId()} fallback={<LogicEditor stepId={id} blockId={blockId}/>}>{messageId => <>
                    <AuthorMessage stepId={id} blockId={blockId} messageId={messageId()}/>
                    <Show when={document().steps[id].blockIds.length > 1}><div class="screen-block-tools">
                      <BlockGrip blockId={blockId} targetIds={document().steps[id].blockIds} version={document()} label="Сообщение" disabled={composing()} onMove={direction => {const index = document().steps[id].blockIds.indexOf(blockId) + direction; if(index >= 0 && index < document().steps[id].blockIds.length) moveBlock(id, blockId, index);}} onReorder={(target, after) => reorderBlock(id, blockId, target, after)}/>
                    </div></Show>
                  </>}</Show>
                </div>;
              }}</For>
              <div class="screen-add-actions">
                <AddElement compact theme={theme()} disabled={composing() || document().steps[id].blockIds.length >= ShellLimits.blocksPerStep} onBeforeOpen={prepareLogic} onChoose={type => addElement(id, type, document().steps[id].blockIds.at(-1) ?? null)}/>
              </div>
            </section>}</For>
          </Show>
        </div>
      </div>
      <Show when={test() && Object.values(visibleDocument().blocks).some(block => block.type !== 'message')}>
        <LogicTestControls document={visibleDocument()} values={c.run()!.variables} seedValues={c.testSeed().variables} trace={c.run()!.trace} virtualNow={c.run()!.now}
          waiting={c.run()?.pending?.kind === 'wait' ? c.run()!.trace.at(-1)?.detail || 'Ожидание' : undefined}
          canAdvance={c.run()?.pending?.kind === 'wait' && [c.run()!.pending].some(pending => pending?.kind === 'wait' && (pending.dueAt !== null || pending.timeoutAt !== null))}
          failed={c.run()?.phase === 'failed'} canRetry={(() => {const run = c.run(), block = run?.failure ? run.document.blocks[run.failure.blockId] : undefined; return block?.type === 'code' || block?.type === 'action' && (block.action.type !== 'http_mock' || run!.failure!.attempt < block.action.attempts);})()} onSetVariable={c.setTestVariable} onAdvance={c.advanceTime} onEmit={c.emitEvent} onRetry={c.retry}
          onOpenBlock={blockId => {const stepId = allStepIds(document()).find(id => document().steps[id].blockIds.includes(blockId)); if(stepId) openTrace(stepId, blockId);}}/>
      </Show>
      <Show when={test()} fallback={<Composer resetKey={selected()} disabled={composing()} caption={() => c.editor().textEdit ? 'Enter — новая строка · Esc — отмена' : undefined} onSend={sendAuthoredMessage} />}><TestComposer controller={c} /></Show>
      <Show when={c.notice() || c.editor().error}><div class="notice" role="status"><span>{c.editor().error || c.notice()}</span><button class="icon-button" aria-label="Закрыть уведомление" onClick={c.dismissNotice}>×</button></div></Show>
    </main>
    <Show when={codeDialog()} keyed>{dialog => <LogicCodeDialog document={document()} theme={theme()} block={dialog.block} onApply={dialog.apply} onClose={() => setCodeDialog(null)}/>}</Show>
    <Show when={inspection()} keyed>{value => <Inspector controller={c} inspection={value} theme={theme()} close={() => setInspection(null)} />}</Show>

  </div>;
}
function InlineText(props: {stepId: string; value: string; active?: boolean; autoFocus?: boolean; deferredFocus?: boolean; persistent?: boolean; onBegin?: () => void; onInput: (text: string) => void; onResize?: () => void; onFinish: (cancel?: boolean) => void; composing: (value: boolean) => void}) {
  let textarea!: HTMLTextAreaElement;
  let ime = false;
  let blurred = false;
  let observer: ResizeObserver | undefined;
  let resizeFrame: number | undefined;
  let focusFrame: number | undefined;
  let lastWidth = 0;
  const resize = () => {textarea.style.height = 'auto'; textarea.style.height = `${textarea.scrollHeight}px`; props.onResize?.();};
  createEffect(() => {
    const value = props.value;
    if(!textarea) return;
    if(resizeFrame !== undefined) cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(() => {resizeFrame = undefined; if(textarea.value === value) resize();});
  });
  onMount(() => {
    resize();
    const origin = window.document.activeElement;
    const autoFocus = props.autoFocus ?? !props.persistent;
    if(autoFocus && !props.deferredFocus) {textarea.focus(); textarea.setSelectionRange(textarea.value.length, textarea.value.length);}
    if(autoFocus && props.deferredFocus) focusFrame = requestAnimationFrame(() => {
      focusFrame = undefined;
      const active = window.document.activeElement;
      // Keep selection if the user reached the editor before this frame, and
      // never steal focus from another control they have deliberately chosen.
      if(!textarea.isConnected || active === textarea || active !== origin && active !== window.document.body) return;
      textarea.focus(); textarea.setSelectionRange(textarea.value.length, textarea.value.length);
    });
    observer = new ResizeObserver(() => {
      const width = textarea.getBoundingClientRect().width;
      if(width !== lastWidth) {
        lastWidth = width;
        if(resizeFrame !== undefined) cancelAnimationFrame(resizeFrame);
        resizeFrame = requestAnimationFrame(() => {resizeFrame = undefined; resize();});
      }
    });
    observer.observe(textarea);
  });
  onCleanup(() => {observer?.disconnect(); if(resizeFrame !== undefined) cancelAnimationFrame(resizeFrame); if(focusFrame !== undefined) cancelAnimationFrame(focusFrame); props.composing(false);});
  return <span class="message-editor-frame" data-value={props.value || 'Напишите сообщение…'}>
    <textarea ref={element => {textarea = element;}} class="message-editor" aria-label={props.active ? 'Текст сообщения' : 'Редактировать сообщение'} placeholder="Напишите сообщение…" data-testid={`editor-${props.stepId}`} value={props.value} rows={1}
      onFocus={() => props.onBegin?.()}
      onInput={event => {props.onInput(event.currentTarget.value); resize();}}
      onCompositionStart={() => {ime = true; props.composing(true);}}
      onCompositionEnd={event => {ime = false; props.composing(false); props.onInput(event.currentTarget.value); if(blurred) props.onFinish();}}
      onBlur={() => {if(ime) blurred = true; else props.onFinish();}}
      onKeyDown={event => {if(ime || event.isComposing) return; if(event.key === 'Escape' || event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {event.preventDefault(); event.stopPropagation(); const action = textarea.closest<HTMLElement>('.bubble-content-wrapper')?.querySelector<HTMLButtonElement>('.bubble-edit-action'); const message = textarea.closest<HTMLElement>('.message-actions-host'); props.onFinish(event.key === 'Escape'); queueMicrotask(() => props.persistent ? textarea.blur() : (action?.isConnected ? action : message)?.focus({preventScroll: true}));}}}
    />
  </span>;
}
