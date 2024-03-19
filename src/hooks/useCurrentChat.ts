import {createSignal, onCleanup, onMount} from 'solid-js';
import Chat from '../components/chat/chat';
import appImManager from '../lib/appManagers/appImManager';

export function useCurrentPeerId() {
  const [peerId, setPeerId] = createSignal<number>(appImManager.chat.peerId);

  const onChange = (chat: Chat) => {
    setPeerId(chat.peerId);
  };

  onMount(() => {
    appImManager.addEventListener('peer_changed', onChange);
  });

  onCleanup(() => {
    appImManager.removeEventListener('peer_changed', onChange);
  });

  return peerId;
}
