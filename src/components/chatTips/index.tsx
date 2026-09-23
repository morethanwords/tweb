import {Component, createEffect, createSignal, For, onCleanup, Show} from 'solid-js';
import {Dynamic, Portal, render} from 'solid-js/web';

import IS_TOUCH_SUPPORTED from '@environment/touchSupport';
import {IS_MOBILE_SAFARI} from '@environment/userAgent';
import {useMediaSizes} from '@helpers/mediaSizes';
import classNames from '@helpers/string/classNames';
import {subscribeOn} from '@helpers/solid/subscribeOn';
import {i18n} from '@lib/langPack';
import {useHotReloadGuard} from '@lib/solidjs/hotReloadGuard';
import SolidJSHotReloadGuardProvider from '@lib/solidjs/hotReloadGuardProvider';
import {useAppSettings} from '@stores/appSettings';

import animationIntersector from '@components/animationIntersector';
import Button from '@components/buttonTsx';
import Scrollable from '@components/scrollable2';

import AppearanceTipCard from '@components/chatTips/appearanceCard';
import ChatsTipCard from '@components/chatTips/chatsCard';
import StickersTipCard from '@components/chatTips/stickersCard';
import {TipReadyProvider} from '@components/chatTips/tipCard';
import styles from '@components/chatTips/chatTips.module.scss';

/**
 * Tip cards for the empty chat column — what the middle column shows while no chat is open
 * (nothing but the wallpaper, before this), after the macOS client's `WidgetController`
 * (Telegram-Mac/WidgetController.swift). One tip at a time, centred, stepped through with the
 * Previous / Next pills under it. Each card carries the real control it talks about, so the app
 * is configurable without ever leaving the empty screen:
 *
 * - **Appearance** — light/dark/system plus the cloud-theme thumbnails.
 * - **Stickers** — the "Suggest Stickers by Emoji" mode plus a few trending packs.
 * - **Chats** — the peers to jump back into, filtered by popular / recently searched / recently
 *   closed (see `appUsersManager.pushRecentlyClosedChat`).
 *
 * The deck collapses to a service pill with the corner toggle, and stays collapsed (and on the tip
 * it was left on) across reopens.
 */

// Order follows macOS' `WidgetController.viewDidLoad` — Appearance, Stickers, then Recent Peers.
// (Its App Icon widget in between has no tweb equivalent.)
const TIPS: Component[] = [AppearanceTipCard, StickersTipCard, ChatsTipCard];

/** How far a waiting card sits to the side, in px. macOS slides its widgets by 50. */
const SLIDE = 50;

/**
 * Animation group for everything the cards play, so it can be parked wholesale while a chat is
 * open — the deck stays mounted and ready, but its stickers have no business looping behind a
 * conversation.
 */
const ANIMATION_GROUP = 'CHAT-TIPS';

/** Show the deck anyway if the card that is up never reports in (a failed fetch, say). */
const REVEAL_TIMEOUT = 2000;

/**
 * A single-column layout — a handheld, or the width at which the chat list turns into a drawer
 * over the chat — has no empty column to fill: the chat list itself is the empty state there, and
 * the chat column only ever shows up with a chat in it. So the deck isn't drawn at all, not just
 * hidden: nothing mounts, nothing is fetched, until the window is wide enough for two columns.
 */
function ChatTips() {
  const mediaSizes = useMediaSizes();
  return (
    <Show when={!mediaSizes.isLessThanFloatingLeftSidebar}>
      <ChatTipsDeck />
    </Show>
  );
}

function ChatTipsDeck() {
  // Through the guard, not `useCurrentPeerId`: that hook imports `appImManager` statically, and a
  // hot update hands the re-evaluated module a second, uninitialised copy of the singleton whose
  // `chat` is undefined — the render then throws and the deck disappears.
  const {appImManager, rootScope, themeController} = useHotReloadGuard();
  const [peerId, setPeerId] = createSignal(appImManager.chat.peerId);
  subscribeOn(appImManager)('peer_changed', (chat) => setPeerId(chat.peerId));

  const [appSettings, setAppSettings] = useAppSettings();

  // The selected tip and the collapsed state are persisted, so reopening the empty column — or the
  // app — comes back to the tip you left on instead of rewinding to the first.
  const index = () => Math.min(appSettings.chatTips?.index ?? 0, TIPS.length - 1);
  const hidden = () => !!appSettings.chatTips?.hidden;

  // Cyclic — with three tips and two labelled buttons, wrapping around beats dead ends.
  const step = (by: number) =>
    setAppSettings('chatTips', 'index', (index() + by + TIPS.length) % TIPS.length);

  // Where a card waits while it isn't the one showing: its side is its cyclic position relative to
  // the current tip — next waits on the right, previous on the left. That makes a step animate
  // correctly both ways without tracking which way we went, because the card being left behind
  // becomes "previous" and leaves to the left while the arriving one was "next" and comes in from
  // the right (mirrored when stepping back).
  const offsetOf = (i: number) =>
    (i - index() + TIPS.length) % TIPS.length === 1 ? `${SLIDE}px` : `${-SLIDE}px`;

  const shown = () => !peerId();

  // The deck stays folded until the card that is up has its content, then springs in with the same
  // animation the collapse toggle plays — so the column never shows a card assembling itself.
  // One-way: stepping on to a card that is still loading keeps the deck up rather than folding it.
  const [revealed, setRevealed] = createSignal(false);
  const onTipReady = (i: number) => i === index() && setRevealed(true);
  const revealTimeout = setTimeout(() => setRevealed(true), REVEAL_TIMEOUT);
  onCleanup(() => clearTimeout(revealTimeout));

  const folded = () => hidden() || !revealed();

  // Park the cards' animations whenever they aren't on screen. `lockGroup` alone only stops new
  // playback — the stickers already running have to be paused explicitly, since the intersection
  // observer still counts them as on-screen (the deck is hidden with `visibility`, not unmounted).
  // `unlockGroup` re-checks the group on its own and picks them back up.
  createEffect(() => {
    if(shown() && !folded()) {
      animationIntersector.unlockGroup(ANIMATION_GROUP);
      // Re-observing is what makes the intersector recompute visibility: a player paused by hand
      // stays out of its `visible` set, and `unlockGroup`'s own re-check won't resume it.
      animationIntersector.refreshGroup(ANIMATION_GROUP);
    } else {
      animationIntersector.lockGroup(ANIMATION_GROUP);
      animationIntersector.checkAnimations(true, ANIMATION_GROUP);
    }
  });
  onCleanup(() => animationIntersector.unlockGroup(ANIMATION_GROUP));

  // The pill, the nav pills and the corner toggle are drawn like service messages, so they follow
  // `--message-highlighting-color` — which a chat with a custom theme republishes on the document
  // root, repainting them in that chat's colour the instant it opens. Give each of these root
  // elements its own copy that shadows the document's. Called with no `hsla`, the helper resolves
  // the GLOBAL theme's own service colour rather than reading the root, so it can't pick up a
  // chat's value and there is no moment at which sampling would be wrong. The toggle needs its
  // own call — it is portalled to the body, so it inherits nothing from the host.
  const pinServiceColor = (el: HTMLElement) => {
    const sync = () => themeController.applyHighlightingColor({element: el});

    sync();
    subscribeOn(rootScope)('theme_changed', sync);
  };

  // Opening a chat hides the deck but never tears it down: a rebuild would refetch and re-wrap
  // every sticker, and closing the chat would show the cards assembling themselves again. They
  // stay mounted and ready, just not painted.
  return (
    <div ref={pinServiceColor} class={classNames(styles.host, !shown() && styles.hostHidden)}>
      {/* Portalled to the body and fixed, the way the auth flow pins its corner buttons.
          `#column-center` carries a translateX that centres the chat beside the sidebar, so its
          box overflows the viewport on the right — anything pinned to that box's own corner
          lands off-screen. */}
      <Show when={shown()}>
        <Portal mount={document.body}>
          <Button.Icon
            ref={pinServiceColor}
            class={styles.toggleButton}
            icon={hidden() ? 'lamp_filled' : 'close'}
            onClick={() => setAppSettings('chatTips', 'hidden', !hidden())}
          />
        </Portal>
      </Show>
      <Scrollable
        class={classNames(
          styles.scrollable,
          (!IS_TOUCH_SUPPORTED || IS_MOBILE_SAFARI) && 'no-scrollbar'
        )}
      >
        <div class={styles.placeholder} />
        <div class={classNames(styles.carousel, folded() && styles.carouselHidden)}>
          {/* All three cards stay mounted and cross-fade in place, the way macOS keeps its
              widget controllers alive and only swaps which view sits in the hierarchy. That is
              what stops the content flashing: each card loads once, when the tips first
              appear, so stepping to it shows finished content instead of rebuilding it. Every
              card is the same fixed size, so they can simply stack.
              It also rules out a whole class of bug — nothing mounts or unmounts on a step, so
              a transition that never finishes (a page that isn't compositing never fires
              `transitionend`) can't leave a dead card on top swallowing clicks. */}
          <div class={styles.stage}>
            <For each={TIPS}>{(Tip, i) => (
              <div
                class={classNames(styles.slot, i() === index() && styles.slotActive)}
                style={{'--tip-slide': offsetOf(i())}}
              >
                <TipReadyProvider value={() => onTipReady(i())}>
                  <Dynamic component={Tip} />
                </TipReadyProvider>
              </div>
            )}</For>
          </div>
          <div class={styles.nav}>
            <Button
              class={styles.navButton}
              icon="arrow_prev"
              onClick={() => step(-1)}
            >
              {i18n('ChatTips.PreviousTip')}
            </Button>
            <Button
              class={styles.navButton}
              iconAfter="arrow_next"
              onClick={() => step(1)}
            >
              {i18n('ChatTips.NextTip')}
            </Button>
          </div>
        </div>
        <div class={styles.placeholder} />
      </Scrollable>
      {/* Always mounted, centred under the deck, and cross-faded against it — that's how macOS
          handles the same label, and it means toggling animates rather than swapping one
          centred block for another. */}
      <div class={classNames(styles.selectChat, hidden() && styles.selectChatShown)}>
        <span class={styles.selectChatPill}>{i18n('EmptyPeer.Description')}</span>
      </div>
    </div>
  );
}

/**
 * Marks the mount so a later instance of this module can find and clear it. Deliberately a plain
 * class: the CSS-module one is rehashed every time the stylesheet changes, which is exactly one
 * of the cases this has to survive.
 */
const MOUNT_CLASS = 'chat-tips-mount';

type MountElement = HTMLElement & {disposeChatTips?: () => void};

/**
 * Mounts the tips right above the chat stack: `anchor` is `appImManager.chatsContainer`, so the
 * cards paint over the empty chat but stay under the call / audio plates appended after it.
 */
export function renderChatTips(anchor: HTMLElement) {
  // Clear any earlier mount by looking at the DOM rather than at module state. A hot update can
  // leave several instances of this module alive at once — each with its own module scope, so
  // each would only ever see (and clean up) its own mount, and the leftovers pile up.
  document.querySelectorAll<MountElement>('.' + MOUNT_CLASS).forEach((el) => {
    el.disposeChatTips?.();
    el.remove();
  });

  const container: MountElement = document.createElement('div');
  container.classList.add(MOUNT_CLASS, styles.mount);
  anchor.after(container);

  container.disposeChatTips = render(() => (
    <SolidJSHotReloadGuardProvider>
      <ChatTips />
    </SolidJSHotReloadGuardProvider>
  ), container);

  if(import.meta.hot) {
    import.meta.hot.data.anchor = anchor;
  }
}

if(import.meta.hot) {
  import.meta.hot.accept();

  // `appImManager` calls `renderChatTips` once, at start-up. A hot update of this module — or of
  // any card or of the stylesheet, which all propagate up to here — re-evaluates the file with
  // nobody left to mount it, and the deck just vanishes. Re-mount onto the anchor the previous
  // instance recorded.
  const anchor = import.meta.hot.data.anchor as HTMLElement | undefined;
  if(anchor?.isConnected) {
    renderChatTips(anchor);
  }
}
