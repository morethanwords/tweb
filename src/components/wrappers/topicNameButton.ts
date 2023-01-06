/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import getServerMessageId from '../../lib/appManagers/utils/messageId/getServerMessageId';
import {i18n} from '../../lib/langPack';
import wrapTelegramUrlToAnchor from '../../lib/richTextProcessor/wrapTelegramUrlToAnchor';
import rootScope from '../../lib/rootScope';
import wrapPeerTitle from './peerTitle';

export default async function wrapTopicNameButton(
  options: {
    lastMsgId?: number
  } & Pick<Parameters<typeof wrapPeerTitle>[0], 'peerId' | 'threadId' | 'wrapOptions' | 'withIcons'>
) {
  const {peerId, threadId, lastMsgId} = options;

  const loadPromise: Promise<any> = Promise.resolve();
  const a = wrapTelegramUrlToAnchor('t.me/c/' + peerId.toChatId() + (threadId ? '/' + getServerMessageId(threadId) : '') + (lastMsgId ? '/' + getServerMessageId(lastMsgId) : ''));
  a.classList.add('topic-name', 'topic-name-button');
  // if(threadId) {
  //   const topic = await rootScope.managers.dialogsStorage.getForumTopic(peerId, threadId);
  //   if(!topic) {
  //     a.append(i18n('Loading'));
  //     loadPromise = rootScope.managers.dialogsStorage.getForumTopicById(peerId, threadId)
  //   }
  // } else {
  a.append(await wrapPeerTitle(options));
  // }

  return {
    cached: true,
    element: a,
    loadPromise
  };
}
