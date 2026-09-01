/*
 * Popup sandbox — open any popup with mock data, by click or from a script.
 *
 * Two ways in:
 *  - `?popups=1` on a dev/preview build. `src/index.ts` hands over before the session, the MTProto
 *    connection and the auth flow are touched, so nothing reaches Telegram at all.
 *  - `showPopupSandbox()` from anywhere inside a running app — including a signed-in one. The panel
 *    opens over the app and closing it puts the real managers back. Signed in, it offers a second
 *    data source: the session's own dialogs, messages and gifts, run against the real managers with
 *    writes held back (`liveManagers.ts`). On fixtures nothing is written anywhere — the mocks
 *    swallow every write, and the fixture peers are merged into the mirrors rather than replacing
 *    them — but the app behind is reading them too, so treat its chat list as decoration until the
 *    panel is closed.
 *
 * For automation, `window.popupSandbox` exposes the same registry the panel renders:
 *
 *   await popupSandbox.ready();
 *   for(const {id} of popupSandbox.list()) await popupSandbox.open(id);
 */

// First import on purpose — see the note in `bootstrapState.ts`.
import './bootstrapState';
import {createSignal} from 'solid-js';
import {render} from 'solid-js/web';
import rootScope from '@lib/rootScope';
import PopupElement from '@components/popups';
import PopupElementTsx from '@components/popups/indexTsx';
import PopupSandboxPanel from './sandbox';
import {installSandboxEnvironment, getLiveManagers, getMockManagers, useLiveManagers, useMockManagers} from './environment';
import {isLiveSession} from './bootstrapState';
import {createLiveContext, mockContext, PopupStoryContext, StoryPeerKind} from './context';
import {getStories, getStory, PopupStory} from './registry';
import './stories';

/** Fixtures, or the signed-in session's own data. `live` only exists inside a live session. */
export type SandboxDataSource = 'fixtures' | 'live';

const [activeId, setActiveId] = createSignal('');
const [unhandled, setUnhandled] = createSignal<string[]>([]);
const [dataSource, setDataSourceSignal] = createSignal<SandboxDataSource>('fixtures');
const [liveGaps, setLiveGaps] = createSignal<StoryPeerKind[]>([]);
const [allowWrites, setAllowWritesSignal] = createSignal(false);
const [droppedOverrides, setDroppedOverrides] = createSignal(false);

let liveContext: PopupStoryContext;
let restoreManagers: () => void;

let revertStoryManagers: () => void;
let readyPromise: Promise<void>;
let showPromise: Promise<void>;
let closePanel: () => void;

export function closeAllPopups() {
  // Both popup implementations keep their own live list; a story may have opened either.
  for(const popup of [...((PopupElement as any).POPUPS as any[] || [])]) {
    popup.forceHide?.();
  }

  for(const popup of [...(PopupElementTsx.POPUPS || [])]) {
    popup.destroy?.();
  }
}

/** Fixtures whenever the story has no live equivalent, otherwise whatever the panel is set to. */
function contextFor(story: PopupStory) {
  return dataSource() === 'live' && !story.fixtureOnly ? liveContext : mockContext;
}

const trackCall = (set: typeof setUnhandled) => ({manager, method}: {manager: string, method: string}) => {
  const name = `${manager}.${method}`;
  set((names) => (names.includes(name) ? names : [...names, name]));
};

export async function openStory(story: PopupStory) {
  await installSandboxEnvironment();

  if(dataSource() === 'live' && !story.fixtureOnly) await refreshLiveContext();

  const ctx = contextFor(story);
  const live = ctx.isLive;

  closeAllPopups();
  revertStoryManagers?.();
  revertStoryManagers = undefined;

  // Point the popup layer at whichever managers this story needs. A live story runs against the
  // real ones, so its fixture overrides are dropped — they would only hide the real answers.
  restoreManagers?.();
  restoreManagers = live ? useLiveManagers(allowWrites()) : useMockManagers();

  setUnhandled([]);
  // Popups keep calling managers long after `open()` resolves (async constructors, lazy tabs), so
  // the list grows as they do instead of being snapshotted once.
  setDroppedOverrides(live && !!story.managers);
  if(live) {
    getLiveManagers().onBlocked = trackCall(setUnhandled);
  } else {
    const controller = getMockManagers();
    const handlers = typeof(story.managers) === 'function' ? story.managers(ctx) : story.managers;
    revertStoryManagers = handlers && controller.override(handlers);
    controller.onUnhandled = trackCall(setUnhandled);
  }

  setActiveId(story.id);
  await story.open(ctx);
}

/**
 * Re-reads the session: which chat is open, what the dialog list holds, which gifts are owned. Cheap
 * (the dialogs come from the manager's cache) and done before every live story, because the user is
 * expected to switch chats WHILE the panel is open — that is the point of running it over the app.
 */
async function refreshLiveContext() {
  const resolved = await createLiveContext();
  liveContext = resolved.context;
  setLiveGaps(resolved.gaps);
  return liveContext;
}

/** Switches what the stories are built from; resolving a live context needs the session's dialogs. */
export async function setDataSource(source: SandboxDataSource) {
  if(source === 'live') {
    if(!isLiveSession || !rootScope.myId) throw new Error('popupSandbox: live data needs a signed-in session');
    await refreshLiveContext();
  }

  setDataSourceSignal(source);
}

export function setAllowWrites(value: boolean) {
  setAllowWritesSignal(value);
  if(dataSource() === 'live') getLiveManagers().allowWrites = value;
}

/** Mounts the panel. `onClose` is what turns it into a closeable overlay over a running app. */
async function mountPanel(onClose?: () => void) {
  const restoreOnUninstall = await installSandboxEnvironment();

  const container = document.createElement('div');
  document.body.append(container);
  const dispose = render(() => PopupSandboxPanel({
    onOpen: (story) => { openStory(story); },
    onClose,
    activeId,
    unhandled,
    // Real data needs an actual account behind it — a login page is a live session with none.
    canGoLive: isLiveSession && !!rootScope.myId,
    canSetTheme: !isLiveSession,
    dataSource,
    setDataSource: (source: SandboxDataSource) => { setDataSource(source); },
    liveGaps,
    droppedOverrides,
    allowWrites,
    setAllowWrites
  }), container);

  return () => {
    closeAllPopups();
    revertStoryManagers?.();
    revertStoryManagers = undefined;
    restoreManagers?.();
    restoreManagers = undefined;
    restoreOnUninstall();
    dispose();
    container.remove();
  };
}

/** The `?popups=1` entry: the panel owns the page and there is no app to go back to. */
export function startPopupSandbox() {
  return readyPromise ??= (async() => {
    const close = await mountPanel();

    // Deep-link straight into a story: ?popups=1#deleteMessages/private. Editing the hash on an
    // open sandbox switches stories too — a same-document hash change never reloads the page.
    const openFromHash = () => {
      const story = getStory(decodeURIComponent(location.hash.slice(1)));
      return story && openStory(story);
    };

    window.addEventListener('hashchange', openFromHash);
    closePanel = () => {
      window.removeEventListener('hashchange', openFromHash);
      close();
    };

    await openFromHash();
  })();
}

/** The in-app entry: opens the panel over whatever is on screen, closeable. */
export function showPopupSandbox() {
  // The guard has to be in place before the first await — two calls in the same tick would
  // otherwise both get past it and mount a panel each.
  return showPromise ??= (async() => {
    const close = await mountPanel(() => {
      showPromise = undefined;
      closePanel = undefined;
      close();
    });

    closePanel = close;
  })();
}

/** Closes an in-app panel; the standalone one owns the page and has nothing to go back to. */
export function hidePopupSandbox() {
  showPromise = undefined;
  closePanel?.();
  closePanel = undefined;
}

export const popupSandbox = {
  ready: () => startPopupSandbox(),
  show: showPopupSandbox,
  hide: hidePopupSandbox,
  list: () => getStories().map(({id, title, group}) => ({id, title, group})),
  open: async(id: string) => {
    const story = getStory(id);
    if(!story) throw new Error(`popupSandbox: unknown story "${id}"`);
    await openStory(story);
  },
  closePopups: closeAllPopups,
  /** 'fixtures' | 'live' — live needs a signed-in session. */
  setDataSource,
  setAllowWrites,
  /** Every manager call the popups made, for assertions. Follows the active data source. */
  calls: () => (dataSource() === 'live' ? getLiveManagers()?.calls : getMockManagers().calls) ?? [],
  /**
   * Fixtures: calls no handler answered — what a half-rendered popup is still missing.
   * Live: writes the guard held back — what a confirm button would have done for real.
   */
  unhandled: () => (dataSource() === 'live' ? getLiveManagers()?.blocked : getMockManagers().unhandled) ?? []
};

(self as any).popupSandbox = popupSandbox;
