import {Suspense, createMemo, createSignal, lazy, onCleanup, onMount} from 'solid-js';
import {Portal} from 'solid-js/web';
import type {CodeBlock, ShellDocument} from './core/types';
import './LogicIntegration.scss';

const CodeEditor = lazy(() => import('./code/CodeEditor'));

export function LogicCodeDialog(props: {block: CodeBlock; document: ShellDocument; theme: 'day' | 'night'; onApply(source: string): void; onClose(): void}) {
  const [composing, setComposing] = createSignal(false);
  const [source, setSource] = createSignal(props.block.source);
  const variableTypes = createMemo(() => Object.fromEntries(Object.values(props.document.variables).map(variable => [variable.id, variable.valueType])));
  const origin = window.document.activeElement;
  let panel!: HTMLDivElement;
  let overlay!: HTMLDivElement;
  let frame: number | undefined;
  const viewport = window.visualViewport;
  function position() {
    overlay.style.top = `${viewport?.offsetTop ?? 0}px`;
    overlay.style.left = `${viewport?.offsetLeft ?? 0}px`;
    overlay.style.width = `${viewport?.width ?? window.innerWidth}px`;
    overlay.style.height = `${viewport?.height ?? window.innerHeight}px`;
  }
  function schedulePosition() {
    if(frame === undefined) frame = requestAnimationFrame(() => {frame = undefined; position();});
  }
  function keys(event: KeyboardEvent) {
    if(event.isComposing || composing()) return;
    if(event.key === 'Escape') {event.preventDefault(); event.stopPropagation(); props.onClose(); return;}
    if(event.key !== 'Tab') return;
    const controls = [...panel.querySelectorAll<HTMLElement>('button:not(:disabled), input, textarea, select, [tabindex="0"], [contenteditable="true"]')].filter(element => element.getClientRects().length);
    const first = controls[0], last = controls.at(-1);
    if(event.shiftKey && (window.document.activeElement === first || window.document.activeElement === panel)) {event.preventDefault(); last?.focus();}
    else if(!event.shiftKey && window.document.activeElement === last) {event.preventDefault(); first?.focus();}
  }
  onMount(() => {
    position(); panel.focus();
    viewport?.addEventListener('resize', schedulePosition);
    viewport?.addEventListener('scroll', schedulePosition);
    window.addEventListener('resize', schedulePosition);
  });
  onCleanup(() => {
    if(frame !== undefined) cancelAnimationFrame(frame);
    viewport?.removeEventListener('resize', schedulePosition);
    viewport?.removeEventListener('scroll', schedulePosition);
    window.removeEventListener('resize', schedulePosition);
    queueMicrotask(() => {if(origin instanceof HTMLElement && origin.isConnected) origin.focus({preventScroll: true});});
  });
  return <Portal><div ref={element => {overlay = element;}} class="logic-code-overlay logic-themed" classList={{night: props.theme === 'night'}}>
    <div ref={element => {panel = element;}} class="logic-code-dialog" role="dialog" aria-modal="true" aria-label="Редактор TypeScript" tabIndex={-1} onKeyDown={keys} onCompositionStart={() => setComposing(true)} onCompositionEnd={() => setComposing(false)}>
      <header><div><strong>{props.block.name || 'Код'}</strong><span>TypeScript · результат выбирает видимую ветку</span></div><button type="button" class="icon-button" aria-label="Закрыть код" disabled={composing()} onClick={props.onClose}>×</button></header>
      <Suspense fallback={<p class="logic-code-loading" role="status">Открываем редактор…</p>}><CodeEditor source={source()} variableTypes={variableTypes()} outcomes={props.block.outcomes.map(outcome => outcome.name)} onChange={setSource}/></Suspense>
      <footer><button type="button" class="quiet-button" disabled={composing()} onClick={props.onClose}>Отмена</button><button type="button" class="primary-button" disabled={composing()} onClick={() => {props.onApply(source()); props.onClose();}}>Готово</button></footer>
    </div>
  </div></Portal>;
}
