import {Accessor, createSignal, For, onCleanup, Show} from 'solid-js';
import classNames from '@helpers/string/classNames';
import {copyTextToClipboard} from '@helpers/clipboard';
import {
  BENCH_SCENARIOS,
  benchNotes,
  benchToMarkdown,
  bestOf,
  BenchResult,
  BenchScenario,
  listBenchModes,
  runWidgetBench
} from '@lib/widgetSandbox/bench';
import panelStyles from '@components/popupSandbox/sandbox.module.scss';
import styles from '@components/widgetSandbox/sandbox.module.scss';

/** A fieldset of checkboxes, one per option, ticked as `picked` has them; a change toggles one there. */
function CheckboxGroup<T>(props: {
  legend: string,
  options: {id: T, label: string}[],
  picked: Accessor<Set<T>>,
  setPicked: (value: Set<T>) => void,
  disabled: boolean
}) {
  const toggle = (id: T) => {
    const next = new Set(props.picked());
    if(!next.delete(id)) next.add(id);
    props.setPicked(next);
  };

  return (
    <fieldset class={styles.BenchGroup} disabled={props.disabled}>
      <legend>{props.legend}</legend>
      <For each={props.options}>
        {(option) => (
          <label>
            <input type="checkbox" checked={props.picked().has(option.id)} onChange={() => toggle(option.id)} />
            {option.label}
          </label>
        )}
      </For>
    </fieldset>
  );
}

/**
 * The widget sandbox's Bench view: the engines this browser can run, measured against each other on the same widgets
 * (lib/widgetSandbox/bench.ts), as a table with the best of each row marked. The widgets run over the lower half of
 * the window while the bench goes on, every one in sight.
 */
export default function BenchView() {
  const modes = listBenchModes();
  const [pickedModes, setPickedModes] = createSignal(new Set(modes.map(({id}) => id)));
  const [pickedScenarios, setPickedScenarios] = createSignal(new Set<BenchScenario>(BENCH_SCENARIOS.map(({id}) => id)));
  const [progress, setProgress] = createSignal('');
  const [result, setResult] = createSignal<BenchResult>();
  const [copied, setCopied] = createSignal(false);
  let box: HTMLDivElement;
  let abort: AbortController;

  const run = async() => {
    abort = new AbortController();
    setResult(undefined);
    setCopied(false);
    try {
      setResult(await runWidgetBench({
        container: box,
        modes: modes.filter(({id}) => pickedModes().has(id)).map(({id}) => id),
        scenarios: BENCH_SCENARIOS.filter(({id}) => pickedScenarios().has(id)).map(({id}) => id),
        onProgress: setProgress,
        signal: abort.signal
      }));
    } finally {
      abort = undefined;
      setProgress('');
    }
  };

  // the app's way (its window, which may be the Document PiP one, and a fallback where the page has no clipboard:
  // a plain-HTTP preview), "Copied" only once it has
  const copy = async() => {
    try {
      await copyTextToClipboard(benchToMarkdown(result()), undefined, {rethrow: true});
      setCopied(true);
    } catch{}
  };

  onCleanup(() => abort?.abort());

  return (
    <div class={classNames(styles.Bench, panelStyles.NativeControls)}>
      <CheckboxGroup legend="Engines" options={modes} picked={pickedModes} setPicked={setPickedModes} disabled={!!progress()} />
      <CheckboxGroup legend="Scenarios" options={BENCH_SCENARIOS} picked={pickedScenarios} setPicked={setPickedScenarios} disabled={!!progress()} />
      <div class={styles.BenchActions}>
        <Show
          when={progress()}
          fallback={
            <button class={styles.BenchButton} type="button" onClick={run} disabled={!pickedModes().size || !pickedScenarios().size}>
              Run
            </button>
          }
        >
          <button class={styles.BenchButton} type="button" onClick={() => abort?.abort()}>Stop after this step</button>
        </Show>
        <Show when={result()}>
          <button class={styles.BenchButton} type="button" onClick={copy}>{copied() ? 'Copied' : 'Copy as Markdown'}</button>
        </Show>
        <span class={styles.BenchProgress} role="status">{progress()}</span>
      </div>
      <Show when={result()}>
        {(result) => (
          <div class={styles.BenchTableWrap}>
            <table class={styles.BenchTable}>
              <caption>
                {result().env.userAgent}; {result().env.cores} cores; JSPI {result().env.jspi ? 'yes' : 'no'};
                cross-origin isolated {result().env.isolated ? 'yes' : 'no'}. Bold: the best of a row.
                <For each={benchNotes(result())}>{(note) => <> *{note}.</>}</For>
              </caption>
              <thead>
                <tr>
                  <th scope="col">Scenario</th>
                  <th scope="col">Metric</th>
                  <For each={result().modes}>{(mode) => <th scope="col">{mode.label}</th>}</For>
                </tr>
              </thead>
              <tbody>
                <For each={result().rows}>
                  {(row) => {
                    const best = bestOf(row);
                    return (
                      <tr>
                        <td>{BENCH_SCENARIOS.find(({id}) => id === row.scenario)?.label}</td>
                        <td>{row.metric}</td>
                        <For each={result().modes}>
                          {(mode) => {
                            const value = row.values[mode.id];
                            return (
                              <td class={classNames(value === best && styles.BenchBest)}>
                                {value === null || value === undefined ? '–' : `${value} ${row.unit}${row.notes?.[mode.id] ? '*' : ''}`}
                              </td>
                            );
                          }}
                        </For>
                      </tr>
                    );
                  }}
                </For>
              </tbody>
            </table>
            <Show when={Object.keys(result().deaths).length}>
              <ul class={styles.BenchDeaths}>
                <For each={Object.entries(result().deaths)}>
                  {([id, list]) => <li>{id}: {list.length} died — {list.slice(0, 3).join('; ')}</li>}
                </For>
              </ul>
            </Show>
          </div>
        )}
      </Show>
      <div class={styles.BenchBox} ref={box} />
    </div>
  );
}
