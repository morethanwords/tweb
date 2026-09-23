import {createEffect, createMemo, createResource, createRoot, createSignal, on, onCleanup, Show} from 'solid-js';

import anchorCallback from '@helpers/dom/anchorCallback';
import createMiddleware from '@helpers/solid/createMiddleware';
import classNames from '@helpers/string/classNames';
import {IS_APPLE} from '@environment/userAgent';
import {i18n, LangPackKey} from '@lib/langPack';
import {useHotReloadGuard} from '@lib/solidjs/hotReloadGuard';
import type {MyTopPeer} from '@appManagers/appUsersManager';
import {useAppState} from '@stores/appState';

import appDialogsManager from '@lib/appDialogsManager';
import {renderTopPeerItem} from '@components/topPeersList';

import TipCard, {TipCardButton, useTipReady} from '@components/chatTips/tipCard';
import styles from '@components/chatTips/chatTips.module.scss';

/** macOS lays the peers out as a 4×2 grid inside the content slot. */
const PEERS_LIMIT = 8;

type ChatsFilter = 'popular' | 'recent' | 'closed';

const FILTERS: [ChatsFilter, Icon, LangPackKey][] = [
  ['popular', 'newprivate', 'ChatTips.Chats.Popular'],
  ['recent', 'search', 'ChatTips.Chats.RecentSearch'],
  ['closed', 'close', 'ChatTips.Chats.RecentlyClosed']
];

// Module-level so the picked filter is shared by the card wherever it is re-created, and isn't
// reset by a hot reload of this file.
const [filter, setFilter] = createRoot(() => createSignal<ChatsFilter>('popular'));

/**
 * Chats tip — macOS' `WidgetRecentPeersController`: a filter row over a 4×2 grid of peers to jump
 * back into. macOS filters by Popular / Recent / Both; here the three are the ones talked to most
 * (top peers), the ones last searched for, and the ones whose chat was last closed (recorded by
 * `appUsersManager.pushRecentlyClosedChat`).
 */
export default function ChatsTipCard() {
  const {appSidebarLeft, rootScope} = useHotReloadGuard();
  const [appState] = useAppState();

  // Top peers are a manager fetch (state cache, refreshed daily); the other two are mirrored
  // state, so they update themselves as chats are searched for and closed. Reading a REJECTED
  // resource re-throws inside the memo below, so the fetch fails soft — a FLOOD_WAIT on
  // `contacts.getTopPeers` should cost this card its Popular list, nothing more.
  const [topPeers] = createResource(() => rootScope.managers.appUsersManager
    .getTopPeers('correspondents')
    .catch(() => [] as MyTopPeer[]));

  const listOf = (value: ChatsFilter): PeerId[] => value === 'popular' ?
    (topPeers()?.map(({id}) => id) ?? []) :
    value === 'recent' ?
      (appState.recentSearch ?? []) :
      (appState.recentlyClosedChats ?? []);

  // macOS only offers a filter that has something behind it, and moves off one that empties out.
  const available = createMemo(() => FILTERS.filter(([value]) => listOf(value).length));
  const current = createMemo<ChatsFilter>(() => {
    const list = available();
    return list.some(([value]) => value === filter()) ? filter() : list[0]?.[0] ?? filter();
  });

  const peerIds = createMemo<PeerId[]>(() => listOf(current()).slice(0, PEERS_LIMIT));

  // Don't flash "nothing here" while the top-peer fetch is still in flight — the other two lists
  // are mirrored state and are already there.
  const isEmpty = () => !peerIds().length && !topPeers.loading;

  // Ready as soon as the one fetch this card makes has settled, empty list or not.
  const markReady = useTipReady();
  createEffect(() => !topPeers.loading && markReady());

  const buttons = (): TipCardButton[] => available().map(([value, icon, langKey]) => ({
    icon,
    text: i18n(langKey),
    selected: current() === value,
    onClick: () => setFilter(value)
  }));

  // The tiles are the left sidebar search's own "people" items, built by the shared renderer so
  // avatar, title and ripple match it exactly. Each pass gets a fresh middleware so the previous
  // batch is torn down.
  let peersEl!: HTMLDivElement;

  // Opening a peer is the list's job, not the tile's: `addDialogNew` builds the row, and it is
  // `setListClickListener` on the container that turns a press into `setPeer` (and an avatar with
  // a stories ring into the stories viewer). The search's groups get this from `createSearchGroup`;
  // the grid is ours, so wire it here — on the ref rather than in `onMount`, because the grid only
  // exists once there is something to put in it, the empty state replaces it.
  const bindPeersList = (el: HTMLDivElement) => {
    peersEl = el;
    appDialogsManager.setListClickListener({list: el, autonomous: true});
  };

  createEffect(on(peerIds, (ids) => {
    if(!peersEl) return;

    peersEl.replaceChildren();

    const middleware = createMiddleware();
    onCleanup(() => middleware.destroy());

    ids.forEach((peerId) => renderTopPeerItem({
      peerId,
      container: peersEl,
      middleware: middleware.get()
    }));
  }));

  return (
    <TipCard
      title={i18n('ChatTips.Chats')}
      buttons={buttons()}
      description={i18n(IS_APPLE ? 'ChatTips.Chats.DescriptionMac' : 'ChatTips.Chats.Description', [
        // Search lives under the slider, so a settings tab left open would cover it.
        anchorCallback(async() => {
          await appSidebarLeft.closeAllTabsNaturally();
          appSidebarLeft.initSearch().open();
        })
      ])}
    >
      <Show
        when={!isEmpty()}
        fallback={<div class={styles.empty}>{i18n('ChatTips.Chats.Empty')}</div>}
      >
        {/* `search-group-people` is what turns the search's row items into the vertical
            avatar-over-name tiles — reuse that instead of restyling them here. */}
        <div class={classNames(styles.peers, 'search-group-people')} ref={bindPeersList} />
      </Show>
    </TipCard>
  );
}
