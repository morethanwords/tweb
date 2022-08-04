/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {AppManagers} from '../../lib/appManagers/managers';
import rootScope from '../../lib/rootScope';
import PollElement from '../poll';

export default function wrapPoll(message: any, managers: AppManagers = rootScope.managers) {
  const elem = new PollElement();
  elem.message = message;
  elem.managers = managers;
  elem.setAttribute('peer-id', '' + message.peerId);
  elem.setAttribute('poll-id', message.media.poll.id);
  elem.setAttribute('message-id', '' + message.mid);
  elem.render();
  return elem;
}
