/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import appDialogsManager from '@lib/appDialogsManager';
import rootScope from '@lib/rootScope';
import {createSearchGroup, SearchGroup} from '@components/searchGroup';
import {Middleware} from '@helpers/middleware';
import {MyTopPeer} from '@lib/appManagers/appUsersManager';

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
      const {dom} = appDialogsManager.addDialogNew({
        peerId: peer.id,
        container: group.list,
        onlyFirstName: true,
        avatarSize: 'bigger',
        autonomous,
        noIcons: group.noIcons,
        wrapOptions: {
          middleware
        },
        withStories: true
      });

      dom.subtitleEl.remove();
    });

    group.toggle();
  });

  return {group, promise};
}
