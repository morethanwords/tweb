import {For, Show, createEffect, createMemo, createSignal, onCleanup} from 'solid-js';
import type {CompanionBridge} from './companion-bridge';
import {summarizeReport, reportRecord, type ReportSummary, type ReportDetailKind} from './companion-report';
import './CompanionPanel.scss';

const outcomeLabel: Record<string, string> = {passed: 'Пройдены', failed: 'Есть ошибки', blocked: 'Проверка остановлена', observed: 'Без утверждений', unverified: 'Ещё не проверен'};
export function CompanionPanel(props: {bridge: CompanionBridge; onSelect(stepId: string): void; beforeAction(): boolean; onDiscard(): void}) {
  const state = props.bridge.state;
  const [detail, setDetail] = createSignal<{reportId: string; title: string; summary: ReportSummary | null; raw: unknown; error: string} | null>(null);
  const [fragment, setFragment] = createSignal<{kind: ReportDetailKind; index: number; offset: number; nextOffset: number | null; total: number; content: string} | null>(null);
  const [loading, setLoading] = createSignal(false);
  let requestSequence = 0;
  onCleanup(() => {requestSequence++;});
  const current = () => state().testRevision === state().confirmed.revision;
  const verification = () => {
    const value = state().confirmed.verification;
    if(!value || typeof value !== 'object' || !('outcome' in value) || typeof value.outcome !== 'string' || !('cases' in value) || !Array.isArray(value.cases)) return null;
    const cases = value.cases.filter((item): item is {title: string; outcome: string; reportId: string} =>
      item && typeof item === 'object' && typeof item.title === 'string' && typeof item.outcome === 'string' && typeof item.reportId === 'string');
    return {outcome: value.outcome, cases};
  };
  const result = () => verification() ?? state().testResult;
  const hasLocalChanges = () => state().draftActive || state().pending > 0 || state().status === 'conflict';
  const resultCurrent = () => !hasLocalChanges() && (!!verification() || current());
  const reportContext = createMemo(() => JSON.stringify([state().confirmed.epoch, state().confirmed.revision, hasLocalChanges(), result()?.cases.map(item => item.reportId)]));
  createEffect(() => {reportContext(); requestSequence++; setDetail(null); setFragment(null); setLoading(false);});
  const status = () => state().status === 'saving' ? 'Сохраняется…' : state().status === 'conflict' ? 'Есть другая версия' : state().status === 'offline' ? 'Нет подтверждения' : state().draftActive ? 'Редактирование' : 'Сохранено локально';
  async function explain(reportId: string, title: string, offset = 0) {
    const requestId = ++requestSequence;
    setLoading(true);
    try {
      const raw = await props.bridge.explain(reportId, offset);
      if(requestId !== requestSequence) return;
      const summary = summarizeReport(raw, state().confirmed.document), previous = detail();
      if(offset > 0 && previous?.reportId === reportId && previous.summary) {
        summary.failed = [...previous.summary.failed, ...summary.failed.filter(item => !previous.summary!.failed.some(existing => existing.id === item.id && existing.actual === item.actual))];
        summary.rows = [...previous.summary.rows, ...summary.rows.filter(item => !previous.summary!.rows.some(existing => existing.stepId === item.stepId))];
        summary.oversized = [...previous.summary.oversized, ...summary.oversized.filter(item => !previous.summary!.oversized.some(existing => existing.kind === item.kind && existing.index === item.index))];
      }
      setFragment(null); setDetail({reportId, title, summary, raw, error: ''});
    } catch(error) {if(requestId === requestSequence) setDetail({reportId, title, summary: detail()?.reportId === reportId ? detail()!.summary : null, raw: null, error: error instanceof Error ? error.message : 'Не удалось открыть результат.'});}
    finally {if(requestId === requestSequence) setLoading(false);}
  }
  async function openFragment(kind: ReportDetailKind, index: number, offset = 0) {
    const selected = detail(); if(!selected) return;
    const requestId = ++requestSequence; setLoading(true);
    try {
      const result = reportRecord(await props.bridge.explain(selected.reportId, 0, {kind, index, offset}));
      if(requestId !== requestSequence) return;
      if(!result || typeof result.content !== 'string' || !Number.isSafeInteger(result.totalCharacters)) throw new Error('Не удалось прочитать подробности.');
      setFragment({kind, index, offset, nextOffset: Number.isSafeInteger(result.nextOffset) ? result.nextOffset as number : null, total: result.totalCharacters as number, content: result.content});
    } catch(error) {if(requestId === requestSequence) setDetail(value => value ? {...value, error: error instanceof Error ? error.message : 'Не удалось открыть подробности.'} : null);}
    finally {if(requestId === requestSequence) setLoading(false);}
  }
  return <section class="ai-panel companion-panel" aria-label="Проверка сценария">
    <div class="section-heading"><h2>Сценарий</h2><span class="muted" role="status" data-testid="companion-status">{status()}</span></div>
    <Show when={state().message}><p class="inline-notice" role="alert">{state().message}</p></Show>
    <Show when={state().status === 'conflict' || state().status === 'offline'}>
      <div class="ai-actions"><button class="quiet-button" onClick={() => {if(props.beforeAction()) void props.bridge.retry();}}>Повторить правку</button><button class="quiet-button" onClick={props.onDiscard}>Открыть актуальную</button></div>
    </Show>
    <div class="ai-actions"><button class="primary-button" disabled={state().testing || state().pending > 0 || state().status !== 'ready'} onClick={() => {if(props.beforeAction()) void props.bridge.test();}}>{state().testing ? 'Проверяем…' : 'Проверить сценарии'}</button></div>
    <Show when={result()}>{value => <details class="demo-options">
      <summary>{resultCurrent() ? outcomeLabel[value().outcome] ?? value().outcome : hasLocalChanges() ? 'Изменения ещё не проверены' : 'Результат предыдущей версии'}</summary>
      <For each={value().cases}>{item => <button class="quiet-button" disabled={loading() || hasLocalChanges()} onClick={() => void explain(item.reportId, item.title)}>{item.title} · {outcomeLabel[item.outcome] ?? item.outcome}</button>}</For>
    </details>}</Show>
    <Show when={detail()}>{item => <details class="demo-options companion-report" open><summary>{item().title}</summary>
      <Show when={item().error}><p class="inline-notice" role="alert">{item().error}</p></Show>
      <Show when={item().summary}>{summary => <>
        <Show when={summary().error}><p class="inline-notice" role="alert" data-testid="companion-report-error">{summary().error}</p></Show>
        <For each={summary().failed.slice(0, 3)}>{failure => <div class="companion-failure" data-testid="companion-failed-condition"><strong>{failure.title}</strong><dl><dt>Ожидалось</dt><dd>{failure.expected}</dd><dt>Получено</dt><dd>{failure.actual}</dd></dl></div>}</For>
        <Show when={summary().failed.length > 3}><details><summary>Ещё {summary().failed.length - 3} условий</summary><For each={summary().failed.slice(3)}>{failure => <div class="companion-failure"><strong>{failure.title}</strong><dl><dt>Ожидалось</dt><dd>{failure.expected}</dd><dt>Получено</dt><dd>{failure.actual}</dd></dl></div>}</For></details></Show>
        <For each={summary().rows}>{row => <button class="quiet-button" onClick={() => props.onSelect(row.stepId)}>{row.label || 'Экран'}</button>}</For>
        <Show when={summary().evidenceTruncated}><p class="muted">Проверка остановилась на лимите данных; отчёт неполный.</p></Show>
        <details class="companion-report-data"><summary>Данные проверки</summary><pre>{JSON.stringify(item().raw, null, 2)}</pre>
          <Show when={summary().nextOffset !== null}><button class="quiet-button" disabled={loading()} onClick={() => void explain(item().reportId, item().title, summary().nextOffset!)}>Следующая часть отчёта</button></Show>
          <For each={summary().oversized}>{oversized => <button class="quiet-button" disabled={loading()} onClick={() => void openFragment(oversized.kind, oversized.index)}>Открыть {oversized.kind === 'assertion' ? 'длинное условие' : oversized.kind === 'receipt' ? 'результат действия' : 'длинную запись'} {oversized.index + 1}</button>}</For>
          <Show when={fragment()}>{part => <><p class="muted">Символы {part().offset + 1}–{part().offset + part().content.length} из {part().total}</p><pre>{part().content}</pre><Show when={part().nextOffset !== null}><button class="quiet-button" disabled={loading()} onClick={() => void openFragment(part().kind, part().index, part().nextOffset!)}>Следующий фрагмент</button></Show></>}</Show>
        </details>
      </>}</Show>
    </details>}</Show>
  </section>;
}
