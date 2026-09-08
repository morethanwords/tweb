import {For, Show, createEffect, createSignal, onCleanup, onMount} from 'solid-js';
import {EditorState} from '@codemirror/state';
import {EditorView, keymap, lineNumbers, drawSelection, highlightActiveLine} from '@codemirror/view';
import {defaultKeymap, history, historyKeymap, indentWithTab} from '@codemirror/commands';
import {javascript} from '@codemirror/lang-javascript';
import {syntaxHighlighting, defaultHighlightStyle} from '@codemirror/language';
import {setDiagnostics, lintGutter} from '@codemirror/lint';
import {checkCode} from './adapter';
import type {CodeRequest, CodeDiagnostic, VariableType} from './contracts';
import './CodeEditor.scss';
export interface CodeEditorProps {
  source: string;
  variableTypes: Record<string, VariableType>;
  outcomes: string[];
  context?: CodeRequest['context'];
  onChange: (source: string) => void;
}
/** Embedded editor; the parent owns dialog layout and the explicit Save action. */
export default function CodeEditor(props: CodeEditorProps) {
  let host!: HTMLDivElement;
  let view: EditorView | undefined;
  let controller: AbortController | undefined;
  let revision = 0;
  const [busy, setBusy] = createSignal(false);
  const [status, setStatus] = createSignal('');
  const [diagnostics, setProblems] = createSignal<CodeDiagnostic[]>([]);
  function invalidate() {
    const current = ++revision; controller?.abort(); setBusy(false); setStatus(''); setProblems([]);
    queueMicrotask(() => {if(view && current === revision) view.dispatch(setDiagnostics(view.state, []));});
  }
  onMount(() => {
    view = new EditorView({parent: host, state: EditorState.create({doc: props.source, extensions: [
      lineNumbers(), drawSelection(), highlightActiveLine(), history(), javascript({typescript: true}), syntaxHighlighting(defaultHighlightStyle), lintGutter(),
      keymap.of([indentWithTab, ...defaultKeymap, ...historyKeymap]),
      EditorView.contentAttributes.of({'aria-label': 'Код TypeScript', 'data-testid': 'code-source', spellcheck: 'false'}),
      EditorView.updateListener.of(update => {if(update.docChanged) {invalidate(); props.onChange(update.state.doc.toString());}}),
      EditorView.lineWrapping
    ]})});
  });
  createEffect(() => {
    const source = props.source;
    if(view && source !== view.state.doc.toString()) view.dispatch({changes: {from: 0, to: view.state.doc.length, insert: source}});
  });
  createEffect(() => {JSON.stringify(props.variableTypes); JSON.stringify(props.outcomes); invalidate();});
  onCleanup(() => {revision++; controller?.abort(); view?.destroy(); view = undefined;});
  async function validate() {
    controller?.abort(); controller = new AbortController();
    const expected = ++revision;
    setBusy(true); setStatus('Проверка TypeScript…');
    const reply = await checkCode({source: view?.state.doc.toString() ?? props.source, context: props.context ?? {user:{}, conversation:{}, run:{}, bot:{}, event:{}, system:{}}, outcomes: props.outcomes, variableTypes: props.variableTypes, signal: controller.signal});
    if(expected !== revision) return;
    setBusy(false); setProblems(reply.diagnostics);
    if(view) view.dispatch(setDiagnostics(view.state, reply.diagnostics.map(item => ({from: Math.min(item.from, view!.state.doc.length), to: Math.min(item.to, view!.state.doc.length), severity: 'error', message: item.message}))));
    setStatus(reply.ok ? 'Ошибок TypeScript нет.' : reply.error);
  }
  function insert(path: string) {if(view) {view.dispatch(view.state.replaceSelection(`ctx.${path}`)); view.focus();}}
  return <section class="code-editor" data-testid="code-editor">
    <div class="code-editor-surface" ref={element => {host = element;}} />
    <div class="code-editor-variables" aria-label="Переменные контекста"><For each={Object.keys(props.variableTypes)}>{path => <button type="button" onClick={() => insert(path)} title={props.variableTypes[path]}>ctx.{path}</button>}</For></div>
    <div class="code-editor-validation"><button type="button" class="quiet-button" disabled={busy()} onClick={() => void validate()}>Проверить код</button><span role="status">{status()}</span></div>
    <Show when={diagnostics().length}><ul class="code-editor-errors"><For each={diagnostics()}>{item => <li><button type="button" onClick={() => {view?.dispatch({selection: {anchor: item.from, head: item.to}, scrollIntoView: true}); view?.focus();}}>{item.line}:{item.column} · {item.message}</button></li>}</For></ul></Show>
  </section>;
}
