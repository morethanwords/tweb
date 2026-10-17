import {createRoot, createSignal} from 'solid-js';

// * the chat list shows only unread chats - of whichever folder is open, until it is turned off.
// * Turned on and off by `appDialogsManager.setUnreadOnly`, which rebuilds the list
const [unreadOnly, setUnreadOnly] = createRoot(() => createSignal(false));

export default function useChatListUnreadOnly() {
  return [unreadOnly, setUnreadOnly] as const;
}
