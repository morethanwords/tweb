import type {Chat as MTChat} from '@layer';
import type {LangPackKey} from '@lib/langPack';
import {toastNew} from '@components/toast';
import apiManagerProxy from '@lib/apiManagerProxy';

/**
 * Says that the content of `peerId`'s chat cannot be copied (the chat or its message forbids it), by
 * the chat's kind
 */
export default function toastCopyRestricted(peerId: PeerId) {
  let langPackKey: LangPackKey;
  if(peerId.isUser()) {
    langPackKey = 'CopyRestricted.User';
  } else {
    const chat = apiManagerProxy.getChat(peerId.toChatId());
    langPackKey = (chat as MTChat.channel).pFlags.broadcast ?
      'CopyRestricted.Channel' :
      'CopyRestricted.Group';
  }

  toastNew({langPackKey});
}
