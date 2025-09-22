import {Message} from '../../../layer';
import apiManagerProxy from '../../../lib/mtproto/mtprotoworker';
import rootScope from '../../../lib/rootScope';
import PeerTitle from '../../peerTitle';


type Args = {
  bubble: HTMLElement;
  message: Message.message | Message.messageService;
  peerId: PeerId;
  canManageDirectMessages: boolean;
  loadPromises: Promise<any>[];
};

type CheckIfNotMePostedArgs = {
  peerId: PeerId;
  message: Message.message | Message.messageService;
  canManageDirectMessages: boolean;
};

export function checkIfNotMePosted({peerId, message, canManageDirectMessages}: CheckIfNotMePostedArgs) {
  if(!canManageDirectMessages) return message.fromId !== rootScope.myId;

  if(message._ === 'message') return !message.pFlags?.out;

  const chat = apiManagerProxy.getChat(peerId);
  const linkedChat = chat?._ === 'channel' && chat?.pFlags?.monoforum && chat?.linked_monoforum_id ?
    apiManagerProxy.getChat(chat.linked_monoforum_id) : undefined;

  return message.fromId !== linkedChat?.id?.toPeerId?.(true);
}

export default function addSuggestedPostServiceMessage({bubble, message, peerId, canManageDirectMessages, loadPromises}: Args) {
  const suggestedPost = message._ === 'message' && message.suggested_post;
  if(!suggestedPost) return;

  return (async() => {
    bubble.classList.add('has-fake-service', 'is-forced-rounded');

    const fakeServiceMessage = document.createElement('div');
    fakeServiceMessage.classList.add('service-msg');

    let peerTitle: PeerTitle;
    if(checkIfNotMePosted({message, peerId, canManageDirectMessages})) {
      peerTitle = new PeerTitle;
      loadPromises.push(
        peerTitle.update({peerId: message.fromId, onlyFirstName: canManageDirectMessages, limitSymbols: 20})
      );
    }

    const {default: SuggestedPostActionContent} = await import('./suggestedPostActionContent');
    const content = new SuggestedPostActionContent;
    content.feedProps({
      message,
      canManageDirectMessages,
      fromPeerTitle: peerTitle?.element
    });

    fakeServiceMessage.append(content);

    bubble.prepend(fakeServiceMessage);
  })();
}
