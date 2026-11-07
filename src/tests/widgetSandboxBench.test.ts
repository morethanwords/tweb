// the widget bench (lib/widgetSandbox/bench.ts) on a runtime that draws at once and fixtures slow to load: what a mode
// is timed for is its engines' work, never the fixtures' loading, which would cost the first mode alone; and the
// frames the page gets, judged against the display's
const FIXTURE_MS = 200;
const events = vi.hoisted(() => [] as string[]);
/** How long an engine's preparation holds the page's thread (as `inline` makes its VM there). */
const prepare = vi.hoisted(() => ({blocksMs: 0}));

vi.mock('@lib/widgetSandbox/fixtures', () => ({
  loadWidgetFixture: async(name: string) => {
    await new Promise((resolve) => setTimeout(resolve, FIXTURE_MS));
    events.push('loaded ' + name);
    return `<p>${name}</p>`;
  }
}));

vi.mock('@lib/widgetSandbox/runtime', () => ({
  applyWidgetEngineOptions: async() => {},
  startWidgetEnginesCold: async() => {},
  resolveWidgetTransport: (choice: string) => choice,
  loadWidgetRuntime: async() => ({
    prepare: async(): Promise<void> => {
      await null;
      const end = performance.now() + prepare.blocksMs;
      while(performance.now() < end);
    },
    createHost: (_container: HTMLElement, html: string, options: {onResize: (height: number) => void, onLoaded: () => void}) => {
      events.push('started ' + html);
      setTimeout(() => {
        options.onResize(100);
        options.onLoaded();
      }, 0);
      return {destroy() {}};
    }
  })
}));

import {afterEach, describe, expect, it} from 'vitest';
import {listBenchModes, runWidgetBench} from '@lib/widgetSandbox/bench';

const requestAnimationFrame = window.requestAnimationFrame;
afterEach(() => {
  window.requestAnimationFrame = requestAnimationFrame;
});

describe('the widget bench', () => {
  it('loads every widget\'s source before it times anything, so that no mode pays for it', async() => {
    const modes = listBenchModes().map(({id}) => id).slice(0, 2);
    expect(modes).toHaveLength(2);
    const container = document.createElement('div');
    document.body.append(container);
    const result = await runWidgetBench({container, modes, scenarios: ['first']});
    container.remove();

    const lastLoaded = events.reduce((last, event, index) => event.startsWith('loaded') ? index : last, -1);
    expect(events.findIndex((event) => event.startsWith('started'))).toBeGreaterThan(lastLoaded);
    const drawn = result.rows.find((row) => row.scenario === 'first' && row.metric === 'drawn');
    for(const id of modes) expect(drawn.values[id]).toBeLessThan(FIXTURE_MS);
  });

  it('counts what the engine\'s preparation held the page for in a start\'s page time', async() => {
    prepare.blocksMs = 40;
    const [mode] = listBenchModes().map(({id}) => id);
    const container = document.createElement('div');
    document.body.append(container);
    const result = await runWidgetBench({container, modes: [mode], scenarios: ['first']});
    container.remove();
    prepare.blocksMs = 0;

    const held = result.rows.find((row) => row.scenario === 'first' && row.metric === 'page held by the start').values[mode];
    expect(held).toBeGreaterThanOrEqual(30);
    // and the drawn time as it was: from the start, the preparation in it
    const drawn = result.rows.find((row) => row.scenario === 'first' && row.metric === 'drawn').values[mode];
    expect(drawn).toBeGreaterThanOrEqual(40);
  });

  it('counts a frame slow against the display\'s refresh, not the mode\'s own: missing every other one is all slow', async() => {
    // a display at 60 Hz, which the page gets every frame of while idle and every other one of with the widgets running
    let clock = 0, interval = 1000 / 60;
    window.requestAnimationFrame = (callback) => window.setTimeout(() => callback(clock += interval), 4);
    events.length = 0;
    const [mode] = listBenchModes().map(({id}) => id);
    const container = document.createElement('div');
    document.body.append(container);
    const running = runWidgetBench({container, modes: [mode], scenarios: ['anim']});
    const started = setInterval(() => {
      if(events.some((event) => event.startsWith('started'))) interval = 2000 / 60;
    }, 1);
    const result = await running;
    clearInterval(started);
    container.remove();

    const row = (metric: string) => result.rows.find((row) => row.scenario === 'anim' && row.metric === metric).values[mode];
    expect(row('page frames')).toBe(30);
    expect(row('slow page frames')).toBe(100);
  }, 30_000);
});
