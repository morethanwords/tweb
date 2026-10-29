import {hotReloadGuard} from '@lib/solidjs/hotReloadGuardProvider';

/**
 * A change of what an element shows that makes its message's bubble bigger or smaller (a voice message's text coming
 * or going): made as the chat makes the changes of its bubbles, shown changing (`ChatBubbles.changeBubble`). Out of a
 * chat's bubbles (a reply's quote, the media viewer) it is made at once.
 */
export default function changeBubble(element: HTMLElement, callback: () => void) {
  const bubbles = hotReloadGuard.appImManager?.chats.find((chat) => chat.bubbles?.chatInner.contains(element))?.bubbles;
  if(bubbles) bubbles.changeBubble(element, callback);
  else callback();
}
