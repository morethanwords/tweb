/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import wrapTopicThreadAnchor from '@lib/richTextProcessor/wrapTopicThreadAnchor';
import {avatarNew} from '@components/avatarNew';
import Icon from '@components/icon';
import wrapPeerTitle from '@components/wrappers/peerTitle';

export default async function wrapTopicNameButton(
  options: {
    lastMsgId?: number,
    noAvatarAndLink?: boolean,
    noLink?: boolean
  } & Pick<Parameters<typeof wrapPeerTitle>[0], 'peerId' | 'threadId' | 'wrapOptions' | 'withIcons' | 'dialog'>
) {
  const {peerId, threadId, lastMsgId} = options;

  let loadPromise: Promise<any> = Promise.resolve();
  let element: HTMLElement;

  if(options.noAvatarAndLink) {
    element = document.createElement('span');
  } else if(options.noLink) {
    element = document.createElement('span');
    element.dataset.savedFrom = `${options.peerId}_${options.lastMsgId}`;
    element.classList.add('has-avatar');

    const avatar = avatarNew({
      peerId: options.peerId,
      isDialog: true,
      middleware: options.wrapOptions.middleware,
      size: 30
    });

    avatar.node.classList.add('topic-name-button-avatar');

    element.append(avatar.node, Icon('next', 'topic-name-button-arrow'));

    loadPromise = avatar.readyThumbPromise;

    options.withIcons = false;
  } else {
    element = wrapTopicThreadAnchor({peerId, threadId, lastMsgId});
  }

  element.classList.add('topic-name', 'topic-name-button');
  // if(threadId) {
  //   const topic = await rootScope.managers.dialogsStorage.getForumTopic(peerId, threadId);
  //   if(!topic) {
  //     element.append(i18n('Loading'));
  //     loadPromise = rootScope.managers.dialogsStorage.getForumTopicById(peerId, threadId)
  //   }
  // } else {
  element.append(await wrapPeerTitle(options));
  // }

  return {
    cached: true,
    element,
    loadPromise
  };
}
