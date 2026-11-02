/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import type {Message} from '@layer';
import rootScope from '@lib/rootScope';

/**
 * A transfer's message this device still sends: `onSent` gets the served message that takes its place, `onError`
 * the error that failed it. Returns the stop.
 */
export default function watchSendingTransfer(
  message: Pick<Message.messageService, 'mid' | 'peerId'>,
  handlers: {
    onSent: (served: Message.messageService) => void,
    onError: (error: ApiError) => void
  }
) {
  const onSent = ({tempId, tempMessage, message: served}: {tempId: number, tempMessage: any, message: any}) => {
    if(tempId !== message.mid || tempMessage?.peerId !== message.peerId) return;
    handlers.onSent(served as Message.messageService);
  };

  const onError = ({tempId, peerId, error}: {tempId: number, peerId: PeerId, error: ApiError}) => {
    if(tempId !== message.mid || peerId !== message.peerId) return;
    handlers.onError(error);
  };

  rootScope.addEventListener('message_sent', onSent);
  rootScope.addEventListener('message_error', onError);
  return () => {
    rootScope.removeEventListener('message_sent', onSent);
    rootScope.removeEventListener('message_error', onError);
  };
}
