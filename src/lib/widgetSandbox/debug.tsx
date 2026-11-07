import {render} from 'solid-js/web';
import type {Message} from '@layer';
import type Chat from '@components/chat/chat';
import ReplyMarkupLayout from '@components/chat/bubbleParts/replyMarkupLayout';
import {IconTsx} from '@components/iconTsx';
import type {Middleware, MiddlewareHelper} from '@helpers/middleware';
import {hotReloadGuard} from '@lib/solidjs/hotReloadGuardProvider';
import {appendToOverlayRoot} from '@helpers/appWindow';
import rootScope from '@lib/rootScope';
import type {BenchOptions, BenchResult} from '@lib/widgetSandbox/bench';
import {listWidgetFixtures, loadWidgetFixture, widgetMedia} from '@lib/widgetSandbox/fixtures';
import {
  resolveWidgetSuspend,
  resolveWidgetTransport,
  setWidgetEngineCount,
  setWidgetRendererKind,
  setWidgetSuspend,
  setWidgetTransport,
  WidgetEngineCountChoice,
  widgetRendererKind,
  WidgetRendererKind,
  WidgetSuspendChoice,
  WidgetTransportChoice
} from '@lib/widgetSandbox/runtime';
import type {MockBotMode, MockWalletMode} from '@lib/widgetSandbox/mockBot';
import type {WidgetMessageKind} from 'widget-sandbox/shared/sdk-policy';
import toArray from '@helpers/array/toArray';

/**
 * Dev-only console helpers for widgets (`await widgetSandbox()` on a dev server or the authorized
 * preview): fixture widgets are shown in real bubbles of the open chat, as messages nobody sent.
 */

type InjectOptions = {
  /** As your messages instead of the peer's. */
  out?: boolean,
  /** The size the widget is sent with, in pixels: without one it fills the bubble and takes its content's height. */
  width?: number,
  height?: number
};

type FakeBubble = HTMLElement & {middlewareHelper: MiddlewareHelper};

let fakeMid = -1e9;

/** Every fixture for nothing, a whole group for its name (`compat`, `showcase`, `attacks`), else the names. */
function resolveFixtures(names?: string | string[]) {
  const all = listWidgetFixtures();
  if(names === undefined) return all;
  return toArray(names).flatMap((name) => {
    const group = all.filter((fixture) => fixture.startsWith(name + '/'));
    return group.length ? group : [name];
  });
}

/**
 * A bubble the chat draws the way it draws any message, with the fixture's widget over a caption naming it.
 * Nothing is stored or sent, and its middleware is the chat's (`middleware`): re-rendering or leaving the chat
 * drops the bubble and stops the widget.
 */
async function renderWidgetBubble(chat: Chat, middleware: Middleware, name: string, title: string, options: InjectOptions) {
  const message = {
    _: 'message',
    mid: --fakeMid,
    id: fakeMid,
    peerId: chat.peerId,
    fromId: options.out ? rootScope.myId : chat.peerId,
    date: Math.floor(Date.now() / 1000),
    message: title,
    pFlags: options.out ? {out: true} : {},
    media: widgetMedia(await loadWidgetFixture(name), options.width, options.height)
  } as unknown as Message.message;

  const {bubble, result} = await chat.bubbles.renderPreviewBubble(message, middleware.create());
  await Promise.all(result?.promises || []);
  return bubble as FakeBubble;
}

/**
 * Previous / next under a lone widget, where a bot's inline buttons sit under its message; the arrows mirror with the
 * row right to left (iconsReverse), and the fixtures' names stay left to right.
 */
function addFlipButtons(bubble: FakeBubble, names: string[], index: number, flip: (index: number) => void) {
  const contentWrapper = bubble.querySelector('.bubble-content-wrapper');
  if(!contentWrapper) return;
  const container = document.createElement('div');
  const nameAt = (offset: number) => names[(index + offset + names.length) % names.length];
  const dispose = render(() => (
    <ReplyMarkupLayout>
      <ReplyMarkupLayout.Row>
        <ReplyMarkupLayout.Button onClick={() => flip(index - 1)}>
          <IconTsx icon="arrow_prev" /> <span dir="ltr">{nameAt(-1)}</span>
        </ReplyMarkupLayout.Button>
        <ReplyMarkupLayout.Button onClick={() => flip(index + 1)}>
          <span dir="ltr">{nameAt(1)}</span> <IconTsx icon="arrow_next" />
        </ReplyMarkupLayout.Button>
      </ReplyMarkupLayout.Row>
    </ReplyMarkupLayout>
  ), container);
  bubble.middlewareHelper.onDestroy(dispose);
  bubble.classList.add('with-reply-markup');
  const markup = container.firstElementChild as HTMLElement;
  // its keys are its own: the chat's listen on the body (Enter on a focused button would send the chat's draft), as
  // the sandbox panel's are (popupSandbox/panel.tsx)
  markup.addEventListener('keydown', (e) => e.stopPropagation());
  contentWrapper.append(markup);
}

/**
 * Renders messages with the fixture widgets into the open chat, as the peer's (or, with `out`, as yours):
 * every fixture when called with nothing, a group by its name, or the named ones. A lone widget gets
 * previous / next buttons that flip its bubble through all the fixtures.
 */
export async function inject(names?: string | string[], options: InjectOptions = {}) {
  const chat = hotReloadGuard.appImManager.chat;
  if(!chat?.peerId) throw new Error('open a chat first');
  const fixtures = resolveFixtures(names);
  const all = listWidgetFixtures();
  const index = fixtures.length === 1 ? all.indexOf(fixtures[0]) : -1;
  if(fixtures.length === 1 && index === -1) await loadWidgetFixture(fixtures[0]); // throws with the list to pick from
  const {chatInner, scrollable} = chat.bubbles;
  // the chat as it is now: once it has moved on (another chat), nothing more is built for it
  const middleware = chat.bubbles.getMiddleware();
  const group = document.createElement('div');
  group.classList.add('bubbles-group');
  const section = document.createElement('section');
  section.classList.add('bubbles-date-group');
  section.append(group);
  // in the chat before the first bubble, which goes in as soon as it is built: a widget counts against the live ones
  // (the ones out of view keep only their picture) once its bubble is in, and until then it holds an engine
  chatInner.append(section);

  if(fixtures.length === 1) {
    let bubble: FakeBubble, flipping = false;
    const show = async(index: number) => {
      if(flipping) return;
      flipping = true;
      try {
        index = (index + all.length) % all.length;
        const next = await renderWidgetBubble(chat, middleware, all[index], `${all[index]} (${index + 1}/${all.length})`, options);
        addFlipButtons(next, all, index, show);
        if(bubble) {
          bubble.replaceWith(next);
          bubble.middlewareHelper.destroy();
        } else {
          group.append(next);
        }

        bubble = next;
      } finally {
        flipping = false;
      }
    };

    await show(index);
  } else {
    for(let i = 0; i < fixtures.length && middleware(); ++i) {
      group.append(await renderWidgetBubble(chat, middleware, fixtures[i], `${fixtures[i]} (${i + 1}/${fixtures.length})`, options));
    }
  }

  if(!middleware()) return section;
  const container = scrollable.container;
  // a lone widget lands at the end like a new message; a run of them is read from its first one down
  container.scrollTop = fixtures.length === 1 ?
    container.scrollHeight :
    container.scrollTop + section.getBoundingClientRect().top - container.getBoundingClientRect().top;
  return section;
}

const loadSandbox = () => import('@components/widgetSandbox/sandbox');
const loadBench = () => import('@lib/widgetSandbox/bench');

/**
 * Where the bench's widgets run when a script drives it: over the lower half of the window the app is shown in (its
 * Document PiP one when it is there: a tab out of sight would throttle the frames measured), in the grid the bench
 * lays them out in.
 */
function benchBox() {
  const container = appendToOverlayRoot();
  container.style.cssText = 'position:fixed;inset:50vh 0 0;z-index:2000000;pointer-events:none';
  return container;
}

async function bench(options: Omit<BenchOptions, 'container'> = {}) {
  const {runWidgetBench} = await loadBench();
  const container = benchBox();
  try {
    return await runWidgetBench({...options, container});
  } finally {
    container.remove();
  }
}

let keptWidgets: {modeId: string, add: (count: number) => Promise<string[]>, stop: () => Promise<void>, container: HTMLElement};

/**
 * `count` more widgets of the bench kept running on `modeId` until `dropBenchWidgets` (memory measured from outside);
 * resolves with the ones that died.
 */
async function keepBenchWidgets(modeId: string, count: number) {
  if(keptWidgets?.modeId !== modeId) {
    await dropBenchWidgets();
    const container = benchBox();
    keptWidgets = {modeId, container, ...await (await loadBench()).keepBenchWidgets(modeId, container)};
  }
  return keptWidgets.add(count);
}

async function dropBenchWidgets() {
  if(!keptWidgets) return;
  const {stop, container} = keptWidgets;
  keptWidgets = undefined;
  await stop();
  container.remove();
}

export default {
  listFixtures: listWidgetFixtures,
  inject,
  /** The widget sandbox over the running app (`?widgets=1` opens it on its own); `hide` closes it. */
  show: async() => (await loadSandbox()).showWidgetSandbox(),
  hide: async() => (await loadSandbox()).hideWidgetSandbox(),
  /** In the sandbox: shows a widget by fixture name, or scrolls to it in the `all` view. */
  open: async(name: string) => (await loadSandbox()).openWidget(name),
  setView: async(view: 'one' | 'all') => (await loadSandbox()).setWidgetSandboxView(view),
  /** What widgets asked the client for (links, haptics) while the sandbox was open, newest first. */
  actions: async() => (await loadSandbox()).actions(),
  /** The same as the widgets gave them since the last call, oldest first. */
  takeActionLog: async() => (await loadSandbox()).takeActionLog(),
  /** Lays the sandbox's widgets out at `width` CSS px (none: a message's width). */
  setWidth: async(width?: number) => (await loadSandbox()).setWidgetSandboxWidth(width),
  setTheme: async(scheme: 'light' | 'dark') => (await loadSandbox()).setWidgetSandboxTheme(scheme),
  /** `corner`: the time over the widgets' bottom corner, which they are told of (the content safe area); `none`. */
  setTime: async(where: 'none' | 'corner') => (await loadSandbox()).setWidgetSandboxTime(where),
  /** The kind of message the sandbox's widgets are in (their flags: `private`, `copy`, `preview`, …); they start again. */
  setMessageKind: async(kind: WidgetMessageKind) => (await import('@lib/widgetSandbox/mockBot')).setMockMessageKind(kind),
  /** How the mock bot answers: `bot`, or a client's failure (`TIMEOUT`, `RATE_LIMITED`, `FAILED`). */
  setBotMode: async(mode: MockBotMode) => (await import('@lib/widgetSandbox/mockBot')).setMockBotMode(mode),
  /** The user's Gram Wallet: `none` (the widgets start again without it), or how its window ends: `confirm`, `REJECTED`, `BAD_REQUEST`. */
  setWalletMode: async(mode: MockWalletMode) => (await import('@lib/widgetSandbox/mockBot')).setMockWalletMode(mode),
  /** The requests the sandbox's widgets sent the mock bot, newest first, and what came back. */
  botRequests: async() => (await import('@lib/widgetSandbox/mockBot')).mockBotRequests(),
  setRenderer: (kind: WidgetRendererKind) => setWidgetRendererKind(kind),
  getRenderer: () => widgetRendererKind(),
  /** `auto` (what users get), `sab` or `frame`; `getTransport` says which one a widget started now gets. */
  setTransport: (transport: WidgetTransportChoice) => setWidgetTransport(transport),
  getTransport: () => resolveWidgetTransport(),
  /** `worker`: `auto`, `jspi` or `asyncify`; `getSuspend` says which one an engine started now gets. */
  setSuspend: (choice: WidgetSuspendChoice) => setWidgetSuspend(choice),
  getSuspend: () => resolveWidgetSuspend(),
  /** `worker`: how many engine workers at most, `auto`, `1` or `2`. */
  setEngines: (choice: WidgetEngineCountChoice) => setWidgetEngineCount(choice),
  /** The engines this page can run, measured against each other (lib/widgetSandbox/bench.ts; the sandbox's Bench view). */
  bench,
  listBenchModes: async() => (await loadBench()).listBenchModes(),
  keepBenchWidgets,
  dropBenchWidgets,
  benchToMarkdown: async(result: BenchResult) => (await loadBench()).benchToMarkdown(result)
};

// the console reaches this module by a dynamic import() on every call (index.ts), so an edit of it, or of the tooling
// under it, takes effect at the next call instead of reloading the page
if(import.meta.hot) import.meta.hot.accept();
