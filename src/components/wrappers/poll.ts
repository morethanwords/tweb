/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import type wrapRichText from '../../lib/richTextProcessor/wrapRichText';
import type TranslatableMessage from '../translatableMessage';
import {Middleware} from '../../helpers/middleware';
import {Message, MessageMedia} from '../../layer';
import {AppManagers} from '../../lib/appManagers/managers';
import rootScope from '../../lib/rootScope';
import PollElement from '../poll';

export default function wrapPoll({
  message,
  managers = rootScope.managers,
  middleware,
  translatableParams,
  richTextOptions
}: {
  message: Message.message,
  managers?: AppManagers,
  middleware: Middleware,
  translatableParams?: Parameters<typeof TranslatableMessage>[0],
  richTextOptions?: Parameters<typeof wrapRichText>[1]
}) {
  const elem = new PollElement();
  elem.message = message;
  elem.managers = managers;
  elem.translatableParams = translatableParams;
  elem.richTextOptions = richTextOptions;
  elem.setAttribute('peer-id', '' + message.peerId);
  elem.setAttribute('poll-id', '' + (message.media as MessageMedia.messageMediaPoll).poll.id);
  elem.setAttribute('message-id', '' + message.mid);
  elem.middlewareHelper = middleware.create();
  elem.render();
  return elem;
}
