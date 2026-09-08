import {For, Show, Switch, Match, createEffect, createSignal, createUniqueId, onCleanup, type JSX} from 'solid-js';
import type {AskBlock, ActionBlock, CodeBlock, DecisionBlock, ShellDocument, WaitBlock} from '../core/types';
import {AskFields, ActionFields, CodeFields, DecisionFields, WaitFields} from './BlockFields';
import {BlockGrip} from './BlockGrip';
import {LogicIcon, logicLabels} from './LogicIcon';
import {blockCaption, conditionCaption, transitionCaption, type LogicBlock} from './drafts';
import Bubble from '../native/Bubble';
import './Logic.scss';

export interface LogicBlockCardProps {
  document: ShellDocument;
  block: LogicBlock;
  expanded: boolean;
  isNew?: boolean;
  messageText?: string;
  error?: string;
  onExpand(): void;
  onCancel(): void;
  onApply(block: LogicBlock, messageText?: string): boolean;
  onDelete?(): void;
  onMove(direction: -1 | 1): void;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onReorder(targetBlockId: string, after: boolean): void;
  newId(prefix: string): string;
  onOpenCode(block: CodeBlock, onSourceChange: (source: string) => void): void;
  onCompositionChange?(value: boolean): void;
  onDraftState?(dirty: boolean, reveal: () => void): void;
  disabled?: boolean;
}

/** The parent owns selection. Each opening creates one isolated draft and one Apply boundary. */
export function LogicBlockCard(props: LogicBlockCardProps): JSX.Element {
  const panelId = `logic-panel-${createUniqueId()}`;
  const [folded, setFolded] = createSignal(false);
  const [composing, setComposing] = createSignal(false);
  const [preview, setPreview] = createSignal<{block: LogicBlock; text: string; dirty: boolean} | null>(null);
  const open = () => props.expanded && !folded();
  const shownBlock = () => props.expanded ? preview()?.block ?? props.block : props.block;
  const question = () => props.expanded ? preview()?.text ?? props.messageText ?? '' : props.messageText ?? '';
  const caption = () => {
    const block = shownBlock();
    return block.type === 'decision' ? conditionCaption(props.document, block.cases[0].condition) + (block.cases.length > 1 ? ` · ещё ${block.cases.length - 1}` : '') : blockCaption(props.document, block);
  };
  createEffect(() => {if(!props.expanded) {setFolded(false); setPreview(null);}});
  function toggle() {
    if(props.disabled || composing()) return;
    if(props.expanded) setFolded(value => !value);
    else props.onExpand();
  }
  const targets = () => Object.values(props.document.steps).find(step => step.blockIds.includes(props.block.id))?.blockIds ?? [];
  return <section class="logic-card" classList={{'is-expanded': open(), 'is-question': props.block.type === 'ask'}} data-testid={`logic-block-${props.block.id}`}>
    <Show when={props.block.type === 'ask' && !open()}><Bubble text={question()} time="12:00" onEdit={toggle}/></Show>
    <header class="logic-card-header"><Show when={!props.isNew}>
      <BlockGrip blockId={props.block.id} targetIds={targets()} version={props.document} label={logicLabels[props.block.type]} disabled={props.disabled || props.expanded}
        onMove={direction => {if(direction === -1 ? props.canMoveUp : props.canMoveDown) props.onMove(direction);}} onReorder={props.onReorder}/>
    </Show><button type="button" class="logic-card-trigger" aria-expanded={open()} aria-controls={panelId} disabled={props.disabled || composing()}
      aria-label={`${open() ? 'Свернуть' : 'Развернуть'} ${logicLabels[props.block.type].toLowerCase()}`} onClick={toggle}>
      <span class="logic-card-symbol"><LogicIcon kind={props.block.type} size={16}/></span><span class="logic-card-caption"><strong>{open() ? logicLabels[props.block.type] : caption()}<Show when={props.expanded && preview()?.dirty}><span class="logic-draft-dot" role="img" aria-label="Есть неприменённые изменения" title="Есть неприменённые изменения"/></Show></strong></span>
      <svg class="logic-card-chevron" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m7 10 5 5 5-5"/></svg>
    </button></header>
    <Show when={!open() && (props.block.type === 'decision' || props.block.type === 'code')}>
      <button type="button" class="logic-routes" disabled={props.disabled || composing()} onClick={toggle} aria-label={`Изменить ${logicLabels[props.block.type].toLowerCase()}`}>
        <Show when={props.block.type === 'decision'}><For each={(shownBlock() as DecisionBlock).cases.slice(0, 3)}>{branch => <span class="logic-route"><span>{(shownBlock() as DecisionBlock).cases.length === 1 ? 'Да' : branch.label}</span><span>→ {transitionCaption(props.document, branch.transition)}</span></span>}</For>
          <Show when={(shownBlock() as DecisionBlock).cases.length > 3}><span class="logic-route-more">Ещё {(shownBlock() as DecisionBlock).cases.length - 3}</span></Show>
          <span class="logic-route"><span>Иначе</span><span>→ {transitionCaption(props.document, (shownBlock() as DecisionBlock).otherwise)}</span></span>
        </Show>
        <Show when={props.block.type === 'code'}><For each={(shownBlock() as CodeBlock).outcomes.slice(0, 3)}>{outcome => <span class="logic-route"><span>{outcome.name}</span><span>→ {transitionCaption(props.document, outcome.transition)}</span></span>}</For>
          <Show when={(shownBlock() as CodeBlock).outcomes.length > 3}><span class="logic-route-more">Ещё {(shownBlock() as CodeBlock).outcomes.length - 3}</span></Show>
        </Show>
      </button>
    </Show>
    <div id={panelId} hidden={!open()} inert={!open() ? true : undefined}>
      <Show when={props.expanded}><LogicDraftEditor {...props} visible={open()} onPreview={value => {setPreview(value); props.onDraftState?.(value.dirty, () => setFolded(false));}}
        onCompositionChange={value => {setComposing(value); props.onCompositionChange?.(value);}}/></Show>
    </div>
  </section>;
}

function LogicDraftEditor(props: LogicBlockCardProps & {visible: boolean; onPreview(value: {block: LogicBlock; text: string; dirty: boolean}): void}): JSX.Element {
  const initial = structuredClone(props.block);
  const initialText = props.messageText ?? (props.block.type === 'ask' ? props.document.content.messages[props.block.messageId] ?? '' : '');
  const [draft, setDraft] = createSignal<LogicBlock>(initial);
  const [text, setText] = createSignal(initialText);
  const [localError, setLocalError] = createSignal('');
  const [invalidInput, setInvalidInput] = createSignal(false);
  let form!: HTMLFormElement;
  let lastFocused: HTMLElement | undefined;
  let focusFrame: number | undefined;
  let composing = false, disposed = false;
  function change(value: LogicBlock): void {if(!disposed) {setDraft(value); setLocalError('');}}
  function composition(value: boolean): void {composing = value; props.onCompositionChange?.(value);}
  createEffect(() => props.onPreview({block: draft(), text: text(), dirty: invalidInput() || JSON.stringify(draft()) !== JSON.stringify(initial) || text() !== initialText}));
  createEffect(() => {
    if(!props.visible) return;
    focusFrame = requestAnimationFrame(() => {
      focusFrame = undefined;
      if(!disposed && props.visible) (lastFocused?.isConnected ? lastFocused : form.querySelector<HTMLElement>('textarea, input, select, button'))?.focus({preventScroll: true});
    });
    onCleanup(() => {if(focusFrame !== undefined) {cancelAnimationFrame(focusFrame); focusFrame = undefined;}});
  });
  onCleanup(() => {disposed = true; if(composing) props.onCompositionChange?.(false);});
  function revealInvalid(event: Event): void {
    if(!(event.target instanceof HTMLElement)) return;
    let parent = event.target.parentElement;
    while(parent && parent !== form) {if(parent instanceof HTMLDetailsElement) parent.open = true; parent = parent.parentElement;}
    setInvalidInput(true);
  }
  onCleanup(() => form.removeEventListener('invalid', revealInvalid, true));
  function apply(event: SubmitEvent): void {
    event.preventDefault();
    if(composing || props.disabled || !form.reportValidity()) return;
    if(!props.onApply(structuredClone(draft()), draft().type === 'ask' ? text() : undefined)) setLocalError('Изменение не применено. Проверьте поля и сообщение об ошибке.');
  }
  return <form class="logic-card-body" ref={element => {form = element; form.addEventListener('invalid', revealInvalid, true);}} onSubmit={apply}
    onInput={() => {setInvalidInput([...form.elements].some(element => 'validity' in element && !(element as HTMLInputElement).validity.valid));}}
    onFocusIn={event => {if(event.target instanceof HTMLElement) lastFocused = event.target;}}
    onCompositionStart={() => composition(true)} onCompositionEnd={() => composition(false)}
    onKeyDown={event => {
      if(composing || event.isComposing) return;
      if(event.key === 'Escape') {event.preventDefault(); event.stopPropagation(); props.onCancel();}
      if(event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {event.preventDefault(); form.requestSubmit();}
    }}>
    <Switch>
      <Match when={draft().type === 'ask'}><AskFields document={props.document} value={draft() as AskBlock} onChange={change} newId={props.newId} text={text()} onText={setText}/></Match>
      <Match when={draft().type === 'decision'}><DecisionFields document={props.document} value={draft() as DecisionBlock} onChange={change} newId={props.newId}/></Match>
      <Match when={draft().type === 'action'}><ActionFields document={props.document} value={draft() as ActionBlock} onChange={change} newId={props.newId}/></Match>
      <Match when={draft().type === 'wait'}><WaitFields document={props.document} value={draft() as WaitBlock} onChange={change} newId={props.newId}/></Match>
      <Match when={draft().type === 'code'}><CodeFields document={props.document} value={draft() as CodeBlock} onChange={change} newId={props.newId}
        onOpenCode={(block, onSourceChange) => {if(!composing && !props.disabled) props.onOpenCode(block, source => {if(!disposed) onSourceChange(source);});}}/></Match>
    </Switch>
    <Show when={props.error || localError()}><p class="logic-error" role="alert">{props.error || localError()}</p></Show>
    <footer class="logic-card-footer"><Show when={!props.isNew && props.onDelete}><button type="button" class="logic-delete" onClick={() => {if(!composing && !props.disabled) props.onDelete?.();}}>Удалить</button></Show>
      <button type="button" onClick={() => {if(!composing) props.onCancel();}}>Отмена</button>
      <button type="submit" class="logic-apply" disabled={props.disabled} data-testid="apply-logic-block">Применить</button>
    </footer>
  </form>;
}
