import {expect, type Page} from '@playwright/test';
import {test} from './workerContext';
import {parseColor} from './popupSandbox.helpers';
import e2ePort from './ports';
import type widgetSandboxApi from '../src/lib/widgetSandbox/debug';

type WidgetSandboxApi = typeof widgetSandboxApi;

declare global {
  interface Window {
    widgetSandbox: () => Promise<WidgetSandboxApi>,
    /** Solid's render() (see open): mounts `component` in `parent`; the returned function unmounts it. */
    e2eRender: (component: () => unknown, parent: HTMLElement) => () => void,
    /** A scrolling element as what scrolls a widget (WidgetScroller). */
    e2eScrollable: (scroller: HTMLElement) => {container: HTMLElement, readonly scrollPosition: number, setScrollPositionSilently: (value: number) => void},
    /**
     * What staging.ts finds in a chat, over the sandbox: its bubbles' container and scrollable, the column in it, and a
     * widget's bubble with its attachment, not in the column yet.
     */
    e2eChat: () => {chat: any, container: HTMLElement, chatInner: HTMLElement, bubble: HTMLElement, attachment: HTMLElement},
    /**
     * A widget on the transport users get, until it stops: why it stopped ('' if not in 5 s). `around` starts once the
     * engine is ready, before the widget, and what it returns runs once the widget has stopped.
     */
    e2eRunUntilDead: (html: string, around?: () => () => void) => Promise<string>
  }
}

// HTML widgets (messageMediaWidget) in the widget sandbox, `?widgets=1`: widget-sandbox v0.6.3's engine, validator and
// renderer, fed from the fixtures (its corpus, its attack corpus and its conformance set) — no account, no server. What
// users get in every engine is the `worker` transport: every widget's QuickJS in the page's engine worker, each in a
// copy of an engine warmed once, drawing on a shadow root in the page, whose layout queries the widget's code waits for
// (JSPI, or the asyncify build in Firefox). The sandbox lists what widgets ask the client for instead of doing it, and
// keeps their Web Storage in memory as a message keeps it on disk.

// the widget on screen: one starting again waits hidden beside it (staging.ts) until it has drawn
const SHADOW = 'tweb-widget-slot .widget-shadow';
const FRAME = 'iframe.widget-frame';
// where the attack corpus aims on this suite's servers (playwright.popups.config.ts)
const CANARY = `http://127.0.0.1:${e2ePort('widgetCanary')}`;
// a widget's first draw: the first one of a page waits for the engine worker's snapshot
const FIRST_DRAW = {timeout: 20_000};

// One worker per engine for this file: the attack corpus runs a hundred widgets on one page. The first test of a worker
// boots the client from a cold dev server, longer than the config's minute on a busy machine.
test.describe.configure({mode: 'default', timeout: 120_000});

/** The sandbox on `fixture`, in the `one` view, on the transport users get (`isolate`: a page `sab` can run on). */
async function open(page: Page, fixture: string, view: 'one' | 'all' = 'one', isolate = false) {
  await page.setViewportSize({width: 1000, height: 900});
  await page.goto('/?widgets=1' + (isolate ? '&isolate=1' : '') + '#' + encodeURIComponent(fixture));
  await page.getByRole('complementary', {name: 'Widget sandbox'}).waitFor();
  await page.evaluate(async(view) => {
    // solid's render() out of modules the bundle has (window.e2eImport): the element is in `parent` before its effects run
    const [{wrapSolidComponent, unwrapSolidElement}, {getMiddleware}] = await Promise.all([
      window.e2eImport('/src/helpers/solid/wrapSolidComponent.ts'),
      window.e2eImport('/src/helpers/middleware.ts')
    ]);
    window.e2eRender = (component, parent) => {
      const helper = getMiddleware();
      wrapSolidComponent(() => {
        const element = unwrapSolidElement(component());
        parent.append(element);
        return element;
      }, helper.get());
      return () => {
        helper.destroy();
        parent.textContent = '';
      };
    };
    window.e2eScrollable = (scroller) => ({
      container: scroller,
      get scrollPosition() {
        return scroller.scrollTop;
      },
      setScrollPositionSilently: (value) => scroller.scrollTop = value
    });
    window.e2eChat = () => {
      const container = document.createElement('div');
      container.style.cssText = 'position:fixed;top:0;left:0;width:440px;height:700px;overflow:hidden;z-index:1000000;';
      const scrollable = document.createElement('div');
      scrollable.style.cssText = 'position:absolute;inset:0;overflow-y:auto;';
      const chatInner = document.createElement('div');
      chatInner.className = 'bubbles-inner';
      scrollable.append(chatInner);
      container.append(scrollable);
      document.body.append(container);
      const chat = {bubbles: {container, scrollable: {container: scrollable, scrollPosition: 0, setScrollPositionSilently() {}}, chatInner}, animationGroup: ''};
      const bubble = document.createElement('div');
      bubble.className = 'bubble widget-message is-full-width is-in';
      const attachment = document.createElement('div');
      attachment.className = 'attachment';
      bubble.append(attachment);
      return {chat, container, chatInner, bubble, attachment};
    };
    window.e2eRunUntilDead = async(html, around) => {
      const {loadWidgetRuntime} = await window.e2eImport('/src/lib/widgetSandbox/runtime.ts');
      const runtime = await loadWidgetRuntime();
      const engine = await runtime.prepare('worker');
      const container = document.createElement('div');
      document.body.append(container);
      let reason = '';
      const after = around?.();
      const host = runtime.createHost(container, html, {
        theme: {colorScheme: 'light'}, renderer: 'shadow', transport: 'worker', engine, visible: true,
        onDead: (text: string) => reason = text
      });
      // 10 s: a widget's first task under the full suite's load can take seconds before what it tests even runs
      for(let i = 0; i < 200 && !reason; i++) await new Promise((resolve) => setTimeout(resolve, 50));
      after?.();
      host.destroy();
      container.remove();
      return reason;
    };
    const api = await window.widgetSandbox();
    api.setRenderer('iframe');
    api.setTransport('auto');
    await api.setView(view);
  }, view);
}

/** Every widget the filter leaves, in one column (`all`); each one starts as it enters the page, like a bubble. */
async function showAll(page: Page, filter: string) {
  await page.getByPlaceholder('Filter widgets…').fill(filter);
  await page.evaluate(async() => (await window.widgetSandbox()).setView('all'));
}

async function heightOf(page: Page, selector: string) {
  return page.locator(selector).evaluate((element: HTMLElement) => parseFloat(element.style.height) || 0);
}

const actions = (page: Page) => page.evaluate(async() => (await window.widgetSandbox()).actions());

test('runs in the engine worker and draws on a shadow root in the page', async({page}) => {
  await open(page, 'compat/calculator');
  expect(await page.evaluate(async() => (await window.widgetSandbox()).getTransport())).toBe('worker');
  await expect.poll(() => heightOf(page, SHADOW), FIRST_DRAW).toBeGreaterThan(60);
  await expect(page.locator(FRAME)).toHaveCount(0);
  await expect(page.locator(SHADOW)).toHaveAttribute('aria-label', 'Interactive widget');
  for(const key of ['7', '+', '8', '=']) await page.locator(SHADOW).getByRole('button', {name: key, exact: true}).click();
  await expect(page.locator(SHADOW).locator('#display')).toHaveText('15');
});

/**
 * What the chat does with a widget's bubble: builds it (the widget prepares and runs its first task in a hidden copy of
 * the bubble, staging.ts), waits for its media, puts it in. The widget's state at that moment and a second later.
 */
async function enterBubble(page: Page, source: {fixture?: string, html?: string}) {
  return page.evaluate(async({fixture, html: given}) => {
    const [{default: WidgetBlock}, fixtures] = await Promise.all([
      window.e2eImport('/src/components/widgetSandbox/widgetBlock.tsx'),
      window.e2eImport('/src/lib/widgetSandbox/fixtures.ts')
    ]);
    const html = given ?? await fixtures.loadWidgetFixture(fixture);
    const {chat, container, chatInner, bubble, attachment} = window.e2eChat();
    const loadPromises: Promise<unknown>[] = [];
    const dispose = window.e2eRender(() => WidgetBlock({html, widgetKey: 'e2e:enter:' + (fixture ?? html.length), chat, loadPromises}), attachment);
    // the chat: the bubble's media first, then the bubble in
    await Promise.all(loadPromises);
    const group = document.createElement('div');
    group.className = 'bubbles-group';
    group.append(bubble);
    chatInner.append(group);
    const host = bubble.querySelector<HTMLElement>('.widget-shadow');
    const atEntry = {
      height: attachment.offsetHeight,
      nodes: host?.shadowRoot.querySelectorAll('body *').length ?? 0,
      waiting: !!bubble.querySelector('[aria-busy="true"]'),
      width: host?.offsetWidth ?? 0,
      staged: container.querySelectorAll('[aria-hidden="true"] .widget-shadow').length,
      text: host?.shadowRoot.querySelector('#out')?.textContent ?? ''
    };
    await new Promise((resolve) => setTimeout(resolve, 1000));
    const later = {height: attachment.offsetHeight, width: host?.offsetWidth ?? 0};
    dispose();
    container.remove();
    return {atEntry, later};
  }, source);
}

test('enters its bubble drawn and at its height: the first task runs in a copy of the bubble while the chat waits', async({page}) => {
  await open(page, 'compat/calculator');
  const entered = await enterBubble(page, {fixture: 'showcase/work/02-kanban'});
  expect(entered.atEntry.nodes).toBeGreaterThan(10);
  expect(entered.atEntry.waiting).toBe(false);
  expect(entered.atEntry.staged).toBe(0);
  expect(entered.atEntry.height).toBeGreaterThan(100);
  expect(entered.later).toEqual({height: entered.atEntry.height, width: entered.atEntry.width});
});

test('hit-tests its own elements in its first task, while it runs out of sight', async({page}) => {
  await open(page, 'compat/calculator');
  const entered = await enterBubble(page, {html: `<div style="height:90px">above</div><div id="target" style="height:60px">target</div><p id="out"></p>
    <script>
      const r = document.getElementById('target').getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + 5, r.top + 5);
      document.getElementById('out').textContent = hit ? hit.id : 'nothing';
    </script>`});
  expect(entered.atEntry.text).toBe('target');
});

test('a layout query is answered by the page while the widget\'s code waits, synchronously as it sees it', async({page}) => {
  await open(page, 'compat/calculator');
  const logs = await page.evaluate(async() => {
    const {loadWidgetRuntime} = await window.e2eImport('/src/lib/widgetSandbox/runtime.ts');
    const runtime = await loadWidgetRuntime();
    const container = document.createElement('div');
    container.style.width = '345px';
    document.body.append(container);
    const lines: string[] = [];
    // deep in a recursion, so a whole stack waits; then many in a row
    const host = runtime.createHost(container, `<style>body{margin:0}</style><div id="box" style="width:50%;height:20px"></div><script>
      const box = document.getElementById('box');
      const deep = (n) => n ? deep(n - 1) : box.getBoundingClientRect().width;
      console.log('deep ' + deep(200));
      let sum = 0;
      for(let i = 0; i < 50; i++) { box.style.width = (i + 1) + 'px'; sum += box.offsetWidth; }
      console.log('sum ' + sum);
    </script>`, {
      theme: {colorScheme: 'light'}, renderer: 'shadow', transport: 'worker', engine: await runtime.prepare('worker'), visible: true,
      onLog: (_level: string, text: string) => lines.push(text)
    });
    for(let i = 0; i < 100 && lines.length < 2; i++) await new Promise((resolve) => setTimeout(resolve, 100));
    host.destroy();
    container.remove();
    return lines;
  });
  expect(logs).toEqual(['deep 172.5', 'sum ' + (50 * 51 / 2)]);
});

/**
 * A widget started on the transport users get, straight through the runtime, at `position` (fixed, CSS) and 300 px
 * wide; resolves with what it has logged once that is `count` lines (or after 10 s). What it logs later is in
 * `widgetLogs`, its shadow root's host is `#e2e-widget .widget-shadow`.
 */
async function runWidget(page: Page, html: string, count: number, position = 'left:0;top:0', options: {bubbleGestures?: boolean} = {}) {
  await page.evaluate(async({html, position, options}) => {
    const {loadWidgetRuntime} = await window.e2eImport('/src/lib/widgetSandbox/runtime.ts');
    const runtime = await loadWidgetRuntime();
    const container = document.createElement('div');
    container.id = 'e2e-widget';
    container.style.cssText = `position:fixed;${position};width:300px;z-index:2000000;background:#fff`;
    document.body.append(container);
    const lines: string[] = (window as any).__e2eLogs = [];
    const host = runtime.createHost(container, html, {
      theme: {colorScheme: 'light'}, renderer: 'shadow', transport: 'worker', engine: await runtime.prepare('worker'), visible: true,
      onLog: (_level: string, text: string) => lines.push(text),
      ...options
    });
    // what the page dispatched of the widget's animation events, listened for by the widget or not
    const seen: string[] = (window as any).__e2eAnimationEvents = [];
    host.element.shadowRoot.addEventListener('animationend', (e: AnimationEvent) => seen.push(e.animationName), true);
  }, {html, position, options});
  await expect.poll(() => widgetLogs(page).then((lines) => lines.length), {timeout: 10_000}).toBeGreaterThanOrEqual(count);
  return widgetLogs(page);
}

const widgetLogs = (page: Page) => page.evaluate(() => [...(window as any).__e2eLogs] as string[]);

/** The centre of the widget's element `selector`, in the page. */
const centreOf = (page: Page, selector: string) => page.evaluate((selector) => {
  const r = document.querySelector('#e2e-widget .widget-shadow').shadowRoot.querySelector(selector).getBoundingClientRect();
  return {x: r.x + r.width / 2, y: r.y + r.height / 2};
}, selector);

test('has what the conformance set found missing: live collections, shorthands, a seek seen by layout at once, animation events', async({page}) => {
  await open(page, 'compat/calculator');
  const logs = await runWidget(page, `<style>body{margin:0}#m{margin:4px 0;white-space:nowrap;overflow:hidden}
    @keyframes short{from{opacity:0}to{opacity:1}}#a{animation:short .1s}#t{transition:opacity .1s}</style>
    <div id="m">m</div><div id="w" style="width:20px;height:10px"></div><div id="a">a</div><div id="t">t</div><script>
      const live = document.getElementsByClassName('x');
      const before = live.length;
      const item = document.createElement('i');
      item.className = 'x';
      document.body.append(item);
      console.log('live ' + before + ' → ' + live.length);
      const cs = getComputedStyle(document.getElementById('m'));
      console.log('shorthands ' + cs.margin + ' / ' + cs.whiteSpace + ' / ' + cs.overflow);
      const seek = document.getElementById('w').animate([{width: '20px'}, {width: '120px'}], {duration: 1000, fill: 'forwards'});
      seek.pause();
      seek.currentTime = 250;
      console.log('seek ' + document.getElementById('w').getBoundingClientRect().width);
      document.getElementById('a').addEventListener('animationend', (e) => console.log('animationend ' + e.animationName + ' ' + e.elapsedTime.toFixed(1)));
      const t = document.getElementById('t');
      t.addEventListener('transitionend', (e) => console.log('transitionend ' + e.propertyName));
      requestAnimationFrame(() => requestAnimationFrame(() => t.style.opacity = '0.5'));
    </script>`, 5);
  expect(logs.slice(0, 3)).toEqual(['live 0 → 1', 'shorthands 4px 0px / nowrap / hidden', 'seek 45']);
  expect(logs.slice(3).sort()).toEqual(['animationend short 0.1', 'transitionend opacity']);
});

test('an animation event that came before the widget listened for it reaches no listener a later task adds', async({page}) => {
  await open(page, 'compat/calculator');
  await runWidget(page, `<style>@keyframes short{from{opacity:0}to{opacity:1}}#a{animation:short .1s}</style><div id="a">a</div>
    <script>
      console.log('started');
      setTimeout(() => {
        document.getElementById('a').addEventListener('animationend', () => console.log('animationend'));
        console.log('listening');
      }, 400);
    </script>`, 2);
  await page.waitForTimeout(500);
  expect(await widgetLogs(page)).toEqual(['started', 'listening']);
});

test('an animation event that came before a later task began reaches none of its listeners, after a layout question too', async({page}) => {
  await open(page, 'compat/calculator');
  // the task that listens, a press once the page has dispatched the animation's end (WebKit may draw the widget's first
  // frame later than a timer of the widget's would fire), asks a layout question first, with no change to the page since
  await runWidget(page, `<style>@keyframes short{from{color:red}to{color:blue}}#a{animation:short .05s;height:40px}</style><div id="a">a</div>
    <script>
      console.log('started');
      document.addEventListener('pointerdown', () => {
        const a = document.getElementById('a');
        a.offsetWidth;
        a.addEventListener('animationend', () => console.log('animationend'));
        console.log('listening');
      });
    </script>`, 1);
  await expect.poll(() => page.evaluate(() => (window as any).__e2eAnimationEvents)).toEqual(['short']);
  const centre = await centreOf(page, '#a');
  await page.mouse.click(centre.x, centre.y);
  await expect.poll(() => widgetLogs(page)).toEqual(['started', 'listening']);
  await page.waitForTimeout(500);
  expect(await widgetLogs(page)).toEqual(['started', 'listening']);
});

test('an animation event a later task waits for still comes after many no one listened for', async({page}) => {
  await open(page, 'compat/calculator');
  // forty animations no one listens for (eighty events) fill what the renderer keeps; a second and a half later a task
  // starts one, asks a layout question, and listens only after its event came (colour: no heavy box)
  await runWidget(page, `<style>@keyframes k{from{color:red}to{color:blue}}.x{animation:k .05s}.y{animation:k 5s}</style>
    ${'<div class="x">x</div>'.repeat(40)}
    <script>
      console.log('started');
      setTimeout(() => {
        const el = document.createElement('div');
        el.className = 'y';
        document.body.append(el);
        el.offsetWidth;
        const t = performance.now();
        while(performance.now() - t < 150) {}
        el.addEventListener('animationstart', () => console.log('animationstart'));
      }, 1500);
    </script>`, 1);
  await expect.poll(() => widgetLogs(page), {timeout: 10_000}).toEqual(['started', 'animationstart']);
});

test('a preview takes no input in the renderer\'s frame either', async({page}) => {
  await open(page, 'compat/calculator');
  await page.evaluate(async() => {
    const {loadWidgetRuntime} = await window.e2eImport('/src/lib/widgetSandbox/runtime.ts');
    const runtime = await loadWidgetRuntime();
    const logs: Record<string, string[]> = (window as any).__e2eFrameLogs = {preview: [], message: []};
    (['preview', 'message'] as const).forEach((kind, i) => {
      const container = document.createElement('div');
      container.id = 'e2e-frame-' + kind;
      container.style.cssText = `position:fixed;left:${i * 320}px;top:0;width:300px;z-index:2000000;background:#fff`;
      document.body.append(container);
      runtime.createHost(container, `<style>body{margin:0}button{display:block;width:100%;height:100px}</style><button id="b">tap</button>
        <script>document.getElementById('b').addEventListener('click', () => console.log('clicked')); console.log('ready');</script>`, {
        theme: {colorScheme: 'light'}, transport: 'frame', visible: true, context: {preview: kind === 'preview'},
        onLog: (_level: string, text: string) => logs[kind].push(text)
      });
    });
  });
  const logs = () => page.evaluate(() => (window as any).__e2eFrameLogs as Record<string, string[]>);
  await expect.poll(async() => Object.values(await logs()).flat().length, FIRST_DRAW).toBe(2);
  for(const kind of ['preview', 'message']) {
    const box = await page.locator(`#e2e-frame-${kind} iframe`).boundingBox();
    await page.mouse.click(box.x + box.width / 2, box.y + 30);
  }
  await expect.poll(async() => (await logs()).message).toEqual(['ready', 'clicked']);
  expect((await logs()).preview).toEqual(['ready']);
});

test('live collections follow what widget code changes among the steps of a textContent write', async({page}) => {
  await open(page, 'compat/calculator');
  // each element's replaceChildren, which the write calls (no lone text node it writes in place), is the widget's own:
  // what it does there is the widget's; each collection is read there first, then after the write beside a fresh query
  // (#d's in the override too, as soon as its child goes); where the widget holds an element's lone text node, the write
  // replaces it with one replaceChild, with a node of document.createTextNode: each the widget's own for #e and #f; #g's
  // first <b> has a getter for its `remove`, which takes it out and reads the collection
  const logs = await runWidget(page, `<div id="a"><p>p</p></div><div id="b">t<!--c--></div><div id="c">t<!--c--></div><span id="s"></span>
    <div id="d"><p>p</p></div><div id="e">t</div><div id="f">t</div><div id="g"><b>1</b><b>2</b></div>
    <script>
      var a = document.getElementById('a'), b = document.getElementById('b'), c = document.getElementById('c');
      var ps = document.getElementsByTagName('p'), is = document.getElementsByTagName('i'), marked = document.getElementsByClassName('marked');
      a.replaceChildren = function() { ps.length; a.firstElementChild.remove(); };
      b.replaceChildren = function() { is.length; b.appendChild(document.createElement('i')); };
      c.replaceChildren = function() { marked.length; document.getElementById('s').className = 'marked'; };
      var d = document.getElementById('d'), dps = d.getElementsByTagName('p'), inside = '';
      d.replaceChildren = function() { inside = dps.length; this.firstChild.remove(); inside += '>' + dps.length; };
      a.textContent = 'x';
      var seen = [ps.length + '/' + document.querySelectorAll('p').length];
      b.textContent = 'x';
      seen.push(is.length + '/' + document.querySelectorAll('i').length);
      c.textContent = 'x';
      seen.push(marked.length + '/' + document.querySelectorAll('.marked').length);
      d.textContent = 'x';
      seen.push(inside);
      // a paragraph in for a moment, among the steps
      var aside = function(el, list) { el.appendChild(document.createElement('p')); var n = list.length; el.lastChild.remove(); return n + '>' + list.length; };
      var e = document.getElementById('e'), eps = e.getElementsByTagName('p'), heldE = e.firstChild, inE = '';
      var replaceChild = e.replaceChild;
      e.replaceChild = function(node, old) { inE = aside(e, eps); return replaceChild.call(e, node, old); };
      e.textContent = 'x';
      seen.push(inE);
      var f = document.getElementById('f'), fps = f.getElementsByTagName('p'), heldF = f.firstChild, inF = '';
      var createTextNode = document.createTextNode;
      document.createTextNode = function(text) { inF = aside(f, fps); return createTextNode.call(document, text); };
      f.textContent = 'x';
      document.createTextNode = createTextNode;
      seen.push(inF);
      var g = document.getElementById('g'), gps = g.getElementsByTagName('b'), gFirst = g.firstElementChild, gRemove = gFirst.remove, inG = '';
      Object.defineProperty(gFirst, 'remove', {configurable: true, get: function() {
        if(gFirst.parentNode) { gRemove.call(gFirst); inG = gps.length; }
        return gRemove;
      }});
      g.textContent = 'done';
      seen.push(inG + '>' + gps.length);
      console.log(seen.join(' '));
    </script>`, 1);
  // (#d's paragraph is still in the document at the first count)
  expect(logs).toEqual(['1/1 1/1 1/1 1>0 1>0 1>0 1>0']);
});

test('draws a canvas from another one drawn in the same task, whatever was drawn first, and in turn', async({page}) => {
  await open(page, 'compat/calculator');
  await runWidget(page, `<canvas id="c" width="40" height="40"></canvas><canvas id="p" width="20" height="20"></canvas><canvas id="q" width="20" height="20"></canvas><script>
    const c = document.getElementById('c').getContext('2d');
    c.fillStyle = '#00f';
    c.fillRect(0, 0, 5, 5);
    const offscreen = document.createElement('canvas');
    offscreen.width = offscreen.height = 20;
    const o = offscreen.getContext('2d');
    o.fillStyle = '#f00';
    o.fillRect(0, 0, 20, 20);
    c.drawImage(offscreen, 10, 10);
    // from each other in turn: p green, q from p, p blue, then p from q (q stays green, and so does p)
    const p = document.getElementById('p').getContext('2d'), q = document.getElementById('q').getContext('2d');
    p.fillStyle = '#0f0';
    p.fillRect(0, 0, 20, 20);
    q.drawImage(p.canvas, 0, 0);
    p.fillStyle = '#00f';
    p.fillRect(0, 0, 20, 20);
    p.drawImage(q.canvas, 0, 0);
    console.log('drawn');
  </script>`, 1);
  const pixel = (id: string, at: number) => page.evaluate(({id, at}) => {
    const canvas = document.querySelector('#e2e-widget .widget-shadow').shadowRoot.querySelector<HTMLCanvasElement>('#' + id);
    return [...canvas.getContext('2d').getImageData(at, at, 1, 1).data];
  }, {id, at});
  await expect.poll(() => pixel('c', 20)).toEqual([255, 0, 0, 255]);
  await expect.poll(() => pixel('q', 10)).toEqual([0, 255, 0, 255]);
  await expect.poll(() => pixel('p', 10)).toEqual([0, 255, 0, 255]);
});

test('a drag keeps its pointer past the element, and a move a frame carries the movement of those it replaced', async({page}) => {
  await open(page, 'compat/calculator');
  await runWidget(page, `<style>body{margin:0}#k{position:absolute;left:0;top:0;width:40px;height:40px;background:#36c;touch-action:none}</style>
    <div style="position:relative;width:100px;height:40px"><div id="k"></div></div><script>
      const k = document.getElementById('k');
      let x0 = null, moved = 0, beyond = false;
      k.addEventListener('pointerdown', (e) => { x0 = e.clientX; moved = 0; beyond = false; k.setPointerCapture(e.pointerId); e.preventDefault(); });
      k.addEventListener('pointermove', (e) => { if (x0 === null) return; moved += e.movementX; if (e.clientX > 150) beyond = true; });
      k.addEventListener('pointerup', (e) => { console.log('moved ' + Math.round(moved) + ' of ' + Math.round(e.clientX - x0) + ', past the element ' + beyond); x0 = null; });
      console.log('ready');
    </script>`, 1, 'left:100px;top:100px');
  const knob = await centreOf(page, '#k');
  await page.mouse.move(knob.x, knob.y);
  await page.mouse.down();
  // at a hand's pace while the capture comes (a round trip after the press), then many moves in a frame
  for(let i = 1; i <= 5; i++) {
    await page.mouse.move(knob.x + i * 10, knob.y);
    await page.waitForTimeout(32);
  }
  await page.mouse.move(knob.x + 200, knob.y, {steps: 15});
  await page.mouse.up();
  await expect.poll(() => widgetLogs(page)).toEqual(['ready', 'moved 200 of 200, past the element true']);
});

test(':active applies while the widget is pressed, in every engine', async({page}) => {
  await open(page, 'compat/calculator');
  await runWidget(page, `<style>#b{width:80px;height:40px;background:#ccc}#b:active{background:#f00}</style><div id="b"></div>
    <script>console.log('ready')</script>`, 1);
  const button = await centreOf(page, '#b');
  const colour = () => page.evaluate(() => getComputedStyle(document.querySelector('#e2e-widget .widget-shadow').shadowRoot.querySelector('#b')).backgroundColor);
  await page.mouse.move(button.x, button.y);
  await page.mouse.down();
  await expect.poll(colour).toBe('rgb(255, 0, 0)');
  await page.mouse.up();
  await expect.poll(colour).toBe('rgb(204, 204, 204)');
});

/** The widget's conformance state (its data-conformance attribute). */
const readConformance = (page: Page) => page.locator(SHADOW).first().evaluate((host) => JSON.parse(host.shadowRoot.querySelector('[data-conformance]')?.getAttribute('data-conformance') || 'null'));

/** Clicks the conformance case's target `name`. */
async function clickTarget(page: Page, name: string) {
  const box = await page.locator(SHADOW).first().boundingBox();
  const [x, y, w, h] = (await readConformance(page)).targets[name];
  await page.mouse.click(box.x + x + w / 2, box.y + y + h / 2);
}

const passed = (...ids: string[]) => ids.map((id) => id + ' pass');
/** auto/23-gestures-a: holds on none and auto, double taps on none and auto. */
const PASSED_A = passed('input.long-press', 'behaviour.gesture-claim', 'input.dblclick', 'input.dblclick');
/** auto/23-gestures-b: vertical drags on none and pan-x, drags from the leading strip and from further in. */
const PASSED_B = passed('behaviour.gesture-claim', 'behaviour.gesture-claim', 'behaviour.gesture-claim', 'behaviour.gesture-claim');

/** conformance/auto/23-gestures-a or -b, waiting for its presses; its targets' centres in the page, by name. */
async function openGestures(page: Page, part: 'a' | 'b') {
  await open(page, 'conformance/auto/23-gestures-' + part);
  const read = () => readConformance(page);
  await expect.poll(async() => (await read())?.status, FIRST_DRAW).toBe('awaiting');
  const box = await page.locator(SHADOW).first().boundingBox();
  const {targets} = await read();
  const at = (name: string, dx = 0) => {
    const [x, y, w, h] = targets[name];
    return {x: box.x + x + w / 2 + dx, y: box.y + y + h / 2};
  };
  // what gets past the widget to the bubble around it
  await page.evaluate(() => {
    const seen: string[] = (window as any).__pastWidget = [];
    const block = document.querySelector('section[data-story-id]');
    for(const type of ['dblclick', 'contextmenu']) block.addEventListener(type, (e) => seen.push(type + (e.defaultPrevented ? ' prevented' : '')));
  });
  // its checks in order, by what they cover
  const checks = async() => ((await read())?.checks || []).map((check: string[]) => check[0] + ' ' + check[2]);
  return {at, checks, pastWidget: () => page.evaluate(() => (window as any).__pastWidget as string[])};
}

/** A mouse drag from `from` by (dx, dy), at a hand's pace: the renderer forwards a move a frame, and the widget counts them. */
async function mouseDrag(page: Page, from: {x: number, y: number}, dx: number, dy: number) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  for(let i = 1; i <= 10; i++) {
    await page.mouse.move(from.x + i * dx / 10, from.y + i * dy / 10);
    await page.waitForTimeout(16);
  }
  await page.mouse.up();
}

test('a mouse\'s presses are the widget\'s, a double click never reaches the bubble, a right click is the bubble\'s unless claimed', async({page}) => {
  let {at, checks, pastWidget} = await openGestures(page, 'a');
  for(const target of ['none', 'auto']) {
    await page.mouse.move(at(target).x, at(target).y);
    await page.mouse.down();
    await page.waitForTimeout(700);
    await page.mouse.up();
  }

  await page.mouse.dblclick(at('nonedbl').x, at('nonedbl').y);
  await page.mouse.dblclick(at('autodbl').x, at('autodbl').y);
  await page.mouse.click(at('finish').x, at('finish').y);
  await expect.poll(checks).toEqual(PASSED_A);
  expect(await pastWidget()).toEqual([]);

  // the bubble's menu (the browser's own never) — and on `touch-action: none` the widget's contextmenu, nothing past it
  await page.mouse.click(at('auto').x, at('auto').y, {button: 'right'});
  await page.mouse.click(at('none').x, at('none').y, {button: 'right'});
  await expect.poll(() => pastWidget()).toEqual(['contextmenu prevented']);
  await expect.poll(() => actions(page)).toEqual(['bubble: menu (menu-click)']);

  // every drag of a mouse is the widget's, vertical ones and those from the leading strip too (a vertical one past
  // the slop, released on its element: a mouse's pointerup goes to what is under it)
  ({at, checks, pastWidget} = await openGestures(page, 'b'));
  await mouseDrag(page, at('vnone'), 0, 15);
  await mouseDrag(page, at('vpanx'), 0, 15);
  await mouseDrag(page, at('edge'), 120, 0);
  await mouseDrag(page, at('mid'), 120, 0);
  await page.mouse.click(at('finish').x, at('finish').y);
  await expect.poll(checks).toEqual(PASSED_B);
  expect(await pastWidget()).toEqual([]);
});

test('a vertical pan stays the page\'s over touch-action: none, also in a style sheet of a widget that moved in from where it started', async({page}) => {
  // the widget runs its first task in a copy of its bubble and moves into its place: a moved <style> is parsed again
  await open(page, 'conformance/auto/23-gestures-b');
  await expect.poll(async() => (await readConformance(page))?.status, FIRST_DRAW).toBe('awaiting');
  const styles = await page.locator(SHADOW).first().evaluate((host) => ['vnone', 'vpanx', 'pad'].map((id) => {
    const cs = getComputedStyle(host.shadowRoot.getElementById(id));
    return `${id}: ${cs.touchAction} (${cs.getPropertyValue('--tw-touch-action').trim()})`;
  }));
  expect(styles).toEqual(['vnone: pan-y (none)', 'vpanx: pan-x pan-y (pan-x)', 'pad: pan-y (none)']);
});

test('a press the bubble took is over for the widget, and the pointer\'s next press is the widget\'s, released outside or not', async({page}) => {
  await open(page, 'compat/calculator');
  await runWidget(page, `<div id="a" style="width:120px;height:40px;background:#ccc"></div><script>
    const a = document.getElementById('a');
    for (const type of ['pointerdown', 'pointerup', 'pointercancel', 'click']) a.addEventListener(type, () => console.log(type));
    console.log('ready');
  </script>`, 1, 'left:100px;top:100px', {bubbleGestures: true});
  const a = await centreOf(page, '#a');
  // a right click on touch-action: auto is the bubble's menu: the widget's press ends with pointercancel
  await page.mouse.move(a.x, a.y);
  await page.mouse.down({button: 'right'});
  await page.mouse.move(a.x + 400, a.y + 300);
  await page.mouse.up({button: 'right'});
  await page.mouse.click(a.x, a.y);
  await expect.poll(() => widgetLogs(page)).toEqual(['ready', 'pointerdown', 'pointercancel', 'pointerdown', 'pointerup', 'click']);
});

test.describe('chromium: a finger', () => {
  test.skip(({browserName}) => browserName !== 'chromium', 'touch input through CDP');

  test('a hold and a horizontal swipe the widget does not claim are the bubble\'s, a vertical drag always is, and the leading 20 px are back', async({page}) => {
    const cdp = await page.context().newCDPSession(page);
    const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd', x: number, y: number) => cdp.send('Input.dispatchTouchEvent', {type, touchPoints: type === 'touchEnd' ? [] : [{x, y, id: 1}]});
    const tap = async(p: {x: number, y: number}) => {
      await touch('touchStart', p.x, p.y);
      await touch('touchEnd', p.x, p.y);
    };
    const drag = async({x, y}: {x: number, y: number}, dx: number, dy: number) => {
      await touch('touchStart', x, y);
      for(let i = 1; i <= 10; i++) {
        await page.waitForTimeout(16);
        await touch('touchMove', x + i * dx / 10, y + i * dy / 10);
      }
      await touch('touchEnd', x + dx, y + dy);
    };

    let {at, checks, pastWidget} = await openGestures(page, 'a');
    for(const target of ['none', 'auto']) {
      await touch('touchStart', at(target).x, at(target).y);
      await page.waitForTimeout(700);
      await touch('touchEnd', at(target).x, at(target).y);
    }

    for(const target of ['nonedbl', 'autodbl']) {
      await tap(at(target));
      await page.waitForTimeout(80);
      await tap(at(target));
    }

    await tap(at('finish'));
    await expect.poll(checks).toEqual(PASSED_A);
    // the hold on auto was the bubble's; the double taps stayed the widget's
    expect(await actions(page)).toEqual(['bubble: menu (hold)']);
    expect(await pastWidget()).toEqual([]);

    ({at, checks, pastWidget} = await openGestures(page, 'b'));
    await drag(at('vnone'), 0, 60);
    await drag(at('vpanx'), 0, 60);
    await drag(at('edge'), 120, 0);
    await drag(at('mid'), 120, 0);
    await tap(at('finish'));
    await expect.poll(checks).toEqual(PASSED_B);
    // newest first: back from the strip; both vertical drags the chat's scroll
    expect((await actions(page)).slice(0, 3)).toEqual(['bubble: back (drag-x)', 'bubble: scroll (drag-y)', 'bubble: scroll (drag-y)']);
    expect(await pastWidget()).toEqual([]);
  });
});

test('hit-tests its own elements where they are out of the viewport', async({page}) => {
  await open(page, 'compat/calculator');
  const text = await page.evaluate(async() => {
    const {default: WidgetBlock} = await window.e2eImport('/src/components/widgetSandbox/widgetBlock.tsx');
    // below the window's bottom edge, in a column that scrolls (as a bubble below the chat's fold)
    const scroller = document.createElement('div');
    scroller.style.cssText = 'position:fixed;inset:0;overflow-y:auto;z-index:1000000;background:#fff';
    const block = document.createElement('div');
    block.style.cssText = 'margin-top:1500px;width:300px;height:400px';
    scroller.append(block);
    document.body.append(scroller);
    // a later task's: the widget is in its place by then, not in the copy it started in
    const html = `<div style="height:200px">above</div><div id="target" style="height:60px">target</div><p id="out"></p><script>
      setTimeout(() => {
        const r = document.getElementById('target').getBoundingClientRect();
        const hit = document.elementFromPoint(r.left + 5, r.top + 5);
        document.getElementById('out').textContent = 'hit ' + (hit ? hit.id : 'nothing');
      }, 500);
    </script>`;
    const dispose = window.e2eRender(() => WidgetBlock({html, widgetKey: 'e2e:offscreen'}), block);
    let out = '';
    for(let i = 0; i < 100 && !out; i++) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      out = block.querySelector('.widget-shadow')?.shadowRoot.querySelector('#out')?.textContent ?? '';
    }
    dispose();
    scroller.remove();
    return out;
  });
  expect(text).toBe('hit target');
});

test('a widget busy in a loop does not hold the page: its engine is in the worker, and the limit stops it', async({page}) => {
  await open(page, 'compat/calculator');
  const result = await page.evaluate(async() => {
    const {heartbeat} = await window.e2eImport('/src/lib/widgetSandbox/bench.ts');
    let longest = 0;
    // the page's heartbeat while the widget runs (its engine is ready by then), as the bench measures it
    const reason = await window.e2eRunUntilDead('<p>busy</p><script>for(;;) {}</script>', () => {
      const stop = heartbeat();
      return () => longest = stop().maxGap;
    });
    return {reason, longest};
  });
  expect(result.reason).toContain('CPU limit exceeded');
  expect(result.longest).toBeLessThan(200);
});

test('a layout query asked where the widget\'s code cannot wait, as what it threw is read, reaches no page', async({page}) => {
  await open(page, 'compat/calculator');
  const queries = await page.evaluate(async() => {
    const {ShadowDomRenderer} = await window.e2eImport('/src/vendor/widget-sandbox/src/host/shadow-renderer.ts');
    const send = ShadowDomRenderer.prototype.send;
    let count = 0;
    ShadowDomRenderer.prototype.send = function(msg: {type: string}) {
      if(msg.type === 'query') ++count;
      return send.call(this, msg);
    };
    try {
      // the engine reads what was thrown (its toJSON) outside the task, where a query has no answer to wait for
      await window.e2eRunUntilDead(`<p id="p">x</p><script>
        function thrown() {
          return {toJSON: function() {
            var p = document.getElementById('p');
            for(var i = 0; i < 200; i++) { p.style.width = (i % 50) + 'px'; p.offsetWidth; }
            return 'thrown';
          }};
        }
        setTimeout(function() { throw thrown(); }, 50);
        Promise.reject(thrown());
        throw thrown();
      </script>`);
      return count;
    } finally {
      ShadowDomRenderer.prototype.send = send;
    }
  });
  expect(queries).toBe(0);
});

test('a widget\'s clocks start with it in the engine that runs it, a copy of a snapshot taken elsewhere, and keep to the wall clock', async({page}) => {
  await open(page, 'compat/calculator');
  const result = await page.evaluate(async() => {
    const widgetRuntime = await window.e2eImport('/src/lib/widgetSandbox/runtime.ts');
    const {listEngines} = await window.e2eImport('/src/vendor/widget-sandbox/src/host/engine-client.ts');
    const runtime = await widgetRuntime.loadWidgetRuntime();
    // two engine workers: past four widgets the second one runs them, on the first one's snapshot
    await widgetRuntime.applyWidgetEngineOptions({suspend: 'auto', engines: 2});
    const html = `<script>
      var now = performance.now(), event = new Event('x');
      console.log(JSON.stringify({now: now, drift: Date.now() - (performance.timeOrigin + now), stamp: event.timeStamp - now}));
    </script>`;
    const logs: string[][] = [];
    const hosts = [];
    // and one in the page, from the snapshot the snapshot worker took
    for(const transport of ['worker', 'worker', 'worker', 'worker', 'worker', 'worker', 'inline']) {
      const container = document.createElement('div');
      document.body.append(container);
      const lines: string[] = [];
      logs.push(lines);
      hosts.push(runtime.createHost(container, html, {
        theme: {colorScheme: 'light'}, renderer: 'shadow', transport, engine: await runtime.prepare(transport), visible: true,
        onLog: (_level: string, text: string) => lines.push(text)
      }));
    }
    for(let i = 0; i < 200 && logs.some((lines) => !lines.length); i++) await new Promise((resolve) => setTimeout(resolve, 50));
    const engines = listEngines().map((engine: {widgets: number}) => engine.widgets);
    for(const host of hosts) host.destroy();
    await widgetRuntime.applyWidgetEngineOptions();
    return {engines, clocks: logs.map((lines) => lines[0] ? JSON.parse(lines[0]) : null)};
  });
  expect(result.engines.filter((widgets: number) => widgets > 0)).toHaveLength(2);
  for(const clock of result.clocks) {
    expect(clock.now).toBeGreaterThanOrEqual(0);
    expect(Math.abs(clock.drift)).toBeLessThan(20);
    expect(Math.abs(clock.stamp)).toBeLessThan(20);
  }
});

test('a widget past a counted cap stops with the cap as the reason: its validator is in the engine worker, not the host', async({page}) => {
  await open(page, 'compat/calculator');
  // a text value past the 32 K strict allows, a moment after the widget is drawn
  const reason = await page.evaluate(() => window.e2eRunUntilDead(
    '<p id="p">drawn</p><script>setTimeout(function() { document.getElementById("p").textContent = "x".repeat(40000); }, 50);</script>'
  ));
  expect(reason).toMatch(/^Text limit exceeded/);
});

test('a widget past the paint limit stops with the count: the page\'s renderer counts its heavy boxes, the host stops its engine', async({page}) => {
  await open(page, 'compat/calculator');
  const reasons = await page.evaluate(async() => [
    // 17 boxes with a blurred shadow, made heavy by a class a moment after the widget is drawn
    await window.e2eRunUntilDead('<style>.b{width:8px;height:8px}.on .b{box-shadow:0 2px 6px #000}</style><div id="r">' + '<div class="b"></div>'.repeat(17) +
      '</div><script>setTimeout(function() { document.getElementById("r").className = "on"; }, 50);</script>'),
    // three with backdrop-filter at load
    await window.e2eRunUntilDead('<style>.g{height:8px;backdrop-filter:blur(4px)}</style>' + '<div class="g"></div>'.repeat(3))
  ]);
  expect(reasons).toEqual([
    'Paint limit exceeded: 17 boxes with shadows, filters or transparency (max 16)',
    'Paint limit exceeded: 3 boxes with backdrop-filter (max 2)'
  ]);
});

test('the paint count follows the shadow root\'s press marker and what a widget changes later: a held button, an :active rule, a removed sheet, new keyframes', async({page}) => {
  await open(page, 'compat/calculator');
  // a widget run until it stops ('' after 5 s), held down at its #t for a moment if it has one
  const run = async(html: string) => {
    // not awaited here: it runs while the press below happens
    await page.evaluate((html) => {
      (window as any).e2ePaintRun = window.e2eRunUntilDead(html);
    }, html);
    if(html.includes('id="t"')) {
      const target = await (await page.waitForFunction(() => {
        const host = Array.from(document.querySelectorAll('.widget-shadow')).find((el) => el.shadowRoot?.getElementById('t'));
        if(!host) return null;
        // the run's own container, over everything at the page's top left corner
        host.parentElement.style.cssText = 'position: fixed; left: 0; top: 0; width: 300px; z-index: 2147483647; background: #fff';
        const r = host.shadowRoot.getElementById('t').getBoundingClientRect();
        return r.height ? {x: r.x + r.width / 2, y: r.y + r.height / 2} : null;
      })).jsonValue();
      await page.mouse.move(target.x, target.y);
      await page.mouse.down();
      await page.waitForTimeout(600);
      await page.mouse.up();
    }
    return page.evaluate(() => (window as any).e2ePaintRun as Promise<string>);
  };
  const sixteen = '<style>.h{width:8px;height:8px;filter:blur(1px)}</style>' + '<div class="h"></div>'.repeat(16);
  // a pressed button is dimmed by its opacity, which is no heavy effect
  expect(await run(sixteen + '<button id="t">hold</button>')).toBe('');
  // the marker the renderer presses with, written by the widget itself, is no press: 17 buttons dimmed by it are heavy
  expect(await run('<button data-tw-active>b</button>'.repeat(17))).toBe('Paint limit exceeded: 17 boxes with shadows, filters or transparency (max 16)');
  // a press makes `.p` :active, and the box under it that the pointer is not over heavy
  expect(await run(sixteen + '<style>.p:active .q{filter:blur(1px)}</style><div class="p"><span id="t">hold</span><div class="q"></div></div>'))
  .toBe('Paint limit exceeded: 17 boxes with shadows, filters or transparency (max 16)');
  // the sheet that kept 17 boxes plain goes
  expect(await run('<style>.h{width:8px;height:8px;filter:blur(1px)}</style><style id="o">.h{filter:none}</style>' + '<div class="h"></div>'.repeat(17) +
    '<script>setTimeout(function() { document.getElementById("o").remove(); }, 50);</script>'))
  .toBe('Paint limit exceeded: 17 boxes with shadows, filters or transparency (max 16)');
  // a running fade over two frosted boxes turns into a third backdrop-filter
  expect(await run('<style>.g{height:8px;backdrop-filter:blur(4px)}</style><div class="g"></div><div class="g"></div><div id="a" style="height:8px"></div>' +
    '<script>var a = document.getElementById("a").animate([{opacity: 1}, {opacity: 0.5}], {duration: 60000});' +
    'setTimeout(function() { a.effect.setKeyframes([{backdropFilter: "blur(2px)"}, {backdropFilter: "blur(4px)"}]); }, 100);</script>'))
  .toBe('Paint limit exceeded: 3 boxes with backdrop-filter (max 2)');
});

test('the paint count follows a text shown with the client\'s emoji, which stands among its siblings as an element', async({page}) => {
  await open(page, 'compat/calculator');
  const reasons = await page.evaluate(async() => {
    const {isEmojiNative} = await window.e2eImport('/src/lib/richTextProcessor/emojiImage.ts');
    if(isEmojiNative('1f600')) return null;
    const run = window.e2eRunUntilDead;
    // each change half a second in, when the widget has been counted as it was drawn
    return [
      // the emoji text after 17 pairs goes: every .h becomes an even child from the end (at a height of its own, the
      // widget's size, which counts every box again, stays)
      await run('<style>#c{height:300px}.h{width:8px;height:8px}.h:nth-last-child(even){opacity:.5}</style><div id="c">' + '<div class="h"></div><div></div>'.repeat(17) + '😀</div>' +
        '<script>setTimeout(function() { document.getElementById("c").lastChild.remove(); }, 500);</script>'),
      // the text between .a and .h loses its emoji: nothing stands between them any more
      await run('<style>.h{width:8px;height:8px}.a + .h{opacity:.5}</style>' + '<p><i class="a"></i>😀<b class="h"></b></p>'.repeat(17) +
        '<script>setTimeout(function() { document.querySelectorAll("p").forEach(function(p) { p.childNodes[1].data = "x"; }); }, 500);</script>')
    ];
  });
  test.skip(!reasons, 'the platform draws emoji itself');
  expect(reasons).toEqual(new Array(2).fill('Paint limit exceeded: 17 boxes with shadows, filters or transparency (max 16)'));
});

test('the paint count follows the play state the renderer holds while the widget is hidden, and gives back', async({page}) => {
  await open(page, 'compat/calculator');
  const reasons = await page.evaluate(async() => {
    const {loadWidgetRuntime} = await window.e2eImport('/src/lib/widgetSandbox/runtime.ts');
    const runtime = await loadWidgetRuntime();
    const engine = await runtime.prepare('worker');
    // 17 boxes whose own important play state the renderer holds paused while hidden, filtered by a rule on what their
    // style attribute says: `shown` while they run, `hidden` while held; the widget changes nothing itself
    const run = async(filteredWhen: 'running' | 'paused', startVisible: boolean) => {
      const container = document.createElement('div');
      document.body.append(container);
      let reason = '';
      const host = runtime.createHost(container, `<style>@keyframes k{to{color:red}}.h{width:8px;height:8px}.h[style*="${filteredWhen}"]{filter:blur(1px)}</style>` +
        '<div class="h" style="animation:k 1s infinite;animation-play-state:running!important"></div>'.repeat(17), {
        theme: {colorScheme: 'light'}, renderer: 'shadow', transport: 'worker', engine, visible: startVisible,
        onDead: (text: string) => reason = text
      });
      await new Promise((resolve) => setTimeout(resolve, 1000));
      const before = reason;
      host.setVisible(!startVisible);
      for(let i = 0; i < 60 && !reason; i++) await new Promise((resolve) => setTimeout(resolve, 50));
      host.destroy();
      container.remove();
      return [before, reason];
    };
    return [await run('running', false), await run('paused', true)];
  });
  const exceeded = 'Paint limit exceeded: 17 boxes with shadows, filters or transparency (max 16)';
  // shown, the play state given back makes them heavy; hidden, the one held does
  expect(reasons).toEqual([['', exceeded], ['', exceeded]]);
});

test('the paint count follows a press let go outside the widget', async({page}) => {
  await open(page, 'compat/calculator');
  // while #t is held, :active on the body takes the filter off seventeen boxes the press adds; let go outside the widget,
  // they are filtered again
  await page.evaluate((html) => {
    (window as any).e2ePaintRun = window.e2eRunUntilDead(html);
  }, `<style>.h{width:8px;height:8px;filter:blur(1px)}body:active .h{filter:none}</style><div id="t" style="height:40px">hold</div>
    <script>document.getElementById('t').addEventListener('pointerdown', () => {
      for(let i = 0; i < 17; i++) document.body.append(Object.assign(document.createElement('div'), {className: 'h'}));
    });</script>`);
  const target = await (await page.waitForFunction(() => {
    const host = Array.from(document.querySelectorAll('.widget-shadow')).find((el) => el.shadowRoot?.getElementById('t'));
    if(!host) return null;
    host.parentElement.style.cssText = 'position: fixed; left: 0; top: 0; width: 300px; z-index: 2147483647; background: #fff';
    const r = host.shadowRoot.getElementById('t').getBoundingClientRect();
    return r.height ? {x: r.x + r.width / 2, y: r.y + r.height / 2} : null;
  })).jsonValue();
  await page.mouse.move(target.x, target.y);
  await page.mouse.down();
  await page.waitForTimeout(400);
  await page.mouse.move(700, 500, {steps: 5});
  await page.mouse.up();
  expect(await page.evaluate(() => (window as any).e2ePaintRun)).toBe('Paint limit exceeded: 17 boxes with shadows, filters or transparency (max 16)');
});

test('every copy of the engine draws its own random numbers', async({page}) => {
  await open(page, 'compat/calculator');
  const numbers = await page.evaluate(async() => {
    const {loadWidgetRuntime} = await window.e2eImport('/src/lib/widgetSandbox/runtime.ts');
    const runtime = await loadWidgetRuntime();
    const logs: string[] = [];
    const hosts = [];
    // two copies in the engine worker, one in the page
    for(const transport of ['worker', 'worker', 'inline']) {
      const container = document.createElement('div');
      document.body.append(container);
      hosts.push(runtime.createHost(container, '<p>x</p><script>console.log(Math.random())</script>', {
        theme: {colorScheme: 'light'}, renderer: 'shadow', transport, engine: await runtime.prepare(transport), visible: true,
        onLog: (_level: string, text: string) => logs.push(text)
      }));
    }

    for(let i = 0; i < 100 && logs.length < 3; i++) await new Promise((resolve) => setTimeout(resolve, 50));
    for(const host of hosts) host.destroy();
    return logs;
  });
  expect(numbers).toHaveLength(3);
  expect(new Set(numbers).size).toBe(3);
});

test('a link needs a tap on the widget, one per tap, and reaches the client whole', async({page}) => {
  await open(page, 'conformance/sdk/04-link-timer');
  const widget = page.locator(SHADOW);
  await widget.getByRole('button', {name: 'Open from a timer in 1 s'}).click(FIRST_DRAW);
  await page.waitForTimeout(1500);
  expect(await actions(page)).toEqual([]);

  // two calls in one tap's handler: the first goes through
  await widget.getByRole('button', {name: 'Two links in one tap'}).click();
  await expect.poll(() => actions(page)).toEqual(['openLink("https://example.org/conformance/first")']);
  await page.waitForTimeout(500);
  expect(await actions(page)).toHaveLength(1);
  await expect(page.getByRole('complementary', {name: 'Widget sandbox'}).getByText('openLink("https://example.org/conformance/first")')).toBeVisible();
});

test('the widget\'s state, its requests and what it is told follow the kind of message it is in', async({page}) => {
  // each case checks itself against the message it says it is sent as (its header: the flags, the state, the bot's answers)
  const cases: [string, string, boolean][] = [
    ['25-state-api-a', 'private', false],
    ['25-state-api-b', 'private', false],
    ['26-context-private', 'private', true],
    ['26-context-group', 'group', true],
    ['26-context-no-queries', 'no-queries', true],
    ['26-context-live-copy', 'live-copy', true],
    ['26-context-copy', 'copy', true],
    ['26-context-preview', 'preview', false]
  ];
  await open(page, 'compat/calculator');
  for(const [name, kind, tap] of cases) {
    await page.evaluate(async(kind) => (await window.widgetSandbox()).setMessageKind(kind as Parameters<WidgetSandboxApi['setMessageKind']>[0]), kind);
    await page.evaluate(async(name) => (await window.widgetSandbox()).open(name), 'conformance/auto/' + name);
    if(tap) {
      await expect.poll(async() => (await readConformance(page))?.status, FIRST_DRAW).toBe('awaiting');
      await clickTarget(page, 'ask');
    }

    await expect.poll(async() => (await readConformance(page))?.status, FIRST_DRAW).toBe('done');
    const failed = (await readConformance(page)).checks.filter((check: string[]) => !/^(pass|xfail|skip)$/.test(check[2]));
    expect(failed, name).toEqual([]);
  }
});

test('a request on a tap gets the bot\'s answer, one in flight; copyText on a tap reaches the client', async({page}) => {
  await open(page, 'conformance/sdk/19-request-tap');
  const button = (name: string) => page.locator(SHADOW).getByRole('button', {name, exact: true});
  await button('Ping').click();
  await expect(page.locator(SHADOW).getByText('pong, Ann')).toBeVisible();
  await button('Two at once').click();
  await expect(page.locator(SHADOW).getByText('BUSY')).toBeVisible();
  await expect(page.locator(SHADOW).getByText('pong, Ann')).toHaveCount(2);
  // the second of the two never left the widget
  const requests = await page.evaluate(async() => (await window.widgetSandbox()).botRequests());
  expect(requests.map(({data, outcome}) => data + ' → ' + outcome)).toEqual(['conf:19:ping → "pong, Ann"', 'conf:19:ping → "pong, Ann"']);

  await open(page, 'conformance/sdk/22-copy-text');
  await button('Copy').click();
  await expect.poll(() => actions(page)).toContain('copyText("CONF-2026-OK")');
  const toast = page.getByText('Copied: CONF-2026-OK');
  await expect(toast).toBeVisible();
  // over the stage, where a click finds it: not hidden under it while it takes the next click
  expect(await toast.evaluate((element) => {
    const {left, top, width, height} = element.getBoundingClientRect();
    return element.contains(document.elementFromPoint(left + width / 2, top + height / 2));
  })).toBe(true);
});

test('the wallet: a tap asks the bot with the wallet card and pays on its answer, a decline is REJECTED, no wallet asks nothing', async({page}) => {
  const requests = async() => (await page.evaluate(async() => (await window.widgetSandbox()).botRequests()))
  .map(({data, kind, outcome}) => `${kind ?? 'request'} ${data} → ${outcome}`).reverse();
  const widget = page.locator(SHADOW);
  await open(page, 'interactive/05-wallet');
  await widget.getByRole('button', {name: 'Pay'}).first().click();
  // the bot's answer is a transaction, which goes to the wallet with no second tap: the answer granted one call
  await expect(widget.locator('#note')).toHaveText('Paid for Coffee. Thank you!');
  await expect(widget.locator('#paid')).toHaveText('Paid: Coffee');
  expect((await requests())[0]).toMatch(/^wallet pay:0 → "\{\\"tx\\":/);
  expect((await requests())[1]).toMatch(/^sendTransaction paid:0 → "\{\\"paid\\":\\"Coffee\\"/);

  await page.evaluate(async() => (await window.widgetSandbox()).setWalletMode('REJECTED'));
  await widget.getByRole('button', {name: 'Sign the terms'}).click();
  await expect(widget.locator('#note')).toHaveText('You declined in the wallet.');
  expect((await requests())[2]).toBe('signData terms → REJECTED');

  // a user without the wallet: the widget is told so (TelegramWidget.wallet is null) and nothing reaches the bot
  await page.evaluate(async() => (await window.widgetSandbox()).setWalletMode('none'));
  await expect(widget.locator('#note')).toHaveText('No wallet here: pay in the bot.', FIRST_DRAW);
  await widget.getByRole('button', {name: 'Pay'}).first().click();
  await page.waitForTimeout(500);
  expect(await requests()).toHaveLength(3);
});

test('the wallet opens only on a real tap: not on a timer, a scripted click or a background request\'s answer', async({page}) => {
  await open(page, 'attacks/wallet-no-activation');
  // the log shows its last 8 lines: the early ones (the canary's TypeError) may be gone by now; the client's list says
  // what got out
  const log = page.locator(SHADOW).locator('#log');
  await expect(log).toContainText('background-answer:NOT_ALLOWED', FIRST_DRAW);
  await page.evaluate(async() => (await window.widgetSandbox()).setWalletMode('REJECTED'));
  await page.locator(SHADOW).getByRole('button', {name: 'pay once'}).click();
  await expect(log).toContainText('tap:REJECTED');
  const requests = await page.evaluate(async() => (await window.widgetSandbox()).botRequests());
  expect(requests.map(({data, kind}) => (kind ? kind + ':' : '') + data).reverse()).toEqual(['bg', 'sendTransaction:tap']);
});

test('a RegExp recompiled while it deletes runs its new pattern, never the freed one (v0.6.1\'s QuickJS)', async({page}) => {
  // on the engine before the fix the deletion read freed bytecode, and the wasm aborted on this widget
  await open(page, 'attacks/regexp-delete-recompile');
  await expect(page.locator(SHADOW).locator('#p')).toHaveText('aaa|b|0|aa aaa|b|0|aa', FIRST_DRAW);
});

test('a widget dense with scopes compiles and runs with every variable where it belongs (v0.6.2\'s QuickJS)', async({page}) => {
  // a scope the parser failed to enter and still left was read and written below its table: a variable resolved to
  // another's place changes the sum, a corrupted table aborts the wasm
  await open(page, 'attacks/parser-scope-oob');
  await expect(page.locator(SHADOW).locator('#p')).toHaveText('ok|187', FIRST_DRAW);
});

test('markup that runs a hand-made renderer out of memory or time is laid out at once, or stops the widget (v0.6.3\'s render-* attacks)', async({page}) => {
  // the widget's DOM is the browser's to lay out: a var() of 10^9 tokens, repeating gradients of no period, 40 nested
  // flex and 30 nested table boxes and a roman list from 2000000000 must not hold the page, each one drawn and a frame
  // coming after it (a layout of 2^depth passes never ends, and the test with it)
  await open(page, 'attacks/render-var-expansion');
  const widget = (name: string) => page.locator(`section[data-story-id="attacks/render-${name}"]`).locator(SHADOW);
  const nextFrame = () => page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)));
  for(const name of ['var-expansion', 'gradient-zero-period', 'nested-flex', 'nested-table', 'marker-huge-start']) {
    await page.evaluate(async(name) => (await window.widgetSandbox()).open(name), 'attacks/render-' + name);
    await expect(widget(name).locator('#p')).toHaveText('drawn', FIRST_DRAW);
    if(name.startsWith('nested-')) await expect(widget(name).getByText('deep')).toBeVisible();
    await nextFrame();
  }
  // an over-long variable is invalid at computed-value time: the fallback applies, and without one, nothing
  await page.evaluate(async() => (await window.widgetSandbox()).open('attacks/render-var-expansion'));
  const sizes = await widget('var-expansion').locator('#fallback').evaluate((fallback) => [
    getComputedStyle(fallback).width,
    getComputedStyle(fallback.parentElement.querySelector('#unset')).marginLeft
  ]);
  expect(sizes).toEqual(['120px', '0px']);
  // 30 nested grids: WebKit lays a grid in a grid out twice a level (2^30 passes), so the layout budget stops the
  // widget before the page lays them out
  const reason = await page.evaluate(async() => {
    const {loadWidgetFixture} = await window.e2eImport('/src/lib/widgetSandbox/fixtures.ts');
    return window.e2eRunUntilDead(await loadWidgetFixture('attacks/render-nested-grid') as string);
  });
  expect(reason).toMatch(/^Layout limit exceeded: \d+ boxes to lay out afresh, of nested grids$/);
  await nextFrame();
});

test('the layout budget stops a widget before the page lays out the grids it nests later: built by its script, or made grids by a class', async({page}) => {
  await open(page, 'compat/calculator');
  const reasons = await page.evaluate(async() => [
    await window.e2eRunUntilDead('<style>.g{display:grid}</style><p id="p">drawn</p><script>setTimeout(function() {' +
      'var at = document.body; for(var i = 0; i < 30; i++) { var d = document.createElement("div"); d.className = "g"; at.appendChild(d); at = d; }' +
      'at.textContent = "deep"; }, 50);</script>'),
    await window.e2eRunUntilDead('<style>.on div{display:grid}</style><div id="r">' + '<div>'.repeat(30) + 'deep' + '</div>'.repeat(30) + '</div>' +
      '<script>setTimeout(function() { document.getElementById("r").className = "on"; }, 50);</script>'),
    // three grids in one another, with 1400 nodes in the last: nothing a layout cannot do at once
    await window.e2eRunUntilDead('<style>.g{display:grid}</style><div class="g"><div class="g"><div class="g">' + '<i>x</i>'.repeat(700) + '</div></div></div>')
  ]);
  expect(reasons.slice(0, 2)).toEqual([expect.stringMatching(/^Layout limit exceeded/), expect.stringMatching(/^Layout limit exceeded/)]);
  expect(reasons[2]).toBe('');
});

test('a shared widget is polled while it watches its shared state and is in view, and the new value reaches it', async({page}) => {
  await open(page, 'compat/calculator');
  const result = await page.evaluate(async() => {
    const [{default: WidgetBlock}, {createMockWidget}] = await Promise.all([
      window.e2eImport('/src/components/widgetSandbox/widgetBlock.tsx'),
      window.e2eImport('/src/lib/widgetSandbox/mockBot.ts')
    ]);
    const block = document.createElement('div');
    block.style.cssText = 'position:fixed;left:0;top:0;width:300px;z-index:2000000;background:#fff';
    document.body.append(block);
    const html = `<p id="out"></p><button id="stop">stop</button><script>
      const out = document.getElementById('out');
      const show = () => out.textContent = String(TelegramWidget.publicData);
      show();
      TelegramWidget.onEvent('publicDataChanged', show);
      TelegramWidget.watchPublicData();
      document.getElementById('stop').onclick = () => TelegramWidget.unwatchPublicData();
    </script>`;
    // the mock server: the bot edits the shared object, and only a poll brings it to the widget
    const mock = createMockWidget('e2e-poll', html);
    const publicData = mock.publicData();
    const polls: number[] = [];
    const poll = publicData.managers.appWidgetsManager.pollWidgetPublicData;
    publicData.managers = {appWidgetsManager: {pollWidgetPublicData: (...args: any[]) => (polls.push(Date.now()), poll(...args))}};
    mock.editShared('v2');
    const dispose = window.e2eRender(() => WidgetBlock({
      html,
      widgetKey: 'e2e:poll',
      get data() {
        return mock.data();
      },
      publicData
    }), block);
    const text = () => block.querySelector('.widget-shadow')?.shadowRoot.querySelector('#out')?.textContent;
    const until = async(value: string, ms: number) => {
      for(let i = 0; i < ms / 100 && text() !== value; i++) await new Promise((resolve) => setTimeout(resolve, 100));
      return text();
    };
    const shown = performance.now();
    const before = await until('v2', 25_000);
    const first = await until('v2', 10_000);
    const firstAfter = performance.now() - shown;
    mock.editShared('v3');
    const second = await until('v3', 8000);
    block.querySelector('.widget-shadow').shadowRoot.querySelector<HTMLElement>('#stop').click();
    await new Promise((resolve) => setTimeout(resolve, 300));
    const pollsWhenStopped = polls.length;
    mock.editShared('v4');
    await new Promise((resolve) => setTimeout(resolve, 6000));
    const last = text();
    dispose();
    block.remove();
    return {before, first, firstAfter, second, last, gap: polls[1] - polls[0], pollsWhenStopped, pollsAfter: polls.length};
  });
  // after the server's default period (the message came with the state current then), then at the period the server
  // answers with (the sandbox's 5 s); nothing after it stops watching
  expect(result.before).not.toBe('v2');
  expect(result.first).toBe('v2');
  expect(result.firstAfter).toBeGreaterThanOrEqual(29_000);
  expect(result.second).toBe('v3');
  expect(result.gap).toBeGreaterThanOrEqual(4900);
  expect(result.pollsAfter).toBe(result.pollsWhenStopped);
  expect(result.last).toBe('v3');
});

test('while messages are being selected, a press on a widget is its bubble\'s', async({page}) => {
  await open(page, 'compat/calculator');
  const box = await page.evaluate(async() => {
    // a chat whose messages are being selected, as much of it as the widget reads
    const selection = {isSelecting: true, addEventListener: () => {}, removeEventListener: () => {}};
    const {default: WidgetBlock} = await window.e2eImport('/src/components/widgetSandbox/widgetBlock.tsx');
    // the chat's bubbles as they are while messages are being selected
    const bubbles = document.createElement('div');
    bubbles.className = 'bubbles is-selecting';
    bubbles.style.cssText = 'position:fixed;top:0;left:0;width:440px;height:600px;z-index:1000000;background:#fff';
    const bubble = document.createElement('div');
    bubble.className = 'bubble widget-message is-full-width is-in';
    const attachment = document.createElement('div');
    attachment.className = 'attachment';
    bubble.append(attachment);
    bubbles.append(bubble);
    document.body.append(bubbles);
    // a button that takes presses back from the bubble (its own `pointer-events`) is no exception
    const html = '<style>#b{pointer-events:auto}</style><button id="b" style="width:100%;height:120px">press</button>';
    window.e2eRender(() => WidgetBlock({html, widgetKey: 'e2e:selecting', chat: {selection} as any}), attachment);
    for(let i = 0; i < 100 && !attachment.querySelector('tweb-widget-slot .widget-shadow'); i++) await new Promise((resolve) => setTimeout(resolve, 50));
    (window as any).bubblePresses = 0;
    bubble.addEventListener('click', () => ++(window as any).bubblePresses);
    const rect = attachment.querySelector('tweb-widget-slot .widget-shadow').getBoundingClientRect();
    return {x: rect.left + rect.width / 2, y: rect.top + Math.min(rect.height / 2, 60)};
  });
  await page.mouse.click(box.x, box.y);
  expect(await page.evaluate(() => (window as any).bubblePresses)).toBe(1);
});

// a block of the widget's on top of the sandbox, where a pointer reaches it
const ON_TOP = 'position:fixed;top:0;left:0;width:440px;z-index:1000000;background:#fff';

test('text selected in a widget is found for the message menu\'s "Copy selected" in every engine', async({page}) => {
  await open(page, 'compat/calculator');
  const box = await page.evaluate(async({SHADOW, ON_TOP}) => {
    const {default: WidgetBlock} = await window.e2eImport('/src/components/widgetSandbox/widgetBlock.tsx');
    const bubble = document.createElement('div');
    bubble.className = 'bubble';
    bubble.style.cssText = ON_TOP;
    document.body.append(bubble);
    // (WebKit takes the prefixed property only)
    const html = '<p id="t" style="user-select:text;-webkit-user-select:text;font:20px sans-serif;margin:10px">Selectable widget text</p>';
    window.e2eRender(() => WidgetBlock({html, widgetKey: 'e2e:select-text'}), bubble);
    for(let i = 0; i < 100 && !bubble.querySelector(SHADOW); i++) await new Promise((resolve) => setTimeout(resolve, 50));
    await new Promise((resolve) => setTimeout(resolve, 300));
    const rect = bubble.querySelector(SHADOW).shadowRoot.querySelector('#t').getBoundingClientRect();
    return {x: rect.left, y: rect.top + rect.height / 2, width: rect.width};
  }, {SHADOW, ON_TOP});
  // a drag across the text, as a person selects it
  await page.mouse.move(box.x + 2, box.y);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width - 2, box.y, {steps: 10});
  await page.mouse.up();
  const found = await page.evaluate(async() => {
    const {getWidgetSelectedText} = await window.e2eImport('/src/lib/widgetSandbox/selection.ts');
    const bubble = document.querySelector('.bubble');
    const elsewhere = document.createElement('div');
    return {inBubble: getWidgetSelectedText(bubble), elsewhere: getWidgetSelectedText(elsewhere)};
  });
  expect(found.inBubble).toContain('Selectable widget text');
  expect(found.elsewhere).toBe('');
});

test('a jump to a message lands on it while what is above it changes height on the way and after', async({page}) => {
  await open(page, 'compat/calculator');
  const result = await page.evaluate(async() => {
    const {default: fastSmoothScroll} = await window.e2eImport('/src/helpers/fastSmoothScroll.ts');
    const run = async(follow: boolean) => {
      // a chat's column: blocks of 100 px, the one jumped to far below; widgets above it start on the way (and one
      // more after the scroll has arrived), each growing as its content comes
      const container = document.createElement('div');
      container.style.cssText = 'position:fixed;top:0;left:0;width:300px;height:400px;overflow-y:auto;overflow-anchor:none;z-index:2000000;background:#fff';
      const blocks = Array.from({length: 40}, (_, i) => {
        const block = document.createElement('div');
        block.style.cssText = `height:100px;box-sizing:border-box;border-bottom:1px solid #ccc`;
        block.textContent = '' + i;
        container.append(block);
        return block;
      });
      document.body.append(container);
      const target = blocks[30];
      const grow = (i: number, by: number) => blocks[i].style.height = (blocks[i].offsetHeight + by) + 'px';
      const scrolled = fastSmoothScroll({container, element: target, position: 'start', axis: 'y', follow});
      setTimeout(() => [25, 26, 27, 28, 29].forEach((i) => grow(i, 200)), 120);
      await scrolled;
      const landed = target.getBoundingClientRect().top - container.getBoundingClientRect().top;
      grow(29, 150);
      await new Promise((resolve) => setTimeout(resolve, 300));
      const held = target.getBoundingClientRect().top - container.getBoundingClientRect().top;
      container.remove();
      return {landed, held};
    };

    return {followed: await run(true), unfollowed: await run(false)};
  });
  expect(Math.abs(result.followed.landed)).toBeLessThanOrEqual(1);
  expect(Math.abs(result.followed.held)).toBeLessThanOrEqual(1);
  // without following, the same jump stops short of the message
  expect(Math.abs(result.unfollowed.landed)).toBeGreaterThan(100);
});

test('a widget\'s plain button is the client\'s own (docs/sdk-v1.md §2.4): a rich message\'s, in the bubble\'s colours', async({page}) => {
  await open(page, 'compat/calculator');
  const styles = await page.evaluate(async({SHADOW, ON_TOP}) => {
    const {default: WidgetBlock} = await window.e2eImport('/src/components/widgetSandbox/widgetBlock.tsx');
    // an incoming message's bubble in a chat: they give the accent the client's buttons take
    const chat = document.createElement('div');
    chat.className = 'chat';
    // a text size other than the default: the message's text, which a rich message's buttons take
    chat.style.setProperty('--messages-text-size', '20px');
    const bubble = document.createElement('div');
    bubble.className = 'bubble is-in';
    bubble.style.cssText = ON_TOP;
    chat.append(bubble);
    document.body.append(chat);
    window.e2eRender(() => WidgetBlock({html: '<button id="b">Vote</button>', widgetKey: 'e2e:button-tokens'}), bubble);
    let button: HTMLElement;
    for(let i = 0; i < 100 && !(button = bubble.querySelector(SHADOW)?.shadowRoot.querySelector('#b')); i++) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
    // a rich message's button in a row of them, in the same bubble
    const [{getPageButtonClasses, getPageButtonRowClasses}, {default: classNames}] = await Promise.all([
      window.e2eImport('/src/components/instantViewFormatting.ts'),
      window.e2eImport('/src/helpers/string/classNames.ts')
    ]);
    const row = document.createElement('div');
    row.className = classNames(...getPageButtonRowClasses());
    row.style.setProperty('--iv-scale', '1');
    const own = document.createElement('button');
    own.className = classNames(...getPageButtonClasses());
    own.textContent = 'Vote';
    row.append(own);
    bubble.append(row);
    const read = (element: HTMLElement) => {
      const style = getComputedStyle(element);
      return {background: style.backgroundColor, color: style.color, radius: style.borderTopLeftRadius, height: element.offsetHeight, fontSize: style.fontSize};
    };
    return {widget: read(button), own: read(own)};
  }, {SHADOW, ON_TOP});
  // each colour laid over the bubble (white in the day theme), in 0…255: the same however each is written
  const onBubble = (color: string) => {
    const [r, g, b, a] = parseColor(color);
    return [r, g, b].map((v) => 255 * (v * a + 1 - a));
  };
  const same = (a: number[], b: number[]) => a.forEach((v, i) => expect(Math.abs(v - b[i])).toBeLessThanOrEqual(2));
  same(onBubble(styles.widget.color), onBubble(styles.own.color));
  expect(styles.widget.radius).toBe(styles.own.radius);
  expect(styles.widget.height).toBe(styles.own.height);
  expect(styles.widget.fontSize).toBe('20px');
  // an incoming bubble's fill is a shade, not the template's tint
  same(onBubble(styles.widget.background), onBubble(styles.own.background));
  expect(styles.widget.background).not.toBe('rgba(51, 144, 236, 0.12)');
});

test('a widget\'s emoji are the client\'s images, in its text and its canvas, where the platform draws no emoji of its own', async({page}) => {
  await open(page, 'compat/calculator');
  const result = await page.evaluate(async({SHADOW, ON_TOP}) => {
    const {default: WidgetBlock} = await window.e2eImport('/src/components/widgetSandbox/widgetBlock.tsx');
    const {isEmojiNative} = await window.e2eImport('/src/lib/richTextProcessor/emojiImage.ts');
    const host = document.createElement('div');
    host.style.cssText = ON_TOP;
    document.body.append(host);
    const html = `<p id="t" style="font:20px sans-serif">Hi 😀 <b>there</b></p>
      <div id="f" style="display:flex;flex-direction:column;font:20px/24px sans-serif">Hi 😀!</div><p id="u" style="font:20px sans-serif">x</p>
      <canvas id="c" width="200" height="40"></canvas>
      <script>
        const ctx = document.getElementById('c').getContext('2d');
        ctx.font = '20px sans-serif';
        document.getElementById('c').setAttribute('data-w', String(ctx.measureText('a😀').width));
        setTimeout(() => document.getElementById('u').textContent = 'Go 🚀!', 200);
      </script>`;
    window.e2eRender(() => WidgetBlock({html, widgetKey: 'e2e:emoji'}), host);
    let root: ShadowRoot;
    for(let i = 0; i < 100 && !(root = host.querySelector(SHADOW)?.shadowRoot)?.querySelector('#c[data-w]'); i++) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    await new Promise((resolve) => setTimeout(resolve, 600));
    const emoji = (id: string) => [...root.querySelector('#' + id).querySelectorAll('tw-emoji')].map((el) => ({
      text: el.textContent,
      image: getComputedStyle(el).backgroundImage,
      width: el.getBoundingClientRect().width
    }));
    const probe = document.createElement('canvas').getContext('2d');
    probe.font = '20px sans-serif';
    return {
      native: isEmojiNative('1f600'),
      t: {text: root.querySelector('#t').textContent, emoji: emoji('t'), bold: root.querySelector('#t b')?.textContent},
      u: {text: root.querySelector('#u').textContent, emoji: emoji('u')},
      flex: {items: root.querySelector('#f').children.length, height: root.querySelector('#f').getBoundingClientRect().height},
      canvasWidth: +root.querySelector('#c').getAttribute('data-w'),
      expectedCanvasWidth: probe.measureText('a😀').width
    };
  }, {SHADOW, ON_TOP});
  test.skip(result.native, 'the platform draws emoji itself');
  // the text keeps its characters (a copy, the widget's own reads), the emoji shows as the client's image, 1em wide
  expect(result.t.text).toBe('Hi 😀 there');
  expect(result.t.bold).toBe('there');
  expect(result.t.emoji).toHaveLength(1);
  expect(result.t.emoji[0].text).toBe('😀');
  expect(result.t.emoji[0].image).toContain('assets/img/emoji/1f600.png');
  expect(result.t.emoji[0].width).toBeCloseTo(20, 0);
  // a text a flex container lays out stays one item: one line, not a column of its parts
  expect(result.flex.items).toBe(1);
  expect(result.flex.height).toBeLessThan(30);
  // a text the widget changes later, the same
  expect(result.u.text).toBe('Go 🚀!');
  expect(result.u.emoji.map(({image}) => image.includes('1f680.png'))).toEqual([true]);
  // a canvas measures the emoji as the platform does: its image is drawn in the glyph's advance
  expect(result.canvasWidth).toBeCloseTo(result.expectedCanvasWidth, 1);
});

test('a press on the client\'s emoji is one on the widget\'s element, at its offsets there; a drag still selects the text', async({page}) => {
  await open(page, 'compat/calculator');
  // the emoji far into a button, and text the widget makes selectable (WebKit takes the prefixed property only)
  const logs = await runWidget(page, `<style>body{margin:0}</style>
    <button id="b" style="display:block;width:280px;margin:0;padding:0;border:0;font:20px sans-serif;text-align:left">a wide text before 😀 after</button>
    <p id="t" style="user-select:text;-webkit-user-select:text;font:20px sans-serif;margin:10px 0">one 😀 two 🚀 three</p>
    <script>
      document.getElementById('b').addEventListener('click', (e) => console.log('click ' + e.target.id + ' ' + Math.round(e.offsetX) + ' ' + Math.round(e.offsetY)));
      console.log('ready');
    </script>`, 1);
  expect(logs).toEqual(['ready']);
  const box = await page.evaluate(() => {
    const root = document.querySelector('#e2e-widget .widget-shadow').shadowRoot;
    const emoji = root.querySelector('#b tw-emoji');
    if(!emoji) return null;
    const [e, b, t] = [emoji, root.querySelector('#b'), root.querySelector('#t')].map((el) => el.getBoundingClientRect());
    return {x: e.left + e.width / 2, y: e.top + e.height / 2, left: b.left, top: b.top, text: {x: t.left, y: t.top + t.height / 2, width: t.width}};
  });
  test.skip(!box, 'the platform draws emoji itself');
  await page.mouse.click(box.x, box.y);
  await expect.poll(() => widgetLogs(page)).toHaveLength(2);
  const [, target, offsetX, offsetY] = (await widgetLogs(page))[1].split(' ');
  expect(target).toBe('b');
  expect(Math.abs(+offsetX - (box.x - box.left))).toBeLessThanOrEqual(2);
  expect(Math.abs(+offsetY - (box.y - box.top))).toBeLessThanOrEqual(2);

  // a drag across the text and its emoji, as a person selects it
  await page.mouse.move(box.text.x + 2, box.text.y);
  await page.mouse.down();
  await page.mouse.move(box.text.x + box.text.width - 2, box.text.y, {steps: 10});
  await page.mouse.up();
  const selected = await page.evaluate(async() => {
    const {getWidgetSelectedText} = await window.e2eImport('/src/lib/widgetSandbox/selection.ts');
    return getWidgetSelectedText(document.querySelector('#e2e-widget'));
  });
  expect(selected).toContain('one 😀 two 🚀 thre');
});

test('a canvas draws the client\'s emoji where it stands on the baseline, whatever the text\'s baseline', async({page}) => {
  await open(page, 'compat/calculator');
  const baselines = ['alphabetic', 'top', 'middle', 'bottom', 'hanging', 'ideographic'];
  // as in a Firefox without its extended text metrics: no alphabeticBaseline
  await page.evaluate(() => Object.defineProperty(TextMetrics.prototype, 'alphabeticBaseline', {configurable: true, get: (): undefined => undefined}));
  // each baseline in a band of its own: the emoji on one canvas, an H on the other (an H stands on the alphabetic baseline)
  await runWidget(page, `<style>body{margin:0}canvas{display:block}</style><p style="font:20px sans-serif;margin:0">😀</p>
    <canvas id="e" width="300" height="60"></canvas><canvas id="h" width="300" height="60"></canvas>
    <script>
      setTimeout(function() {
        ${JSON.stringify(baselines)}.forEach(function(baseline, i) {
          ['e', 'h'].forEach(function(id) {
            var ctx = document.getElementById(id).getContext('2d');
            ctx.font = '20px sans-serif';
            ctx.textBaseline = baseline;
            ctx.fillText(id === 'e' ? '😀' : 'H', 10 + i * 45, 30);
          });
        });
        console.log('drawn');
      }, 600);
    </script>`, 1);
  const bands = await page.evaluate((count) => {
    const root = document.querySelector('#e2e-widget .widget-shadow').shadowRoot;
    if(!root.querySelector('tw-emoji')) return null;
    // the rows with ink in each band
    const rows = (id: string) => {
      const canvas = root.querySelector<HTMLCanvasElement>('#' + id);
      const {data, width, height} = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
      return Array.from({length: count}, (_, i) => {
        const inked: number[] = [];
        for(let y = 0; y < height; y++) {
          for(let x = 10 + i * 45; x < Math.min(width, 10 + i * 45 + 30); x++) if(data[(y * width + x) * 4 + 3] > 128) { inked.push(y); break; }
        }
        return inked;
      });
    };
    return {emoji: rows('e'), h: rows('h')};
  }, baselines.length);
  test.skip(!bands, 'the platform draws emoji itself');
  baselines.forEach((baseline, i) => {
    const emoji = bands.emoji[i], baselineRow = Math.max(...bands.h[i]) + 1;
    expect(emoji.length, baseline).toBeGreaterThan(10);
    // its middle .35em above the baseline, as in the widget's text
    expect(Math.abs((emoji[0] + emoji[emoji.length - 1] + 1) / 2 - (baselineRow - 7)), baseline).toBeLessThanOrEqual(2);
  });
});

test('a widget as tall as its viewport keeps its height in a bubble of a fractional width', async({page}) => {
  await open(page, 'compat/calculator');
  // offsetWidth rounds 200.5 to 201: read as a transform around the widget, every size report was a pixel taller
  const heights = await page.evaluate(async() => {
    const {loadWidgetRuntime} = await window.e2eImport('/src/lib/widgetSandbox/runtime.ts');
    const runtime = await loadWidgetRuntime();
    const container = document.createElement('div');
    container.style.cssText = 'position:fixed;left:0;top:0;width:200.5px;z-index:2000000;background:#fff';
    document.body.append(container);
    runtime.createHost(container, '<style>body{margin:0}</style><div style="min-height:50px;height:100vh;background:#3390ec"></div>', {
      theme: {colorScheme: 'light'}, renderer: 'shadow', transport: 'worker', engine: await runtime.prepare('worker'), visible: true
    });
    const seen: number[] = [];
    for(let i = 0; i < 40; i++) {
      await new Promise((resolve) => setTimeout(resolve, 50));
      seen.push(parseFloat(container.querySelector<HTMLElement>('.widget-shadow')?.style.height) || 0);
    }
    return seen;
  });
  expect(heights.slice(20)).toEqual(new Array(20).fill(50));
});

test('a height change keeps the edge the widget chose in place on screen', async({page}) => {
  await open(page, 'compat/calculator');
  const moved = await page.evaluate(async() => {
    const {default: WidgetBlock} = await window.e2eImport('/src/components/widgetSandbox/widgetBlock.tsx');
    const out: Record<string, number> = {};
    for(const anchor of ['top', 'bottom']) {
      // a column scrolled to the middle, the widget in view with content above and below it
      const scroller = document.createElement('div');
      scroller.style.cssText = 'position:fixed;inset:0;overflow-y:auto;z-index:2000000;background:#fff';
      const block = document.createElement('div');
      block.style.cssText = 'margin:1200px 0;width:300px';
      scroller.append(block);
      document.body.append(scroller);
      const scrollable = window.e2eScrollable(scroller);
      const html = `<div id="box" style="height:100px;background:#8cf"></div><script>
        TelegramWidget.setResizeAnchor('${anchor}');
        let h = 100;
        const grow = () => { h += 40; document.getElementById('box').style.height = h + 'px'; if (h < 300) setTimeout(grow, 150); };
        setTimeout(grow, 600);
      </script>`;
      const dispose = window.e2eRender(() => WidgetBlock({html, widgetKey: 'e2e:anchor:' + anchor, scrollable}), block);
      for(let i = 0; i < 50 && !block.querySelector('.widget-shadow'); i++) await new Promise((resolve) => setTimeout(resolve, 50));
      scroller.scrollTop = 1200 - 200;
      // measured from the moment it runs (its first task drawn, its growth 600 ms of its own timers away, and further
      // while it started out of sight), to the end of its growth: when that comes is the engine's, slower in Firefox
      // and on a busy machine
      for(let i = 0; i < 200 && !block.querySelector('[data-widget-block]'); i++) await new Promise((resolve) => setTimeout(resolve, 50));
      const edge = () => {
        const rect = block.getBoundingClientRect();
        return anchor === 'top' ? rect.top : rect.bottom;
      };
      const before = edge(), heightBefore = block.offsetHeight;
      for(let i = 0; i < 200 && block.offsetHeight - heightBefore < 200; i++) await new Promise((resolve) => setTimeout(resolve, 50));
      // the last step's correction
      await new Promise((resolve) => setTimeout(resolve, 300));
      out[anchor] = Math.round(edge() - before);
      out[anchor + 'Grew'] = block.offsetHeight - heightBefore;
      dispose();
      scroller.remove();
    }
    return out;
  });
  expect(moved.topGrew).toBeGreaterThan(150);
  expect(moved.bottomGrew).toBeGreaterThan(150);
  expect(Math.abs(moved.top)).toBeLessThanOrEqual(1);
  expect(Math.abs(moved.bottom)).toBeLessThanOrEqual(1);
});

test('a widget above the screen that changes its height moves nothing on screen', async({page}) => {
  await open(page, 'compat/calculator');
  const result = await page.evaluate(async() => {
    const [{default: WidgetBlock}, sizing] = await Promise.all([
      window.e2eImport('/src/components/widgetSandbox/widgetBlock.tsx'),
      window.e2eImport('/src/lib/widgetSandbox/sizing.ts')
    ]);
    // a column that, as the chat's, keeps nothing in place by itself
    const scroller = document.createElement('div');
    scroller.style.cssText = 'position:fixed;inset:0;overflow-y:auto;overflow-anchor:none;z-index:2000000;background:#fff';
    const block = document.createElement('div');
    block.style.cssText = 'margin-top:400px;width:300px';
    const marker = document.createElement('div');
    marker.style.cssText = 'margin-top:600px;height:3000px';
    scroller.append(block, marker);
    document.body.append(scroller);
    const scrollable = window.e2eScrollable(scroller);
    // a widget that goes in out of sight at the height it had, and is lower once it runs: just above the screen
    sizing.rememberWidgetHeight('e2e:above', 300);
    const html = '<div style="height:100px;background:#8cf"></div>';
    const dispose = window.e2eRender(() => WidgetBlock({html, widgetKey: 'e2e:above', scrollable, lazy: true}), block);
    const heightBefore = block.offsetHeight;
    scroller.scrollTop = block.offsetTop + heightBefore + 200;
    const before = marker.getBoundingClientRect().top;
    for(let i = 0; i < 100 && !block.querySelector('tweb-widget-slot .widget-shadow'); i++) await new Promise((resolve) => setTimeout(resolve, 50));
    await new Promise((resolve) => setTimeout(resolve, 300));
    const out = {heightBefore, changed: block.offsetHeight - heightBefore, moved: Math.round(marker.getBoundingClientRect().top - before)};
    dispose();
    scroller.remove();
    return out;
  });
  expect(result.heightBefore).toBe(300);
  expect(result.changed).toBeLessThan(-100);
  expect(Math.abs(result.moved)).toBeLessThanOrEqual(1);
});

test('a bubble out of sight waits for nothing: its widget keeps the height it had and starts as it comes near the screen', async({page}) => {
  await open(page, 'compat/calculator');
  const result = await page.evaluate(async() => {
    const [{default: WidgetBlock}, sizing] = await Promise.all([
      window.e2eImport('/src/components/widgetSandbox/widgetBlock.tsx'),
      window.e2eImport('/src/lib/widgetSandbox/sizing.ts')
    ]);
    // three screens down a column
    const scroller = document.createElement('div');
    scroller.style.cssText = 'position:fixed;inset:0;overflow-y:auto;z-index:2000000;background:#fff';
    const block = document.createElement('div');
    block.style.cssText = `margin:${innerHeight * 3}px 0;width:300px`;
    scroller.append(block);
    document.body.append(scroller);
    const scrollable = window.e2eScrollable(scroller);
    sizing.rememberWidgetHeight('e2e:lazy', 234);
    const loadPromises: Promise<unknown>[] = [];
    const html = '<div style="height:120px;background:#8cf"></div>';
    const dispose = window.e2eRender(() => WidgetBlock({html, widgetKey: 'e2e:lazy', scrollable, lazy: true, loadPromises}), block);
    const drawn = () => !!block.querySelector('tweb-widget-slot .widget-shadow');
    await new Promise((resolve) => setTimeout(resolve, 1500));
    const far = {held: loadPromises.length, height: block.offsetHeight, drawn: drawn()};
    // within a screen of what the column shows
    scroller.scrollTop = innerHeight * 1.5;
    for(let i = 0; i < 100 && !drawn(); i++) await new Promise((resolve) => setTimeout(resolve, 50));
    const near = {drawn: drawn(), height: block.offsetHeight};
    dispose();
    scroller.remove();
    return {far, near};
  });
  expect(result.far).toEqual({held: 0, height: 234, drawn: false});
  expect(result.near.drawn).toBe(true);
  expect(result.near.height).toBeGreaterThanOrEqual(120);
  expect(result.near.height).toBeLessThan(234);
});

test('a bubble that turns out to go in out of sight stops waiting for its widget, which waits to come near the screen', async({page}) => {
  await open(page, 'compat/calculator');
  const result = await page.evaluate(async() => {
    const {default: WidgetBlock} = await window.e2eImport('/src/components/widgetSandbox/widgetBlock.tsx');
    const {chat, container, chatInner, bubble, attachment} = window.e2eChat();
    bubble.style.marginTop = '3000px';
    // a first task that takes a while
    const html = '<div style="height:120px"></div><script>const t = Date.now(); while(Date.now() - t < 600) {}</script>';
    const loadPromises: Promise<unknown>[] = [];
    let goneOutOfSight: () => void;
    const dispose = window.e2eRender(() => WidgetBlock({html, widgetKey: 'e2e:released', chat, loadPromises, whenOutOfSight: (callback: () => void) => {
      goneOutOfSight = callback;
      return () => {};
    }}), attachment);
    const t0 = performance.now();
    const waited = Promise.all(loadPromises).then(() => performance.now() - t0);
    await new Promise((resolve) => setTimeout(resolve, 100));
    goneOutOfSight();
    const waitedMs = await waited;
    const group = document.createElement('div');
    group.className = 'bubbles-group';
    group.append(bubble);
    chatInner.append(group);
    await new Promise((resolve) => setTimeout(resolve, 1500));
    const out = {
      waitedMs,
      drawn: !!bubble.querySelector('tweb-widget-slot .widget-shadow'),
      staged: container.querySelectorAll('[aria-hidden="true"] .widget-shadow').length,
      busy: !!bubble.querySelector('[aria-busy="true"]')
    };
    dispose();
    container.remove();
    return out;
  });
  expect(result.waitedMs).toBeLessThan(400);
  expect(result).toMatchObject({drawn: false, staged: 0, busy: false});
});

test('keeps the chat input\'s focus: a widget never takes it', async({page}) => {
  await open(page, 'compat/calculator');
  const input = page.getByRole('textbox', {name: 'Chat input stand-in'});
  await input.focus();
  await page.evaluate(async() => (await window.widgetSandbox()).open('conformance/auto/16-sdk-taps-a'));
  await expect.poll(() => heightOf(page, SHADOW), FIRST_DRAW).toBeGreaterThan(60);
  await page.locator(SHADOW).click({position: {x: 30, y: 30}});
  await page.waitForTimeout(500);
  await expect(input).toBeFocused();
});

test('its storage comes back when the widget is built again', async({page}) => {
  await open(page, 'conformance/sdk/07-storage-recreate');
  const value = page.locator(SHADOW).locator('#v');
  await expect(value).toContainText('started 1', FIRST_DRAW);
  for(let i = 0; i < 3; ++i) await page.locator(SHADOW).getByRole('button', {name: '+1'}).click();
  await expect(value).toContainText('local 3 · session 3');

  // another widget in its place drops this one; coming back builds it anew on the same storage
  await page.evaluate(async() => (await window.widgetSandbox()).open('compat/calculator'));
  await expect(page.locator(SHADOW).locator('#display')).toHaveCount(1, FIRST_DRAW);
  await page.evaluate(async() => (await window.widgetSandbox()).open('conformance/sdk/07-storage-recreate'));
  await expect(page.locator(SHADOW).locator('#v')).toContainText('local 3 · session 3 · started 2', FIRST_DRAW);
});

test('a widget that died starts again in view once, and after a second death in a row stays stopped', async({page}) => {
  await open(page, 'conformance/sdk/11-crash-restart');
  const section = page.locator('section[data-story-id]');
  const badge = page.locator(SHADOW).locator('[data-tw-badge="fatal"]');
  const awayAndBack = async() => {
    await section.evaluate((element: HTMLElement) => element.style.marginTop = '5000px');
    await page.waitForTimeout(500);
    await section.evaluate((element: HTMLElement) => element.style.marginTop = '');
  };

  await expect(page.locator(SHADOW).locator('#v')).toContainText('Started 1', FIRST_DRAW);
  // the chat's own recognizers stand back from a running widget only (gestures.ts)
  await expect(section.locator('[data-widget-block]')).toHaveCount(1);
  await page.locator(SHADOW).getByRole('button', {name: 'Crash'}).click();
  await expect(badge).toHaveCount(1, FIRST_DRAW);
  await expect(section.locator('[data-widget-block]')).toHaveCount(0);
  await awayAndBack();
  await expect(page.locator(SHADOW).locator('#v')).toContainText('Started 2', FIRST_DRAW);
  await expect(badge).toHaveCount(0);

  await page.locator(SHADOW).getByRole('button', {name: 'Crash'}).click();
  await expect(badge).toHaveCount(1, FIRST_DRAW);
  await awayAndBack();
  await page.waitForTimeout(1500);
  await expect(badge).toHaveCount(1);
  await expect(page.locator(SHADOW).locator('#v')).toContainText('Started 2');

  // built again (a chat reopened, a caption edited), the same HTML does not run a third time
  await page.evaluate(async() => (await window.widgetSandbox()).open('compat/calculator'));
  await expect(page.locator(SHADOW).locator('#display')).toHaveCount(1, FIRST_DRAW);
  await page.evaluate(async() => (await window.widgetSandbox()).open('conformance/sdk/11-crash-restart'));
  await expect(page.locator('section[data-story-id]').getByText('Widget stopped', {exact: true})).toBeVisible();
  await page.waitForTimeout(1000);
  await expect(page.locator(SHADOW)).toHaveCount(0);
});

test('content taller than the cap is clipped at 600 px', async({page}) => {
  await open(page, 'conformance/sdk/13-max-height');
  await expect.poll(() => heightOf(page, SHADOW), FIRST_DRAW).toBe(600);
  expect(await page.locator('section[data-story-id] [class*="Widget"]').first().evaluate((element) => element.getBoundingClientRect().height)).toBe(600);
});

test('stops animating out of view and picks up again in view', async({page}) => {
  await open(page, 'compat/raf-animation');
  const counter = page.locator(SHADOW).locator('#frames');
  const frames = async() => +(await counter.textContent() || 0);
  await expect.poll(frames, FIRST_DRAW).toBeGreaterThan(5);

  const before = await frames();
  await expect.poll(frames).toBeGreaterThan(before);

  const section = page.locator('section[data-story-id]');
  await section.evaluate((element: HTMLElement) => element.style.marginTop = '5000px');
  // the frames the engine worker had drawn before it heard of it still come; then nothing
  await expect.poll(async() => {
    const before = await frames();
    await page.waitForTimeout(300);
    return await frames() === before;
  }).toBe(true);
  const hidden = await frames();
  await page.waitForTimeout(1000);
  expect(await frames()).toBe(hidden);

  await section.evaluate((element: HTMLElement) => element.style.marginTop = '');
  await expect.poll(frames).toBeGreaterThan(hidden);
});

test('its CSS animations pause off screen with the engine, and go on in view', async({page}) => {
  await open(page, 'compat/css-animation');
  const states = () => page.locator(SHADOW).evaluate((host) => host.shadowRoot.getAnimations().map((a) => a.playState));
  await expect.poll(async() => (await states()).includes('running'), FIRST_DRAW).toBe(true);

  const section = page.locator('section[data-story-id]');
  await section.evaluate((element: HTMLElement) => element.style.marginTop = '5000px');
  await expect.poll(async() => (await states()).includes('running')).toBe(false);

  await section.evaluate((element: HTMLElement) => element.style.marginTop = '');
  await expect.poll(async() => (await states()).includes('running')).toBe(true);

  // an important declaration of the widget's does not keep an animation going, nor does a transition go on
  const held = await page.evaluate(async() => {
    const {loadWidgetRuntime} = await window.e2eImport('/src/lib/widgetSandbox/runtime.ts');
    const runtime = await loadWidgetRuntime();
    const container = document.createElement('div');
    document.body.append(container);
    const engine = await runtime.prepare('worker');
    const host = runtime.createHost(container, `<style>@keyframes k{to{opacity:.5}}#a{animation:k 1s infinite;animation-play-state:running!important}
      #b{width:10px;height:10px;transition:width 30s linear}#b.wide{width:300px}</style><div id="a">a</div><div id="b"></div>
      <script>setTimeout(() => document.getElementById('b').classList.add('wide'), 50)</script>`, {
      theme: {colorScheme: 'light'}, renderer: 'shadow', transport: 'worker', engine, visible: true
    });
    const playStates = () => host.element.shadowRoot.getAnimations().map((a: Animation) => a.constructor.name + ':' + a.playState).sort();
    for(let i = 0; i < 100 && playStates().length < 2; i++) await new Promise((r) => setTimeout(r, 50));
    await new Promise((r) => setTimeout(r, 100));
    const shown = playStates();
    host.setVisible(false);
    await new Promise((r) => setTimeout(r, 100));
    const hidden = playStates();
    host.setVisible(true);
    await new Promise((r) => setTimeout(r, 100));
    const again = playStates();
    host.destroy();
    container.remove();
    return {shown, hidden, again};
  });
  expect(held.shown).toEqual(['CSSAnimation:running', 'CSSTransition:running']);
  expect(held.hidden).toEqual(['CSSAnimation:paused', 'CSSTransition:paused']);
  expect(held.again).toEqual(['CSSAnimation:running', 'CSSTransition:running']);
});

test('an animation the widget runs by an important declaration of its element\'s own is held off screen too, and runs as it says again', async({page}) => {
  await open(page, 'compat/calculator');
  const held = await page.evaluate(async() => {
    const {loadWidgetRuntime} = await window.e2eImport('/src/lib/widgetSandbox/runtime.ts');
    const runtime = await loadWidgetRuntime();
    const container = document.createElement('div');
    document.body.append(container);
    const engine = await runtime.prepare('worker');
    // an element's own important declarations outrank every layer; #a's says paused while the widget is hidden; #c's
    // play state is an important `all`'s, which Chromium reports with no priority
    const host = runtime.createHost(container, `<style>@keyframes k{to{opacity:.5}}</style>
      <div id="a" style="animation:k 1s infinite;animation-play-state:running!important">a</div>
      <div id="b" style="animation:k 1s infinite!important">b</div>
      <div id="c" style="all:initial!important;animation-name:k!important;animation-duration:1s!important;animation-iteration-count:infinite!important;display:block!important">c</div>
      <script>document.addEventListener('visibilitychange', () => {
        if(document.hidden) document.getElementById('a').style.animationPlayState = 'paused';
      });</script>`, {
      theme: {colorScheme: 'light'}, renderer: 'shadow', transport: 'worker', engine, visible: true
    });
    const playStates = () => host.element.shadowRoot.getAnimations().map((a: Animation) => a.playState);
    for(let i = 0; i < 100 && playStates().length < 3; i++) await new Promise((r) => setTimeout(r, 50));
    await new Promise((r) => setTimeout(r, 100));
    const shown = playStates();
    host.setVisible(false);
    await new Promise((r) => setTimeout(r, 300));
    const hidden = playStates();
    host.setVisible(true);
    await new Promise((r) => setTimeout(r, 100));
    const again = playStates();
    host.destroy();
    container.remove();
    return {shown, hidden, again};
  });
  expect(held.shown).toEqual(['running', 'running', 'running']);
  expect(held.hidden).toEqual(['paused', 'paused', 'paused']);
  expect(held.again).toEqual(['paused', 'running', 'running']);
});

test('an element\'s own play state held while the widget is hidden comes back as the widget left it, whatever it wrote meanwhile', async({page}) => {
  await open(page, 'compat/calculator');
  const result = await page.evaluate(async() => {
    const {loadWidgetRuntime} = await window.e2eImport('/src/lib/widgetSandbox/runtime.ts');
    const runtime = await loadWidgetRuntime();
    // hidden, the widget writes what the browser refuses (it keeps the element's running), and sets and clears `all`
    const writes: Record<string, string> = {
      'all: bogus': 'a.style.all = "bogus"',
      'a play state it does not know': 'a.style.setProperty("animation-play-state", "nope", "important")',
      'a shorthand it does not take': 'a.style.animation = "k 1s bogus bogus"',
      'all set and cleared': 'a.style.all = "initial"; setTimeout(() => { a.style.all = ""; }, 10)'
    };
    const out: Record<string, string[]> = {};
    for(const [name, write] of Object.entries(writes)) {
      const container = document.createElement('div');
      document.body.append(container);
      const host = runtime.createHost(container, `<style>@keyframes k{to{opacity:.5}}#a{animation:k 1s infinite}</style>
        <div id="a" style="animation-play-state: running !important">a</div>
        <script>const a = document.getElementById('a');
          document.addEventListener('visibilitychange', () => { if(document.hidden) { ${write}; } });</script>`, {
        theme: {colorScheme: 'light'}, renderer: 'shadow', transport: 'worker', engine: await runtime.prepare('worker'), visible: true
      });
      const states = () => host.element.shadowRoot.getAnimations().map((x: Animation) => x.playState);
      for(let i = 0; i < 100 && !states().length; i++) await new Promise((r) => setTimeout(r, 50));
      host.setVisible(false);
      // hidden timers fire once a second
      await new Promise((r) => setTimeout(r, 2500));
      host.setVisible(true);
      await new Promise((r) => setTimeout(r, 300));
      out[name] = states();
      host.destroy();
      container.remove();
    }
    return out;
  });
  expect(result).toEqual({
    'all: bogus': ['running'],
    'a play state it does not know': ['running'],
    'a shorthand it does not take': ['running'],
    'all set and cleared': ['running']
  });
});

test('an important `all` held while the widget is hidden keeps its rank against the widget\'s sheets, and goes with `all`', async({page}) => {
  await open(page, 'compat/calculator');
  const result = await page.evaluate(async() => {
    const {loadWidgetRuntime} = await window.e2eImport('/src/lib/widgetSandbox/runtime.ts');
    const runtime = await loadWidgetRuntime();
    // the sheet pauses #a with an important declaration, which the element's own important `all` outranks while it
    // stands; shown again, and once the widget takes `all` away (Chromium keeps a later plain play state apart)
    const run = async(inline: string, after: string) => {
      const container = document.createElement('div');
      document.body.append(container);
      const host = runtime.createHost(container, `<style>@keyframes k{to{opacity:.5}}#a{animation:k 1s infinite;animation-play-state:paused!important}</style>
        <div id="a" style="${inline}">a</div>
        <script>const a = document.getElementById('a'); setTimeout(() => { ${after} }, 1200);</script>`, {
        theme: {colorScheme: 'light'}, renderer: 'shadow', transport: 'worker', engine: await runtime.prepare('worker'), visible: true
      });
      const el = () => host.element.shadowRoot.getElementById('a');
      const state = () => getComputedStyle(el()).animationPlayState;
      await new Promise((r) => setTimeout(r, 400));
      const before = state();
      host.setVisible(false);
      await new Promise((r) => setTimeout(r, 200));
      host.setVisible(true);
      await new Promise((r) => setTimeout(r, 200));
      const shown = state();
      await new Promise((r) => setTimeout(r, 1500));
      const later = {state: state(), own: el().style.getPropertyValue('animation-play-state')};
      host.destroy();
      container.remove();
      return {before, shown, later};
    };
    return {
      ranked: await run('all:initial!important;animation-name:k!important;animation-duration:1s!important;animation-iteration-count:infinite!important', ''),
      gone: await run('all:initial!important;animation-play-state:running', 'a.style.all = "";')
    };
  });
  expect(result.ranked).toEqual({before: 'running', shown: 'running', later: {state: 'running', own: expect.any(String)}});
  expect(result.gone).toEqual({before: 'running', shown: 'running', later: {state: 'paused', own: ''}});
});

test('a transition the widget pauses while hidden stays paused when it is shown again', async({page}) => {
  await open(page, 'compat/calculator');
  const states = await page.evaluate(async() => {
    const {loadWidgetRuntime} = await window.e2eImport('/src/lib/widgetSandbox/runtime.ts');
    const runtime = await loadWidgetRuntime();
    const container = document.createElement('div');
    document.body.append(container);
    // the host holds the transition while hidden; the widget pauses it then, through its own handle
    const host = runtime.createHost(container, `<style>#b{width:10px;height:10px;transition:width 30s linear}#b.wide{width:300px}</style><div id="b"></div>
      <script>
        const b = document.getElementById('b');
        setTimeout(() => b.classList.add('wide'), 50);
        document.addEventListener('visibilitychange', () => { if(document.hidden) b.getAnimations()[0]?.pause(); });
      </script>`, {theme: {colorScheme: 'light'}, renderer: 'shadow', transport: 'worker', engine: await runtime.prepare('worker'), visible: true});
    const playStates = () => host.element.shadowRoot.getAnimations().map((a: Animation) => a.playState);
    for(let i = 0; i < 100 && !playStates().length; i++) await new Promise((r) => setTimeout(r, 50));
    const shown = playStates();
    host.setVisible(false);
    await new Promise((r) => setTimeout(r, 500));
    host.setVisible(true);
    await new Promise((r) => setTimeout(r, 200));
    const again = playStates();
    host.destroy();
    container.remove();
    return {shown, again};
  });
  expect(states).toEqual({shown: ['running'], again: ['paused']});
});

test('a CSS animation or transition the widget sets going while hidden is held till it is shown, and goes on from where its clock has it', async({page}) => {
  await open(page, 'compat/calculator');
  const result = await page.evaluate(async() => {
    const {loadWidgetRuntime} = await window.e2eImport('/src/lib/widgetSandbox/runtime.ts');
    const runtime = await loadWidgetRuntime();
    const container = document.createElement('div');
    document.body.append(container);
    // hidden, the widget sets both going from where they are through its own handles (a width that changes lays the chat
    // out again; a `play()` waits for a frame, which a hidden widget does not get, a start time does not)
    const host = runtime.createHost(container, `<style>@keyframes k{to{width:300px}}#a{width:10px;height:10px;animation:k 30s linear}
      #b{width:10px;height:10px;transition:width 30s linear}#b.wide{width:300px}</style><div id="a"></div><div id="b"></div>
      <script>
        const a = document.getElementById('a'), b = document.getElementById('b');
        setTimeout(() => b.classList.add('wide'), 50);
        document.addEventListener('visibilitychange', () => {
          if(!document.hidden) return;
          for(const el of [a, b]) {
            const animation = el.getAnimations()[0];
            if(animation) animation.startTime = document.timeline.currentTime - animation.currentTime;
          }
        });
      </script>`, {theme: {colorScheme: 'light'}, renderer: 'shadow', transport: 'worker', engine: await runtime.prepare('worker'), visible: true});
    const animations = (): Animation[] => host.element.shadowRoot.getAnimations();
    const state = () => animations().map((a) => a.constructor.name + ':' + a.playState).sort();
    const times = () => animations().map((a) => a.currentTime as number);
    for(let i = 0; i < 100 && animations().length < 2; i++) await new Promise((r) => setTimeout(r, 50));
    await new Promise((r) => setTimeout(r, 100));
    host.setVisible(false);
    await new Promise((r) => setTimeout(r, 600));
    const hidden = state(), heldAt = times();
    await new Promise((r) => setTimeout(r, 300));
    const stillAt = times();
    host.setVisible(true);
    await new Promise((r) => setTimeout(r, 200));
    const shown = state(), shownAt = times();
    host.destroy();
    container.remove();
    return {hidden, held: stillAt.map((t, i) => t - heldAt[i]), shown, wentOn: shownAt.map((t, i) => t - heldAt[i])};
  });
  expect(result.hidden).toEqual(['CSSAnimation:paused', 'CSSTransition:paused']);
  expect(result.held).toEqual([0, 0]);
  expect(result.shown).toEqual(['CSSAnimation:running', 'CSSTransition:running']);
  // going since the widget's call, about a second before it was shown
  for(const t of result.wentOn) expect(t).toBeGreaterThan(500);
});

test('the widget\'s scripted animations go on in the timeline of the document it moves into', async({page}) => {
  await open(page, 'compat/calculator');
  const result = await page.evaluate(async() => {
    const {loadWidgetRuntime} = await window.e2eImport('/src/lib/widgetSandbox/runtime.ts');
    const runtime = await loadWidgetRuntime();
    const container = document.createElement('div');
    document.body.append(container);
    const host = runtime.createHost(container, `<div id="a" style="width:10px;height:10px"></div>
      <script>document.getElementById('a').animate([{width: '10px'}, {width: '200px'}], {duration: 60000});</script>`,
    {theme: {colorScheme: 'light'}, renderer: 'shadow', transport: 'worker', engine: await runtime.prepare('worker'), visible: true});
    const scripted = () => host.element.shadowRoot.getAnimations().find((a: Animation) => a.constructor.name === 'Animation');
    for(let i = 0; i < 100 && !scripted(); i++) await new Promise((r) => setTimeout(r, 50));
    await new Promise((r) => setTimeout(r, 300));
    // another document of this window's, as Document Picture-in-Picture's is another window's
    const frame = document.createElement('iframe');
    document.body.append(frame);
    await new Promise((r) => setTimeout(r, 100));
    const before = scripted().currentTime as number;
    frame.contentDocument.body.append(container);
    host.rebind();
    const moved = scripted();
    const after = moved.currentTime as number;
    const result = {sameTimeline: moved.timeline === frame.contentDocument.timeline, jump: after - before};
    host.destroy();
    frame.remove();
    return result;
  });
  expect(result.sameTimeline).toBe(true);
  expect(Math.abs(result.jump)).toBeLessThan(100);
});

test('a scripted animation held while the widget was hidden goes on where the engine\'s clock has it, in the document it moved into meanwhile', async({page}) => {
  await open(page, 'compat/calculator');
  const result = await page.evaluate(async() => {
    const {loadWidgetRuntime} = await window.e2eImport('/src/lib/widgetSandbox/runtime.ts');
    const runtime = await loadWidgetRuntime();
    const container = document.createElement('div');
    document.body.append(container);
    const host = runtime.createHost(container, `<div id="a" style="width:10px;height:10px"></div>
      <script>document.getElementById('a').animate([{width: '10px'}, {width: '200px'}], {duration: 60000});</script>`,
    {theme: {colorScheme: 'light'}, renderer: 'shadow', transport: 'worker', engine: await runtime.prepare('worker'), visible: true});
    const scripted = () => host.element.shadowRoot.getAnimations().find((a: Animation) => a.constructor.name === 'Animation');
    for(let i = 0; i < 100 && !scripted(); i++) await new Promise((r) => setTimeout(r, 50));
    await new Promise((r) => setTimeout(r, 300));
    // a document of this window's whose clock starts later than the page's, as Document Picture-in-Picture's does
    const frame = document.createElement('iframe');
    document.body.append(frame);
    await new Promise((r) => setTimeout(r, 100));
    const before = scripted().currentTime as number, t0 = performance.now();
    host.setVisible(false);
    await new Promise((r) => setTimeout(r, 200));
    const held = scripted().playState;
    frame.contentDocument.body.append(container);
    host.rebind();
    host.setVisible(true);
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const moved = scripted();
    const result = {
      held, playState: moved.playState, sameTimeline: moved.timeline === frame.contentDocument.timeline,
      // it went on while hidden: where it is now, less where the wall clock says it should be
      drift: (moved.currentTime as number) - before - (performance.now() - t0),
      clocksApart: frame.contentWindow.performance.timeOrigin - performance.timeOrigin
    };
    host.destroy();
    frame.remove();
    return result;
  });
  expect(result.clocksApart).toBeGreaterThan(500);
  expect(result).toMatchObject({held: 'paused', playState: 'running', sameTimeline: true});
  expect(Math.abs(result.drift)).toBeLessThan(150);
});

test('a widget moved into another window\'s document holds its transitions there while hidden, whatever realm they are of', async({page}) => {
  await open(page, 'compat/calculator');
  const result = await page.evaluate(async() => {
    const {loadWidgetRuntime} = await window.e2eImport('/src/lib/widgetSandbox/runtime.ts');
    const runtime = await loadWidgetRuntime();
    const container = document.createElement('div');
    document.body.append(container);
    // the transition starts once the widget is in the other document (Firefox makes it of that window's realm)
    const host = runtime.createHost(container, `<style>#b{width:10px;height:10px;transition:width 30s linear}#b.wide{width:300px}</style><div id="b"></div>
      <script>setTimeout(() => document.getElementById('b').classList.add('wide'), 600);</script>`,
    {theme: {colorScheme: 'light'}, renderer: 'shadow', transport: 'worker', engine: await runtime.prepare('worker'), visible: true});
    await new Promise((r) => setTimeout(r, 200));
    // another document of this window's, as Document Picture-in-Picture's is another window's
    const frame = document.createElement('iframe');
    document.body.append(frame);
    await new Promise((r) => setTimeout(r, 100));
    frame.contentDocument.body.append(container);
    host.rebind();
    const states = () => host.element.shadowRoot.getAnimations().map((a: Animation) => a.constructor.name + ':' + a.playState);
    for(let i = 0; i < 100 && !states().length; i++) await new Promise((r) => setTimeout(r, 20));
    const shown = states();
    host.setVisible(false);
    await new Promise((r) => setTimeout(r, 200));
    const hidden = states();
    host.setVisible(true);
    await new Promise((r) => setTimeout(r, 200));
    const again = states();
    host.destroy();
    frame.remove();
    return {shown, hidden, again};
  });
  expect(result).toEqual({shown: ['CSSTransition:running'], hidden: ['CSSTransition:paused'], again: ['CSSTransition:running']});
});

test('keeps running through a move in the DOM, and measures itself through a transform on the page', async({page}) => {
  await open(page, 'compat/tabs');
  await expect.poll(() => heightOf(page, SHADOW), FIRST_DRAW).toBeGreaterThan(60);
  const height = await heightOf(page, SHADOW);
  const first = await page.locator(SHADOW).elementHandle();

  // what the chat does to a bubble it repositions: a shadow root moves with its element
  await page.locator('section[data-story-id]').evaluate((element) => element.parentElement.append(element));
  expect(await page.locator(SHADOW).evaluate((host, old) => host === old, first)).toBe(true);
  await page.locator(SHADOW).getByText('Details', {exact: true}).click();
  await expect(page.locator(SHADOW).getByText(/Details panel/)).toBeVisible();
  await page.locator(SHADOW).getByText('Overview', {exact: true}).click();

  // the chat scales while it opens; a widget built under the transform still gets its own height
  await page.locator('section[data-story-id]').evaluate((element: HTMLElement) => element.parentElement.style.transform = 'scale(0.8)');
  await page.evaluate(async() => (await window.widgetSandbox()).open('compat/calculator'));
  await expect(page.locator(SHADOW).locator('#display')).toHaveCount(1, FIRST_DRAW);
  await page.evaluate(async() => (await window.widgetSandbox()).open('compat/tabs'));
  await expect(page.locator(SHADOW).getByText('Overview', {exact: true})).toHaveCount(1, FIRST_DRAW);
  expect(await heightOf(page, SHADOW)).toBe(height);
});

test('a widget in the page parked while its VM was being copied keeps no VM', async({page, browserName}) => {
  test.skip(browserName !== 'chromium', 'collects garbage through the DevTools protocol');
  await open(page, 'compat/calculator');
  const made = await page.evaluate(async() => {
    const {loadWidgetRuntime} = await window.e2eImport('/src/lib/widgetSandbox/runtime.ts');
    const runtime = await loadWidgetRuntime();
    // the engine's snapshot first: the widget's copy of it is made a moment after its host
    await runtime.prepare('inline');
    const Memory = WebAssembly.Memory;
    const memories: WeakRef<WebAssembly.Memory>[] = (window as any).e2eMemories = [];
    WebAssembly.Memory = Object.assign(function(descriptor: WebAssembly.MemoryDescriptor) {
      const memory = new Memory(descriptor);
      memories.push(new WeakRef(memory));
      return memory;
    }, {prototype: Memory.prototype}) as unknown as typeof WebAssembly.Memory;
    try {
      const container = document.createElement('div');
      document.body.append(container);
      // kept, as the chat keeps a parked widget's host for its picture
      const host = (window as any).e2eParked = runtime.createHost(container, '<p>parked</p>', {
        theme: {colorScheme: 'light'}, renderer: 'shadow', transport: 'inline', visible: true
      });
      host.suspend();
      for(let i = 0; i < 100 && !memories.length; i++) await new Promise((resolve) => setTimeout(resolve, 20));
      await new Promise((resolve) => setTimeout(resolve, 200));
    } finally {
      WebAssembly.Memory = Memory;
    }
    return memories.length;
  });
  expect(made).toBeGreaterThan(0);
  const cdp = await page.context().newCDPSession(page);
  await expect.poll(async() => {
    await cdp.send('HeapProfiler.collectGarbage');
    return page.evaluate(() => ((window as any).e2eMemories as WeakRef<WebAssembly.Memory>[]).filter((ref) => ref.deref()).length);
  }).toBe(0);
  await page.evaluate(() => (window as any).e2eParked.destroy());
});

test('a widget past the live limit keeps its picture without an engine, and comes back to life in view', async({page}) => {
  await open(page, 'showcase/commerce/01-order-status');
  await showAll(page, 'showcase/');
  // the showcase is more than the eight engines kept alive: the ones out of view the longest keep a picture
  const pictures = page.locator(SHADOW).filter({has: page.locator('html[data-tw-frozen="paused"]')});
  await expect.poll(() => pictures.count(), FIRST_DRAW).toBeGreaterThan(0);
  await expect(page.locator(SHADOW).locator('[data-tw-badge]')).toHaveCount(0);

  // the first picture as it is now, by its name: more widgets keep being parked meanwhile, and a locator of "the first
  // picture" would find another one by the time it scrolls
  const id = await page.locator('section[data-story-id]').filter({has: pictures}).first().getAttribute('data-story-id');
  const section = page.locator(`section[data-story-id="${id}"]`);
  const live = section.locator(SHADOW);
  const height = await live.evaluate((element: HTMLElement) => element.style.height);
  await section.scrollIntoViewIfNeeded();
  await expect(live.locator('html[data-tw-frozen]')).toHaveCount(0, FIRST_DRAW);
  await expect(live).toHaveCount(1);
  expect(await live.evaluate((element: HTMLElement) => element.style.height)).toBe(height);
});

test('the time over the corner: the widget is told the band and the corner it takes, on the left right to left', async({page}) => {
  await open(page, 'safe-area/01-what-the-client-passed');
  // what the widget got (the renderer's root variables) and what the time takes of its block, with its margins
  const measure = () => page.evaluate(() => {
    const section = document.querySelector('section[data-story-id="safe-area/01-what-the-client-passed"]');
    const html = section.querySelector<HTMLElement>('tweb-widget-slot .widget-shadow')?.shadowRoot?.querySelector('html');
    const got = ['inset-bottom', 'corner-left', 'corner-right'].map((name) => parseFloat(html?.style.getPropertyValue('--tg-content-safe-area-' + name)) || 0);
    const time = section.querySelector('[class*="_Time_"]')?.getBoundingClientRect();
    const block = section.querySelector('tweb-widget-slot').parentElement.getBoundingClientRect();
    const takes = time ? [
      Math.round(time.height + 2 * (block.bottom - time.bottom)),
      Math.round(time.width + 2 * (time.left - block.left)),
      Math.round(time.width + 2 * (block.right - time.right))
    ] : [0, 0, 0];
    return {got, takes};
  });
  // the time below the widget (a caption below): nothing over it
  await expect(page.locator(SHADOW)).toHaveCount(1, FIRST_DRAW);
  expect((await measure()).got).toEqual([0, 0, 0]);

  await page.evaluate(async() => (await window.widgetSandbox()).setTime('corner'));
  await expect.poll(async() => (await measure()).got[0], FIRST_DRAW).toBeGreaterThan(0);
  let {got, takes} = await measure();
  expect(got).toEqual([takes[0], 0, takes[2]]);

  // a language switch flips the interface: the time goes to the left corner, and the widget is told so
  await page.evaluate(async() => (await window.e2eImport('/src/lib/langPack.ts')).default.forceRTL(true));
  await expect.poll(async() => (await measure()).got[1]).toBeGreaterThan(0);
  ({got, takes} = await measure());
  expect(got).toEqual([takes[0], takes[1], 0]);
  await page.evaluate(async() => (await window.e2eImport('/src/lib/langPack.ts')).default.forceRTL(undefined));
  await page.evaluate(async() => (await window.widgetSandbox()).setTime('none'));
});

test('the sandbox on a short screen and a narrow one: the list stays to pick from, the column keeps the width', async({page}) => {
  await open(page, 'compat/calculator');
  // a laptop's height: the switches scroll in a box of their own, the list keeps its room (a script can scroll the panel
  // itself, a person cannot)
  await page.setViewportSize({width: 1000, height: 600});
  const item = page.getByRole('complementary', {name: 'Widget sandbox'}).locator('[data-story-id="compat/tabs"]');
  expect(await item.evaluate((element) => element.parentElement.clientHeight)).toBeGreaterThan(150);
  await item.getByRole('button').click();
  await expect(page.locator('section[data-story-id="compat/tabs"]')).toHaveCount(1);

  // a phone's width: the panel stands over the stage, which keeps no room for it, in either direction
  await page.setViewportSize({width: 390, height: 800});
  const columnWidth = () => page.locator('section[data-story-id]').evaluate((section) => section.parentElement.getBoundingClientRect().width);
  expect(await columnWidth()).toBeGreaterThan(300);
  await page.evaluate(async() => (await window.e2eImport('/src/lib/langPack.ts')).default.forceRTL(true));
  await expect.poll(() => page.evaluate(() => document.documentElement.dir)).toBe('rtl');
  expect(await columnWidth()).toBeGreaterThan(300);
  await page.evaluate(async() => (await window.e2eImport('/src/lib/langPack.ts')).default.forceRTL(undefined));
});

/** An animation of the page under the sandbox (a sticker of the chat's), playing while animationIntersector lets it. */
async function animationUnder(page: Page) {
  await page.evaluate(async() => {
    const {default: animationIntersector} = await window.e2eImport('/src/components/animationIntersector.ts');
    const element = document.createElement('div');
    element.style.cssText = 'position:fixed;left:0;top:0;width:50px;height:50px';
    document.body.append(element);
    const player = (window as any).e2ePlayer = {
      paused: true,
      autoplay: true,
      loop: true,
      pause() {
        this.paused = true;
      },
      play() {
        this.paused = false;
      },
      remove() {}
    };
    animationIntersector.addAnimation({animation: player, observeElement: element, group: '', type: 'dots'});
  });
  return () => page.evaluate(() => !(window as any).e2ePlayer.paused);
}

test('over a running app it covers the app as a popup does: the chat takes none of its keys, Escape or × closes it', async({page}) => {
  await open(page, 'compat/calculator');
  const overlays = () => page.evaluate(async() => (await window.e2eImport('/src/helpers/overlayCounter.ts')).default.overlaysActive as number);
  const before = await overlays();
  const panels = page.getByRole('complementary', {name: 'Widget sandbox'});
  const dialogs = page.getByRole('dialog', {name: 'Widget sandbox'});
  // the page's own sandbox is the page: no dialog
  await expect(dialogs).toHaveCount(0);
  const show = async() => {
    await page.evaluate(async() => (await window.widgetSandbox()).show());
    await expect(panels).toHaveCount(2);
    expect(await overlays()).toBe(before + 1);
    // the one over the app is a modal dialog, by its name
    await expect(dialogs).toHaveCount(1);
    await expect(dialogs).toHaveAttribute('aria-modal', 'true');
  };
  // an animation of what it stands over, playing until it opens
  const playing = await animationUnder(page);
  await expect.poll(playing).toBe(true);
  await show();
  // held while it is there, the sandbox's own widgets running
  expect(await playing()).toBe(false);
  await expect(dialogs.locator('[data-widget-block]')).toHaveCount(1, FIRST_DRAW);
  // the chat's keys listen on the body (appImManager: Enter sends its draft, a letter goes to its composer): a key on the
  // panel never gets there, over the app or beside it as the popup sandbox's
  await page.evaluate(() => {
    (window as any).e2eBodyKeys = 0;
    document.body.addEventListener('keydown', () => (window as any).e2eBodyKeys++);
  });
  await panels.last().getByRole('button', {name: 'One', exact: true}).focus();
  await page.keyboard.press('a');
  await page.keyboard.press('Enter');
  expect(await page.evaluate(() => (window as any).e2eBodyKeys)).toBe(0);

  await page.keyboard.press('Escape');
  await expect(panels).toHaveCount(1);
  expect(await overlays()).toBe(before);
  await expect(dialogs).toHaveCount(0);
  // and plays again once it is gone
  await expect.poll(playing).toBe(true);
  await show();
  await panels.last().getByTitle('Close and restore the app').click();
  await expect(panels).toHaveCount(1);
  expect(await overlays()).toBe(before);

  // what the overlay leaves behind as it goes: the page's sandbox still takes the widgets' actions instead of the client
  await page.evaluate(async() => (await window.e2eImport('/src/lib/widgetSandbox/actions.ts')).handleWidgetAction({kind: 'haptic', haptic: 'selection'}));
  expect(await actions(page)).toContain('haptic("selection")');
  // and scrolls its own column to a widget picked in it (once the column has its widgets drawn: a height that comes after
  // the scroll would move the one picked away)
  await showAll(page, 'showcase/travel/');
  await expect(page.locator('section[data-story-id^="showcase/travel/"] [data-widget-block]')).toHaveCount(5, FIRST_DRAW);
  await show();
  await page.keyboard.press('Escape');
  await expect(panels).toHaveCount(1);
  await page.evaluate(async() => (await window.widgetSandbox()).open('showcase/travel/05-itinerary'));
  await expect(page.locator('section[data-story-id="showcase/travel/05-itinerary"]')).toBeInViewport();
});

test('over a running app an account switch closes it, all it holds let go: the switch drops its Escape without calling it', async({page}) => {
  await open(page, 'compat/calculator');
  const overlays = () => page.evaluate(async() => (await window.e2eImport('/src/helpers/overlayCounter.ts')).default.overlaysActive as number);
  const before = await overlays();
  const dialogs = page.getByRole('dialog', {name: 'Widget sandbox'});
  const playing = await animationUnder(page);
  await expect.poll(playing).toBe(true);
  await page.evaluate(async() => (await window.widgetSandbox()).show());
  await expect(dialogs).toHaveCount(1);
  expect(await overlays()).toBe(before + 1);
  expect(await playing()).toBe(false);

  // what switchAccount does to it (lib/accounts/switchAccount.ts): the navigation reset, then the event
  await page.evaluate(async() => {
    const {default: appNavigationController} = await window.e2eImport('/src/components/appNavigationController.ts');
    appNavigationController.resetForAccountSwitch(new URL(location.href));
    (await window.e2eImport('/src/lib/rootScope.ts')).default.dispatchEventSingle('account_switched', {from: 1, to: 2});
  });
  await expect(dialogs).toHaveCount(0);
  await expect(page.getByRole('complementary', {name: 'Widget sandbox'})).toHaveCount(1);
  expect(await overlays()).toBe(before);
  await expect.poll(playing).toBe(true);

  // opened again, Escape closes it as before
  await page.evaluate(async() => (await window.widgetSandbox()).show());
  await expect(dialogs).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(dialogs).toHaveCount(0);
  expect(await overlays()).toBe(before);
});

test('over the app in its Document PiP window the sandbox opens there, and goes as the app moves back', async({page}) => {
  await open(page, 'compat/calculator');
  const overlays = () => page.evaluate(async() => (await window.e2eImport('/src/helpers/overlayCounter.ts')).default.overlaysActive as number);
  const before = await overlays();
  // a same-origin frame's window standing in for the Document PiP one the app moves into
  await page.evaluate(async() => {
    const frame = document.createElement('iframe');
    frame.id = 'e2e-pip';
    frame.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;border:0;z-index:2000000;background:#fff';
    document.body.append(frame);
    (await window.e2eImport('/src/helpers/appWindow.ts')).setAppWindow(frame.contentWindow);
    await (await window.widgetSandbox()).show();
  });
  const pip = page.frameLocator('#e2e-pip');
  await expect(pip.getByRole('complementary', {name: 'Widget sandbox'})).toHaveCount(1);
  // the page's own sandbox alone in the tab, and the class that lifts the toasts on the window it is shown in
  await expect(page.getByRole('complementary', {name: 'Widget sandbox'})).toHaveCount(1);
  expect(await page.evaluate(() => (document.getElementById('e2e-pip') as HTMLIFrameElement).contentDocument.body.className)).toMatch(/_Open_/);
  expect(await overlays()).toBe(before + 1);

  await page.evaluate(async() => (await window.e2eImport('/src/helpers/appWindow.ts')).setAppWindow(window));
  await expect(pip.getByRole('complementary', {name: 'Widget sandbox'})).toHaveCount(0);
  expect(await page.evaluate(() => (document.getElementById('e2e-pip') as HTMLIFrameElement).contentDocument.body.className)).not.toMatch(/_Open_/);
  expect(await overlays()).toBe(before);
  expect(await page.evaluate(() => document.body.className)).toMatch(/_Open_/);
});

test('the scripted bench runs its widgets in the window the app is shown in, its Document PiP one too', async({page}) => {
  await open(page, 'compat/calculator');
  // the page's own widget drawn first, so that what is counted in the tab stays
  await expect(page.locator(SHADOW)).toHaveCount(1, FIRST_DRAW);
  // a same-origin frame's window standing in for the Document PiP one the app moves into
  await page.evaluate(async() => {
    const frame = document.createElement('iframe');
    frame.id = 'e2e-pip';
    frame.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;border:0;z-index:2000000;background:#fff';
    document.body.append(frame);
    (await window.e2eImport('/src/helpers/appWindow.ts')).setAppWindow(frame.contentWindow);
  });
  // what of the widgets is in either window (the tab has the page's own sandbox's): on a shadow root, or in a frame of
  // the renderer's, whose first message goes to the window it is in (vendored iframe-renderer.ts)
  const widgets = (selector: string) => page.evaluate((selector) => ({
    pip: (document.getElementById('e2e-pip') as HTMLIFrameElement).contentDocument.querySelectorAll(selector).length,
    tab: document.querySelectorAll(selector).length
  }), selector);
  const before = await widgets('.widget-shadow');
  expect(await page.evaluate(async() => (await window.widgetSandbox()).keepBenchWidgets('inline', 2))).toEqual([]);
  expect(await widgets('.widget-shadow')).toEqual({pip: 2, tab: before.tab});
  await page.evaluate(async() => (await window.widgetSandbox()).dropBenchWidgets());
  const framesBefore = await widgets('iframe.widget-frame');
  expect(await page.evaluate(async() => (await window.widgetSandbox()).keepBenchWidgets('frame', 1))).toEqual([]);
  expect(await widgets('iframe.widget-frame')).toEqual({pip: 1, tab: framesBefore.tab});
  await page.evaluate(async() => (await window.widgetSandbox()).dropBenchWidgets());

  // the frames it measures are that window's: the tab behind a Document PiP window may be out of sight, with none
  const frames = await page.evaluate(async() => {
    const requestAnimationFrame = window.requestAnimationFrame;
    window.requestAnimationFrame = () => 0;
    try {
      const result = await (await window.widgetSandbox()).bench({modes: ['inline'], scenarios: ['anim']});
      return result.rows.find((row) => row.metric === 'page frames')?.values.inline;
    } finally {
      window.requestAnimationFrame = requestAnimationFrame;
      (await window.e2eImport('/src/helpers/appWindow.ts')).setAppWindow(window);
    }
  });
  expect(frames).toBeGreaterThan(0);
});

test('a reload brings the view back with its filter; a widget opened by a script or a typed hash is shown, out of the Bench or a filter', async({page}) => {
  await open(page, 'compat/calculator');
  await showAll(page, 'compat/tab');
  const sections = page.locator('section[data-story-id]');
  await expect.poll(() => sections.count()).toBeGreaterThan(0);
  const listed = await sections.count();
  // every listed widget starts in this view: only what was listed comes back
  await page.reload();
  await page.getByRole('complementary', {name: 'Widget sandbox'}).waitFor();
  await expect(page.getByPlaceholder('Filter widgets…')).toHaveValue('compat/tab');
  await expect(sections).toHaveCount(listed);

  // a widget the filter leaves out, opened by a script or a typed hash: shown on its own, the filter kept
  const views = page.getByRole('group', {name: 'View'});
  await page.evaluate(async() => (await window.widgetSandbox()).open('compat/calculator'));
  await expect(page.locator('section[data-story-id="compat/calculator"]')).toHaveCount(1);
  await expect(views.getByRole('button', {name: 'One'})).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByPlaceholder('Filter widgets…')).toHaveValue('compat/tab');
  await views.getByRole('button', {name: 'All in a row'}).click();
  await expect(sections).toHaveCount(listed);
  await page.evaluate(() => location.hash = '#' + encodeURIComponent('compat/clock'));
  await expect(page.locator('section[data-story-id="compat/clock"]')).toHaveCount(1);
  await expect(sections).toHaveCount(1);

  const bench = views.getByRole('button', {name: 'Bench'});
  await bench.click();
  await expect(sections).toHaveCount(0);
  await page.evaluate(async() => (await window.widgetSandbox()).open('compat/calculator'));
  await expect(page.locator('section[data-story-id="compat/calculator"]')).toHaveCount(1);
  await bench.click();
  await page.evaluate(() => location.hash = '#' + encodeURIComponent('compat/tabs'));
  await expect(page.locator('section[data-story-id="compat/tabs"]')).toHaveCount(1);
});

test('the bench starts a mode cold: never on an engine the sandbox has warmed with the same switches', async({page}) => {
  await open(page, 'compat/calculator');
  // the widgets on each engine worker kept
  const engines = () => page.evaluate(async() => {
    const {listEngines} = await window.e2eImport('/src/vendor/widget-sandbox/src/host/engine-client.ts');
    return (listEngines() as {widgets: number}[]).map(({widgets}) => widgets);
  });
  await page.evaluate(async() => {
    const api = await window.widgetSandbox();
    api.setSuspend('asyncify');
    api.setEngines('1');
  });
  // the calculator starts again on an engine of the bench's `worker · asyncify`
  await expect.poll(engines, FIRST_DRAW).toEqual([1]);
  expect(await page.evaluate(async() => (await window.widgetSandbox()).keepBenchWidgets('worker-asyncify', 1))).toEqual([]);
  // on the warm one it would be its second widget
  expect(await engines()).toEqual([1]);
  await page.evaluate(async() => (await window.widgetSandbox()).dropBenchWidgets());
});

test('the Bench view runs the widgets it measures all in sight, none under the panel, widened as it may be', async({page}) => {
  await open(page, 'compat/calculator');
  await page.getByRole('group', {name: 'View'}).getByRole('button', {name: 'Bench'}).click();
  const box = page.locator('[class*="_BenchBox_"]');
  await box.waitFor({state: 'attached'});
  // the panel widened by half again, as its handle (`resize: horizontal`) does it: the handle writes the element's width
  // (a drag of it moves nothing in Playwright's WebKit, a textarea's neither)
  const panelBox = page.getByRole('complementary', {name: 'Widget sandbox'});
  const {width} = await panelBox.boundingBox();
  await panelBox.evaluate((panel, width) => panel.style.width = width + 'px', width * 1.5);
  expect((await panelBox.boundingBox()).width).toBeGreaterThan(width * 1.4);
  // what the view's Run does, on one engine and the animated widgets, which run the longest
  const run = box.evaluate(async(container) => (await window.e2eImport('/src/lib/widgetSandbox/bench.ts')).runWidgetBench({container, modes: ['frame'], scenarios: ['anim']}));
  await expect.poll(() => box.evaluate((container) => container.querySelectorAll('iframe').length), FIRST_DRAW).toBe(8);
  const {panel, cells} = await box.evaluate((container) => ({
    panel: document.querySelector('[role="complementary"][aria-label="Widget sandbox"]').getBoundingClientRect().right,
    // the grid's cells, each clipping its widget
    cells: [...container.firstElementChild.children].map((cell) => {
      const {left, right, top, bottom} = cell.getBoundingClientRect();
      return {left, right, top, bottom, frames: cell.querySelectorAll('iframe').length};
    })
  }));
  const viewport = page.viewportSize();
  expect(cells).toHaveLength(8);
  for(const cell of cells) {
    expect(cell.frames).toBe(1);
    expect(cell.left).toBeGreaterThanOrEqual(panel);
    expect(cell.right).toBeLessThanOrEqual(viewport.width);
    expect(cell.top).toBeGreaterThanOrEqual(0);
    expect(cell.bottom).toBeLessThanOrEqual(viewport.height);
  }
  await run;
});

test('the bench keeps every widget it measures in sight: an opaque frame out of it would get fewer frames', async({page}) => {
  await open(page, 'compat/calculator');
  expect(await page.evaluate(async() => (await window.widgetSandbox()).keepBenchWidgets('frame', 8))).toEqual([]);
  const seen = await page.evaluate(() => new Promise<number>((resolve) => {
    // the observer's first report has every frame, with what of it the boxes around it let be seen
    const observer = new IntersectionObserver((entries) => {
      observer.disconnect();
      resolve(entries.filter((entry) => entry.isIntersecting).length);
    });
    const frames = document.querySelectorAll('iframe.widget-frame');
    frames.forEach((frame) => observer.observe(frame));
    if(!frames.length) resolve(0);
  }));
  await page.evaluate(async() => (await window.widgetSandbox()).dropBenchWidgets());
  expect(seen).toBe(8);
});

test('a history entry the client takes back (a toast\'s) leaves the widget picked on screen', async({page}) => {
  await open(page, 'compat/calculator');
  // the toast's entry is made while the calculator is on screen, and taken back as the toast goes, after the next widget
  // has opened: only a typed hash switches widgets
  await page.evaluate(async() => (await window.e2eImport('/src/components/toast.ts')).toast('copied', undefined, 300));
  await page.evaluate(async() => (await window.widgetSandbox()).open('compat/tabs'));
  await page.waitForTimeout(1500);
  await expect(page.locator('section[data-story-id]')).toHaveAttribute('data-story-id', 'compat/tabs');
  expect(await page.evaluate(() => location.hash)).toBe('#' + encodeURIComponent('compat/tabs'));
});

test('the attack corpus leaks nothing: no request leaves the page, nothing reaches the canary', async({page, browserName}) => {
  // the whole corpus, one widget after another: ~2.6 min alone in Firefox, and past 4 under a full run's load
  test.setTimeout(browserName === 'chromium' ? 240_000 : 480_000);
  const outside: string[] = [];
  const origin = new URL(test.info().project.use.baseURL).origin;
  const allowed = (url: string) => url.startsWith(origin) || url.startsWith(origin.replace(/^http/, 'ws')) || /^(data|blob|about):/.test(url);
  page.on('request', (request) => { if(!allowed(request.url())) outside.push(`${request.method()} ${request.url()} [${request.resourceType()}]`); });
  page.on('websocket', (socket) => { if(!allowed(socket.url())) outside.push('WS ' + socket.url()); });
  const hits = async() => (await (await fetch(CANARY + '/__hits')).json()) as unknown[];
  const before = (await hits()).length;

  await open(page, 'attacks/api-fetch');
  const {names, aimed} = await page.evaluate(async(canary) => {
    const {listWidgetFixtures, loadWidgetFixture} = await window.e2eImport('/src/lib/widgetSandbox/fixtures.ts');
    return {
      names: (listWidgetFixtures() as string[]).filter((name) => name.startsWith('attacks/')),
      // the server aimed the corpus at this run's canary: a vector that got out is counted
      aimed: (await loadWidgetFixture('attacks/api-fetch') as string).includes(canary)
    };
  }, CANARY);
  expect(aimed).toBe(true);
  expect(names).toHaveLength(127);
  // one after another, each started on its own in view: it runs (or the sandbox stops it), is poked where a vector might
  // want a tap, and has the time its deferred payloads take — the latest aims 150 ms after the start, or after the tap
  for(const name of names) {
    await page.evaluate(async(name) => (await window.widgetSandbox()).open(name), name);
    const section = page.locator(`section[data-story-id="${name}"]`);
    await expect(section.locator('[data-widget-block], html[data-tw-frozen="fatal"]').first()).toBeAttached(FIRST_DRAW);
    await section.locator(SHADOW).click({position: {x: 20, y: 10}, force: true});
    await page.waitForTimeout(300);
  }
  await page.waitForTimeout(2000);

  expect((await hits()).slice(before)).toEqual([]);
  expect(outside).toEqual([]);
});

test.describe('chromium: the debug transports, switched live', () => {
  test.skip(({browserName}) => browserName !== 'chromium', 'the worker transport needs the isolation only Chromium has here');

  test('restarts a running widget on a worker and in the renderer\'s frame when the switch flips', async({page}) => {
    // the dev server isolates a page only when asked: widgets themselves need no isolation
    await open(page, 'compat/canvas-bar-chart', 'one', true);
    await expect.poll(() => heightOf(page, SHADOW), FIRST_DRAW).toBeGreaterThan(150);

    await page.evaluate(async() => (await window.widgetSandbox()).setTransport('sab'));
    expect(await page.evaluate(async() => (await window.widgetSandbox()).getTransport())).toBe('sab');
    await expect(page.locator(SHADOW)).toHaveCount(0);
    await expect.poll(() => heightOf(page, FRAME), FIRST_DRAW).toBeGreaterThan(150);
    await expect(page.locator(FRAME)).toHaveAttribute('sandbox', 'allow-scripts allow-forms');
    await expect(page.locator(FRAME)).toHaveAttribute('title', 'Interactive widget');

    await page.evaluate(async() => (await window.widgetSandbox()).setTransport('frame'));
    expect(await page.evaluate(async() => (await window.widgetSandbox()).getTransport())).toBe('frame');
    // the engine came up in the frame and drew the chart: the canvas has its size and the frame its height
    await expect.poll(() => page.frameLocator(FRAME).locator('canvas').evaluate((canvas: HTMLCanvasElement) => canvas.width), FIRST_DRAW).toBeGreaterThan(100);
    await expect.poll(() => heightOf(page, FRAME)).toBeGreaterThan(150);
  });
});
