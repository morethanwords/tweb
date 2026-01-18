/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {User} from '@layer';
import {REPLIES_PEER_ID} from '@appManagers/constants';

export default function canSendToUser(user: User.user) {
  return !!(user && !user.pFlags.deleted && user.id.toPeerId() !== REPLIES_PEER_ID);
}
