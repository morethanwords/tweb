/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import getServerMessageId from '../../lib/appManagers/utils/messageId/getServerMessageId';
import wrapTelegramUrlToAnchor from '../../lib/richTextProcessor/wrapTelegramUrlToAnchor';
import {avatarNew} from '../avatarNew';
import Icon from '../icon';
import wrapPeerTitle from './peerTitle';

export default async function wrapTopicNameButton(
  options: {
    lastMsgId?: number,
    noLink?: boolean
  } & Pick<Parameters<typeof wrapPeerTitle>[0], 'peerId' | 'threadId' | 'wrapOptions' | 'withIcons' | 'dialog'>
) {
  const {peerId, threadId, lastMsgId} = options;

  let loadPromise: Promise<any> = Promise.resolve();
  let element: HTMLElement;
  if(options.noLink) {
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
    element = wrapTelegramUrlToAnchor('t.me/c/' + peerId.toChatId() + (threadId ? '/' + getServerMessageId(threadId) : '') + (lastMsgId ? '/' + getServerMessageId(lastMsgId) : ''));
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
