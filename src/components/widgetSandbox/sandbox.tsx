/*
 * Widget sandbox — every fixture widget (src/lib/widgetSandbox/fixtures) on the real engine, validator
 * and renderers, opened by click: no account, no chat, nothing on the wire. The popup sandbox's panel
 * and mock environment, and one view of its own: every listed widget one after another, scrolled.
 *
 * Two ways in, as with the popup sandbox:
 *  - `?widgets=1` on a dev or preview build — `src/index.ts` hands over before the session;
 *  - `(await widgetSandbox()).show()` over a running app; closing it puts the app back.
 *
 * While it is open, what widgets ask the client for (open a link, a t.me link, a haptic) is listed in the
 * panel instead of done — in the chat behind it too. Each widget keeps its Web Storage in memory until the
 * page reloads, as a message keeps it on disk. A mock bot plays the server and the bot around each widget's
 * state (mockBot.ts): the kind of message it is in (its flags), its requests and the bot's edits, a shared
 * widget's polls.
 */

// First import on purpose — see the note in popupSandbox/bootstrapState.ts.
import '@components/popupSandbox/bootstrapState';
import {createEffect, createMemo, createResource, createSignal, For, JSX, lazy, Show} from 'solid-js';
import {render} from 'solid-js/web';
import classNames from '@helpers/string/classNames';
import lastItem from '@helpers/array/lastItem';
import indexOfAndSplice from '@helpers/array/indexOfAndSplice';
import idleController from '@helpers/idleController';
import overlayCounter from '@helpers/overlayCounter';
import animationIntersector from '@components/animationIntersector';
import {appendToOverlayRoot, onAppWindowChange} from '@helpers/appWindow';
import createFocusTrap from '@helpers/dom/focusTrap';
import Modes from '@config/modes';
import appNavigationController, {NavigationItem} from '@components/appNavigationController';
import rootScope from '@lib/rootScope';
import {readStoredChoice, readStoredText, storeChoice} from '@helpers/storedChoice';
import {getSandboxHash, installSandboxEnvironment, setSandboxHash, setSandboxTheme, watchForEdits, watchSandboxHash} from '@components/popupSandbox/environment';
import SandboxPanel, {createStoryList, SandboxLog, SandboxSegmented, SandboxStory, StoryList} from '@components/popupSandbox/panel';
import {createCheckedStories} from '@components/popupSandbox/checkedStories';
import WidgetBlock, {WidgetScroller} from '@components/widgetSandbox/widgetBlock';
import {interceptWidgetActions} from '@lib/widgetSandbox/actions';
import type {BubbleGesture, WidgetAction} from 'widget-sandbox/host/widget-host';
import {createMemoryWidgetStorage} from '@lib/widgetSandbox/storage';
import {listWidgetFixtures, loadWidgetFixture} from '@lib/widgetSandbox/fixtures';
import {copyWidgetText} from '@lib/widgetSandbox/messageWidget';
import {
  createMockWidget,
  MOCK_BOT_MODES,
  MOCK_MESSAGE_KINDS,
  MOCK_WALLET_MODES,
  mockBotMode,
  mockBotRequests,
  mockMessageKind,
  mockWalletMode,
  mockWidgetContext,
  mockWidgetShared,
  setMockBotMode,
  setMockMessageKind,
  setMockWalletMode,
  setMockWidgetShared
} from '@lib/widgetSandbox/mockBot';
import {
  resolveWidgetSuspend,
  resolveWidgetTransport,
  setWidgetEngineCount,
  setWidgetRendererKind,
  setWidgetSuspend,
  setWidgetTransport,
  widgetEngineCount,
  widgetRendererKind,
  widgetSuspend,
  widgetTransport
} from '@lib/widgetSandbox/runtime';
import panelStyles from '@components/popupSandbox/sandbox.module.scss';
import styles from '@components/widgetSandbox/sandbox.module.scss';

/**
 * `one`: the widget picked in the list; `all`: every listed widget in a column, as the list filters them; `bench`:
 * the engines measured against each other (benchView.tsx).
 */
export type WidgetSandboxView = 'one' | 'all' | 'bench';

/** The panel's header and name, and the in-app sandbox's, as a dialog. */
const TITLE = 'Widget sandbox';
const VIEW_STORAGE_KEY = 'widget-sandbox-view';
/** The list's filter, kept with the view: the `all` view, back after a reload, starts only what it listed. */
const QUERY_STORAGE_KEY = 'widget-sandbox-query';
const TIME_STORAGE_KEY = 'widget-sandbox-time';
const MAX_ACTIONS = 50;
const MAX_ACTION_LENGTH = 160;

/** `showcase/05-recipe` is listed as `05-recipe` under `showcase`. */
const stories: SandboxStory[] = listWidgetFixtures().map((id) => {
  const slash = id.indexOf('/');
  return {id, title: id.slice(slash + 1), group: id.slice(0, slash)};
});

const checked = createCheckedStories('widget-sandbox-checked');

const [activeId, setActiveId] = createSignal('');
const [view, setViewSignal] = createSignal(readStoredChoice<WidgetSandboxView>(VIEW_STORAGE_KEY, ['one', 'all', 'bench'], 'one'));

/**
 * Where a message's time is: `corner`, over the widget's bottom corner, as the chat draws it for a widget with no caption
 * below it — the widget is told the band and the corner (the content safe area); `none`, elsewhere (a caption below).
 */
export type WidgetSandboxTime = 'none' | 'corner';
const [time, setTimeSignal] = createSignal(readStoredChoice<WidgetSandboxTime>(TIME_STORAGE_KEY, ['none', 'corner'], 'none'));

/** The widgets start again with the time there. */
export function setWidgetSandboxTime(value: WidgetSandboxTime) {
  storeChoice(TIME_STORAGE_KEY, value);
  setTimeSignal(value);
}
const [actions, setActions] = createSignal<string[]>([]);
/** What the client got from widgets: their actions, and the texts they copied. */
type LoggedAction = WidgetAction | {kind: 'copyText', text: string};
/** The same actions as the widget gave them, oldest first (the conformance runner reads them). */
let actionLog: LoggedAction[] = [];
/** The column's width in CSS px; a message's (30rem) when unset. */
const [stageWidth, setStageWidth] = createSignal<number>();

/** Only the standalone sandbox owns the URL; over a running app the hash belongs to the app. */
let ownsLocationHash = false;
let readyPromise: Promise<void>;
let showPromise: Promise<void>;
let closeOverlay: () => void;

export {actions};

/** What widgets asked for since the last call, oldest first; the log starts over. */
export function takeActionLog() {
  const log = actionLog;
  actionLog = [];
  return log;
}

/** The width the widgets are laid out at (the conformance set's reference is 390); none for a message's. */
export function setWidgetSandboxWidth(width?: number) {
  setStageWidth(width);
}

/** The light or dark variant of the shipped themes, as the panel's select would set it. */
export function setWidgetSandboxTheme(scheme: 'light' | 'dark') {
  setSandboxTheme(scheme === 'dark' ? 'night' : 'day');
}

const logAction = (action: LoggedAction) => {
  actionLog.push(action);
  const {kind, ...args} = action;
  let line = `${kind}(${JSON.stringify(Object.values(args)).slice(1, -1)})`;
  if(line.length > MAX_ACTION_LENGTH) line = line.slice(0, MAX_ACTION_LENGTH) + '…';
  setActions((list) => [line, ...list].slice(0, MAX_ACTIONS));
};

/** What the bubble took of a press (a finger's hold, swipe, scroll or back; a right click): the widget got pointercancel. */
const logBubbleGesture = ({action, gesture}: BubbleGesture) => {
  setActions((list) => [`bubble: ${action} (${gesture})`, ...list].slice(0, MAX_ACTIONS));
};

/**
 * A sandbox mounted: its list (as the search and the checked filter leave it) and its stage. One over the app may stand
 * over the page's own: the last one is on top, and the one beneath is again when it goes.
 */
type Mount = {list: StoryList<SandboxStory>, stage?: HTMLDivElement, /** What it is mounted in. */ root: HTMLElement};
const mounts: Mount[] = [];

/** In the `all` view: scrolls the stage on top to the widget. */
function scrollToWidget(id: string) {
  lastItem(mounts)?.stage?.querySelector(`[data-story-id="${CSS.escape(id)}"]`)?.scrollIntoView({block: 'start'});
}

export function setWidgetSandboxView(value: WidgetSandboxView) {
  storeChoice(VIEW_STORAGE_KEY, value);
  setViewSignal(value);
  // the picked widget stays in sight when its neighbours come in around it
  if(value === 'all' && activeId()) queueMicrotask(() => scrollToWidget(activeId()));
}

/** Picks the widget the stage shows, or in the `all` view scrolls to; the hash brings it back after a reload. */
function selectWidget(id: string) {
  if(!stories.some((story) => story.id === id)) throw new Error(`widgetSandbox: no widget "${id}"`);
  setActiveId(id);
  if(ownsLocationHash) setSandboxHash(id);
  if(view() === 'all') queueMicrotask(() => scrollToWidget(id));
}


/**
 * Shows the widget: picked in the list, by a script or by a typed hash. The Bench view shows none, and the `all` view
 * only what the list does: one the search or the checked filter leaves out is shown on its own, the filter kept.
 */
export function openWidget(id: string) {
  selectWidget(id);
  const listed = lastItem(mounts)?.list.visible().some((story) => story.id === id);
  if(view() === 'bench' || (view() === 'all' && !listed)) setWidgetSandboxView('one');
}

/** A mount's stage as the scrollable a widget's height change corrects (its anchored edge stays in place). */
const stageScroller = (mount: Mount): WidgetScroller => ({
  get container() {
    return mount.stage;
  },
  get scrollPosition() {
    return mount.stage.scrollTop;
  },
  setScrollPositionSilently: (value) => mount.stage.scrollTop = value
});

const copyText = (text: string) => {
  logAction({kind: 'copyText', text});
  copyWidgetText(text);
};

function StageWidget(props: {story: SandboxStory, scroller: WidgetScroller}) {
  const [html] = createResource(() => props.story.id, loadWidgetFixture);
  // a host's context is fixed for its life: another kind of message, sharing, or a wallet or none, is another widget;
  // and so is the time drawn over it or not (the safe area it is told at creation)
  const message = createMemo(() => ({kind: mockMessageKind(), shared: mockWidgetShared(), wallet: mockWalletMode() !== 'none', time: time()}), undefined, {
    equals: (a, b) => a.kind === b.kind && a.shared === b.shared && a.wallet === b.wallet && a.time === b.time
  });
  return (
    <section
      class={classNames(styles.Item, activeId() === props.story.id && styles.Active)}
      data-story-id={props.story.id}
    >
      <div class={styles.Caption}>
        {props.story.id}
        <Show when={mockWidgetContext().canQuery}> · 🌐 a tap may send data to the bot</Show>
      </div>
      <Show when={html() && message()} keyed>
        {(current) => {
          const mock = createMockWidget(props.story.id, html());
          let timeElement: HTMLDivElement;
          return (
            <div class={styles.Bubble}>
              {/* in the document before the block, which measures it as it starts */}
              <Show when={current.time === 'corner'}>
                <div ref={timeElement} class={styles.Time}>
                  <span class={styles.TimeInner}>12:34</span>
                </div>
              </Show>
              <WidgetBlock
                html={html()}
                widgetKey={'sandbox:' + props.story.id}
                storage={createMemoryWidgetStorage('sandbox:' + props.story.id)}
                onBubbleGesture={logBubbleGesture}
                data={mock.data()}
                context={mockWidgetContext(current.kind, current.wallet)}
                onRequest={mock.onRequest}
                onWallet={mock.onWallet}
                onCopyText={copyText}
                publicData={mock.publicData()}
                scrollable={props.scroller}
                timeOver={current.time === 'corner' ? () => timeElement : undefined}
              />
            </div>
          );
        }}
      </Show>
    </section>
  );
}

const BenchView = lazy(() => import('@components/widgetSandbox/benchView'));

function Stage(props: {mount: Mount}) {
  const active = createMemo(() => stories.find((story) => story.id === activeId()));
  const empty = <div class={styles.Empty}>Nothing to show: pick a widget, or loosen the filter.</div>;
  const scroller = stageScroller(props.mount);

  return (
    <div class={styles.Stage} ref={(element) => props.mount.stage = element}>
      <Show when={view() === 'bench'} fallback={<WidgetColumn list={props.mount.list} scroller={scroller} active={active} empty={empty} />}>
        <BenchView />
      </Show>
    </div>
  );
}

function WidgetColumn(props: {list: StoryList<SandboxStory>, scroller: WidgetScroller, active: () => SandboxStory, empty: JSX.Element}) {
  return (
    <>
      {/* where the chat's input would hold the focus: a widget must never take it (docs/integration.md, "Input") */}
      <input class={styles.ChatInput} type="text" aria-label="Chat input stand-in" />
      <div class={styles.Column} style={{width: stageWidth() ? `${stageWidth()}px` : undefined}}>
        <Show
          when={view() === 'all'}
          fallback={
            <Show when={props.active()} keyed fallback={props.empty}>
              {(story) => <StageWidget story={story} scroller={props.scroller} />}
            </Show>
          }
        >
          <For each={props.list.visible()} fallback={props.empty}>
            {(story) => <StageWidget story={story} scroller={props.scroller} />}
          </For>
        </Show>
      </div>
    </>
  );
}

/**
 * Over a running app the sandbox covers it as a popup does, until what this returns: the chat beneath takes none of its
 * keys (Enter on a focused button would send the chat's draft, a letter would go to its composer, an arrow would edit a
 * message), the app's shortcuts are off, and Escape closes the sandbox.
 */
function coverApp(container: HTMLElement, close: () => void) {
  const navigationItem: NavigationItem = {
    type: 'popup',
    noBlurOnPop: Modes.a11y,
    onPop: () => {
      close();
    }
  };
  appNavigationController.pushItem(navigationItem);
  overlayCounter.isOverlayActive = true;
  const focusTrap = createFocusTrap(container);
  // in the window it is shown in (the app's Document PiP one, when the app is there)
  if(!Modes.a11y) (container.ownerDocument.activeElement as HTMLElement)?.blur?.();
  focusTrap.activate();
  // the app moving between the tab and its Document PiP window leaves it where the app no longer is: it goes, the
  // overlay with it, as a popup would with its window
  const stopFollowingWindow = onAppWindowChange(() => close());
  // an account switch (another account's notification clicked) drops what Escape and Back do to it without calling it
  // (appNavigationController.resetForAccountSwitch): it goes with the account it was opened over, as the add-account
  // screens do
  const onAccountSwitched = () => close();
  rootScope.addEventListener('account_switched', onAccountSwitched);
  // what it stands over is out of sight while it is there: nothing of it plays (the chat's widgets, its stickers), the
  // sandbox's own widgets do
  const releaseAnimations = [...container.parentElement.children]
  .filter((element) => element !== container)
  .map((element) => animationIntersector.holdUnder(element));
  return () => {
    releaseAnimations.forEach((release) => release());
    stopFollowingWindow();
    rootScope.removeEventListener('account_switched', onAccountSwitched);
    focusTrap.deactivate();
    overlayCounter.isOverlayActive = false;
    appNavigationController.removeItem(navigationItem);
  };
}

/**
 * Mounts the stage and the panel in the window the app is shown in (the tab, or its Document PiP window). `onClose` is
 * what turns them into a closeable overlay over a running app.
 */
function mountSandbox(onClose?: () => void) {
  const container = appendToOverlayRoot();
  const root = container.parentElement;
  if(onClose) {
    // over the app it is a dialog, its content the user's while it is there (the page's own sandbox is the page)
    container.setAttribute('role', 'dialog');
    container.setAttribute('aria-modal', 'true');
    container.setAttribute('aria-label', TITLE);
  }

  const stopIntercepting = interceptWidgetActions(logAction);

  const mount: Mount = {list: undefined, root};
  mounts.push(mount);
  root.classList.add(styles.Open);
  const dispose = render(() => {
    const list = mount.list = createStoryList(() => stories, checked);
    // before the stage lists anything
    list.setQuery(readStoredText(QUERY_STORAGE_KEY));
    createEffect(() => storeChoice(QUERY_STORAGE_KEY, list.query()));
    return (
      <>
        <Stage mount={mount} />
        <SandboxPanel
          title={TITLE}
          searchPlaceholder="Filter widgets…"
          list={list}
          checked={checked}
          onOpen={(story) => openWidget(story.id)}
          activeId={activeId}
          onClose={onClose}
          onWidth={(width) => container.style.setProperty('--sandbox-panel-width', width + 'px')}
          canSetTheme={!onClose}
          footer={
            <>
              <SandboxLog title="Requests to the bot" entries={mockBotRequests}>
                {(request) => {
                  const kind = request.kind === 'wallet' ? ' + wallet' : request.kind ? ` (wallet.${request.kind})` : '';
                  return `${request.at} ${request.widget}: ${request.data}${kind} → ${request.outcome ?? '…'}`;
                }}
              </SandboxLog>
              <SandboxLog title="Actions (not done here)" entries={actions}>
                {(call) => call}
              </SandboxLog>
            </>
          }
        >
          <SandboxSegmented
            label="View"
            options={[{id: 'one', label: 'One'}, {id: 'all', label: 'All in a row'}, {id: 'bench', label: 'Bench'}]}
            value={view}
            onChange={setWidgetSandboxView}
          />
          <SandboxSegmented
            label="Engine"
            options={[
              {id: 'auto', label: `auto · ${resolveWidgetTransport('auto')}`},
              {id: 'worker', label: 'worker'},
              {id: 'inline', label: 'inline'},
              {id: 'sab', label: 'sab'},
              {id: 'frame', label: 'frame'}
            ]}
            value={widgetTransport}
            onChange={setWidgetTransport}
          />
          <Show when={resolveWidgetTransport(widgetTransport()) === 'sab'}>
            <SandboxSegmented
              label="Renderer"
              options={[{id: 'iframe', label: 'iframe'}, {id: 'shadow', label: 'shadow'}]}
              value={widgetRendererKind}
              onChange={setWidgetRendererKind}
            />
          </Show>
          <Show when={resolveWidgetTransport(widgetTransport()) === 'worker'}>
            <SandboxSegmented
              label="Suspension"
              options={[
                {id: 'auto', label: `auto · ${resolveWidgetSuspend('auto')}`},
                {id: 'jspi', label: 'jspi'},
                {id: 'asyncify', label: 'asyncify'}
              ]}
              value={widgetSuspend}
              onChange={setWidgetSuspend}
            />
            <SandboxSegmented
              label="Engines"
              options={[{id: 'auto', label: 'auto'}, {id: '1', label: '1'}, {id: '2', label: '2'}]}
              value={widgetEngineCount}
              onChange={setWidgetEngineCount}
            />
            <Show when={widgetSuspend() === 'jspi' && resolveWidgetSuspend('jspi') !== 'jspi'}>
              <div class={panelStyles.Notice}>This browser has no JSPI: jspi falls back to asyncify.</div>
            </Show>
          </Show>
          <Show when={widgetTransport() === 'sab' && resolveWidgetTransport('sab') !== 'sab'}>
            <div class={panelStyles.Notice}>This page is not cross-origin isolated: sab falls back to frame.</div>
          </Show>
          <div class={panelStyles.Notice}>
            worker: every widget's engine in one worker, on a shadow root; inline: the engine in the page, on a shadow
            root; sab: a worker per widget; frame: in the renderer's iframe. Suspension: how a worker widget waits for a
            layout answer, JSPI or the asyncify build (Firefox's, about twice as slow). Engines: auto takes a second
            worker past four widgets on asyncify only.
          </div>
          {/* two rows: the originals, then the copies and the preview */}
          <SandboxSegmented
            label="Message: an original"
            options={MOCK_MESSAGE_KINDS.slice(0, 4).map((id) => ({id, label: id}))}
            value={mockMessageKind}
            onChange={setMockMessageKind}
          />
          <SandboxSegmented
            label="Message: a copy or a preview"
            options={MOCK_MESSAGE_KINDS.slice(4).map((id) => ({id, label: id}))}
            value={mockMessageKind}
            onChange={setMockMessageKind}
          />
          <SandboxSegmented
            label="Bot answers"
            options={MOCK_BOT_MODES.map((id) => ({id, label: id === 'bot' ? 'as the bot' : id}))}
            value={mockBotMode}
            onChange={setMockBotMode}
          />
          <SandboxSegmented
            label="Wallet"
            options={MOCK_WALLET_MODES.map((id) => ({id, label: id === 'confirm' ? 'confirms' : id}))}
            value={mockWalletMode}
            onChange={setMockWalletMode}
          />
          <SandboxSegmented
            label="Shared widget"
            options={[{id: 'on', label: 'widget_id'}, {id: 'off', label: 'static'}]}
            value={() => mockWidgetShared() ? 'on' : 'off'}
            onChange={(value) => setMockWidgetShared(value === 'on')}
          />
          <SandboxSegmented
            label="Time"
            options={[{id: 'none', label: 'below'}, {id: 'corner', label: 'over the corner'}]}
            value={time}
            onChange={setWidgetSandboxTime}
          />
          <div class={panelStyles.Notice}>
            Message: the kind of message the widget is in — its flags (can_query, background_query, is_copy), the chat
            type; preview is an inline result before it is sent. The mock bot answers the interactive widgets'
            requests (corpus/interactive names its bot) and edits their state; a shared widget that watches its shared
            state is polled every 5 s. Wallet: whether the user has Gram Wallet (TelegramWidget.wallet), and how its
            window ends — confirmed (the bot gets a made-up outcome), declined (REJECTED), refused by the wallet
            (BAD_REQUEST); none starts the widgets again without it. Time over the corner: as the chat draws it for a widget with no caption below
            it, and the widget is told the band and the corner it takes (the content safe area: env(safe-area-inset-*),
            contentSafeAreaInset; safe-area/ shows what it gets).
          </div>
          <Show when={onClose}>
            <div class={panelStyles.Notice}>
              Widgets' actions (links, haptics) are listed below instead of done while this is open, in the chat too.
            </div>
          </Show>
        </SandboxPanel>
      </>
    );
  }, container);
  // once it has its controls: with the a11y layer the focus goes to the first of them
  const uncover = onClose && coverApp(container, onClose);

  return () => {
    uncover?.();
    stopIntercepting();
    dispose();
    indexOfAndSplice(mounts, mount);
    if(!mounts.some((other) => other.root === root)) root.classList.remove(styles.Open);
    container.remove();
  };
}

/** The `?widgets=1` entry: the sandbox owns the page, on the popup sandbox's mock environment. */
export function startWidgetSandbox() {
  return readyPromise ??= (async() => {
    ownsLocationHash = true;
    watchForEdits();
    await installSandboxEnvironment();
    // The app counts as idle from load until the first mouse move (so a reload does not mark the user
    // online), and widgets start only when not idle. Nobody opens this page to leave it, and there is no
    // session to report.
    idleController.isIdle = false;
    mountSandbox();

    // Deep link: ?widgets=1#showcase/05-recipe, in the view the sandbox was left in; a typed hash shows the widget it
    // names (`watchSandboxHash`)
    const isWidget = (id: string) => stories.some((story) => story.id === id);
    watchSandboxHash((id) => {
      if(id !== activeId() && isWidget(id)) openWidget(id);
    });
    const id = getSandboxHash();
    selectWidget(isWidget(id) ? id : stories[0].id);
  })();
}

/** The in-app entry: the sandbox over whatever is on screen, closeable. The app keeps its managers. */
export function showWidgetSandbox() {
  return showPromise ??= (async() => {
    closeOverlay = mountSandbox(hideWidgetSandbox);
    if(!activeId()) selectWidget(stories[0].id);
  })();
}

export function hideWidgetSandbox() {
  showPromise = undefined;
  closeOverlay?.();
  closeOverlay = undefined;
}
