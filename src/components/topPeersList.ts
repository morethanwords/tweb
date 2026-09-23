import appDialogsManager from '@lib/appDialogsManager';
import rootScope from '@lib/rootScope';
import {createSearchGroup, SearchGroup} from '@components/searchGroup';
import {Middleware} from '@helpers/middleware';
import {MyTopPeer} from '@lib/appManagers/appUsersManager';

/**
 * Renders one peer the way the left sidebar's search renders its top-peers row: a bigger avatar
 * over a first-name-only title, no subtitle, no status icons. Shared so surfaces that show the
 * same "people" tiles from a different source — the empty-column Chats tip card — look identical
 * to the search instead of re-implementing the item.
 */
export function renderTopPeerItem({peerId, container, middleware, autonomous = true, noIcons = true}: {
  peerId: PeerId,
  container: HTMLElement,
  middleware: Middleware,
  autonomous?: boolean,
  noIcons?: boolean
}) {
  const dialog = appDialogsManager.addDialogNew({
    peerId,
    container,
    onlyFirstName: true,
    avatarSize: 'bigger',
    autonomous,
    noIcons,
    wrapOptions: {
      middleware
    },
    withStories: true
  });

  dialog.dom.subtitleEl.remove();

  return dialog;
}

export default function createTopPeersList({
  middleware,
  onFound,
  group,
  modifyPeers,
  className
}: {
  middleware: Middleware,
  onFound?: () => void,
  group?: SearchGroup,
  modifyPeers?: (peers: MyTopPeer[]) => MyTopPeer[],
  className?: string
}) {
  const autonomous = !group;
  group ??= createSearchGroup({
    type: 'contacts',
    className: 'search-group-people' + (className ? ' ' + className : ''),
    autonomous,
    onFound,
    noIcons: true,
    middleware,
    scrollableX: true,
    clickable: !!onFound
  });

  const promise = rootScope.managers.appUsersManager.getTopPeers('correspondents').then((peers) => {
    if(!middleware()) return;

    if(modifyPeers) {
      peers = modifyPeers(peers.slice());
    }

    peers.forEach((peer) => {
      renderTopPeerItem({
        peerId: peer.id,
        container: group.list,
        middleware,
        autonomous,
        noIcons: group.noIcons
      });
    });

    group.toggle();
  });

  return {group, promise};
}
