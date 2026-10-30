/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import PeerTitle from '@components/peerTitle';

/**
 * The two lines of a menu item that stands for a person (`avatarInfo` gives it the avatar): the name, and under
 * it what the item says about them — when they reacted, where it leads.
 */
export default function ButtonMenuPeerText(peerId: PeerId, subtitle: Node | string) {
  const container = document.createElement('span');
  container.classList.add('btn-menu-item-peer');

  const title = new PeerTitle({
    peerId,
    dialog: false
  }).element;
  title.classList.add('btn-menu-item-peer-title');

  const subtitleElement = document.createElement('span');
  subtitleElement.classList.add('btn-menu-item-peer-subtitle');
  subtitleElement.append(subtitle);

  container.append(title, subtitleElement);
  return container;
}
