import {For, Show, createSignal, onCleanup, onMount} from 'solid-js';
import {Portal} from 'solid-js/web';
import {allStepIds, keyboardDraft, stepReference} from './core';
import {ShellLimits, ButtonColors, type ButtonColor, type KeyboardDraft} from './core/types';
import type {Controller} from './controller';
import {inspectorPosition, type AnchorBounds} from './inspector-position';
import './Inspector.scss';

export interface Inspection {stepId: string; messageId: string; sourceOccurrenceId?: string; buttonId?: string; anchor: HTMLElement}
export function Inspector(props: {controller: Controller; inspection: Inspection; theme: 'day' | 'night'; close: () => void}) {
  const c = props.controller;
  const baseRevision = c.editor().revision;
  const original = keyboardDraft(c.editor().document, props.inspection.stepId, props.inspection.messageId);
  const buttonId = props.inspection.buttonId ?? c.id('button');
  if(!props.inspection.buttonId) {
    const last = [...original.rows].reverse().find(row => row.buttonIds.length < ShellLimits.buttonsPerRow);
    if(last && last.buttonIds.length < ShellLimits.buttonsPerRow) last.buttonIds.push(buttonId);
    else original.rows.push({id: c.id('row'), buttonIds: [buttonId]});
    original.buttons[buttonId] = {targetStepId: null, color: 'default'};
    original.labels[buttonId] = '';
  }
  const [draft, setDraft] = createSignal(original);
  const [error, setError] = createSignal('');
  const colorLabels: Record<ButtonColor, string> = {default: 'Стандартный цвет', blue: 'Синий цвет', green: 'Зелёный цвет', red: 'Красный цвет'};
  let dialog!: HTMLDialogElement;
  let input!: HTMLInputElement;
  let content!: HTMLDivElement;
  let composing = false;
  let lastAnchor: AnchorBounds | null = props.inspection.anchor.isConnected ? props.inspection.anchor.getBoundingClientRect() : null;
  let frame: number | undefined;
  let disposed = false;
  let observer: ResizeObserver | undefined;
  const visualViewport = window.visualViewport;
  function resolveAnchor(): HTMLElement | null {
    if(props.inspection.anchor.isConnected) return props.inspection.anchor;
    const step = document.getElementById(props.inspection.sourceOccurrenceId ? `occurrence-${props.inspection.sourceOccurrenceId}` : `message-${props.inspection.messageId}`);
    if(!step) return null;
    const replacement = props.inspection.buttonId
      ? Array.from(step.querySelectorAll<HTMLElement>('[data-button-id]')).find(element => element.dataset.buttonId === props.inspection.buttonId)
      : null;
    return replacement ?? step.querySelector<HTMLElement>('.shell-add-button') ?? step;
  }
  function style(name: string, value: number) {
    const pixels = `${value}px`;
    if(dialog.style.getPropertyValue(name) !== pixels) dialog.style.setProperty(name, pixels);
  }
  function position() {
    if(disposed || !dialog.open) return;
    const viewport = {left: visualViewport?.offsetLeft ?? 0, top: visualViewport?.offsetTop ?? 0, width: visualViewport?.width ?? window.innerWidth, height: visualViewport?.height ?? window.innerHeight};
    const anchor = resolveAnchor();
    if(anchor) lastAnchor = anchor.getBoundingClientRect();
    const mobile = window.innerWidth < 900;
    const bounds = inspectorPosition(viewport, lastAnchor, 0, mobile);
    // Constrain width before measuring wrapping, then height before choosing the side.
    // Read the actual flex layout so content changes can also shrink the inspector.
    dialog.dataset.compact = String(bounds.maxHeight < 180);
    dialog.dataset.position = mobile ? 'bottom-sheet' : 'below';
    style('width', bounds.width); style('max-height', bounds.maxHeight);
    const result = inspectorPosition(viewport, lastAnchor, dialog.getBoundingClientRect().height, mobile);
    style('left', result.left); style('top', result.top);
    dialog.dataset.position = result.placement;
  }
  function schedulePosition() {
    if(disposed || frame !== undefined) return;
    frame = requestAnimationFrame(() => {frame = undefined; position();});
  }
  onMount(() => {
    dialog.showModal(); position(); input.focus({preventScroll: true});
    observer = new ResizeObserver(schedulePosition); observer.observe(dialog); observer.observe(content);
    visualViewport?.addEventListener('resize', schedulePosition);
    visualViewport?.addEventListener('scroll', schedulePosition);
    window.addEventListener('resize', schedulePosition);
    document.addEventListener('scroll', schedulePosition, true);
    schedulePosition();
  });
  onCleanup(() => {
    disposed = true;
    if(frame !== undefined) cancelAnimationFrame(frame);
    observer?.disconnect();
    visualViewport?.removeEventListener('resize', schedulePosition);
    visualViewport?.removeEventListener('scroll', schedulePosition);
    window.removeEventListener('resize', schedulePosition);
    document.removeEventListener('scroll', schedulePosition, true);
    if(dialog.open) dialog.close();
    resolveAnchor()?.focus({preventScroll: true});
  });
  function update(fn: (value: KeyboardDraft) => void) {
    const value = structuredClone(draft()); fn(value);
    value.rows = value.rows.filter(row => row.buttonIds.length);
    setDraft(value); setError('');
  }
  function apply(value = draft()) {
    if(composing) return;
    if(props.inspection.sourceOccurrenceId) {
      if(c.applyRunKeyboard(props.inspection.sourceOccurrenceId, value, baseRevision)) props.close();
      else setError(c.editor().error || c.notice() || 'Не удалось изменить кнопки.');
      return;
    }
    c.mutate({type: 'set_keyboard', stepId: props.inspection.stepId, messageId: props.inspection.messageId, keyboard: value}, baseRevision);
    const issue = c.editor().error;
    if(issue) setError(issue); else props.close();
  }
  function remove() {
    if(composing) return;
    const value = structuredClone(draft());
    value.rows = value.rows.map(row => ({...row, buttonIds: row.buttonIds.filter(id => id !== buttonId)})).filter(row => row.buttonIds.length);
    delete value.buttons[buttonId]; delete value.labels[buttonId];
    apply(value);
  }
  return <Portal><dialog ref={element => {dialog = element;}} class="inspector shell-inspector" classList={{night: props.theme === 'night'}} data-testid="keyboard-inspector" aria-labelledby="inspector-title" onCancel={event => {event.preventDefault(); if(!composing) props.close();}}>
    <div class="sheet-handle" />
    <header class="inspector-header"><h2 id="inspector-title">{props.inspection.buttonId ? 'Кнопка' : 'Новая кнопка'}</h2><button type="button" class="icon-button" aria-label="Закрыть инспектор" onClick={() => {if(!composing) props.close();}}>×</button></header>
    <div class="inspector-body"><div class="inspector-scroll-content" ref={element => {content = element;}}>
      <label class="field">Подпись<input ref={element => {input = element;}} onCompositionStart={() => {composing = true;}} onCompositionEnd={() => {composing = false;}} value={draft().labels[buttonId]} placeholder="Например, Узнать подробнее" onInput={event => update(value => {value.labels[buttonId] = event.currentTarget.value;})} /></label>
      <label class="field">Куда перейти<select value={draft().buttons[buttonId].targetStepId ?? ''} onChange={event => update(value => {value.buttons[buttonId].targetStepId = event.currentTarget.value || null;})}>
        <option value="">Выбрать экран</option><For each={allStepIds(c.editor().document)}>{id => <option value={id}>{stepReference(c.editor().document, id)}</option>}</For>
      </select></label>
      <div class="button-colors" role="group" aria-label="Цвет кнопки"><span>Цвет</span><div class="button-color-options"><For each={ButtonColors}>{color => <button type="button" class="button-color-swatch" data-button-color={color} aria-label={colorLabels[color]} title={colorLabels[color]} aria-pressed={draft().buttons[buttonId].color === color} onClick={() => update(value => {value.buttons[buttonId].color = color;})}>
        <Show when={draft().buttons[buttonId].color === color}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m5 12 4 4L19 6" /></svg></Show>
      </button>}</For></div></div>
      <Show when={error()}><p class="error" role="alert">{error()}</p></Show>
    </div></div>
    <footer class="inspector-footer">{props.inspection.buttonId && <button type="button" class="danger-button" onClick={remove}>Удалить</button>}<button type="button" class="quiet-button" onClick={() => {if(!composing) props.close();}}>Отмена</button><button type="button" class="primary-button" onClick={() => apply()}>Применить</button></footer>
  </dialog></Portal>;
}
