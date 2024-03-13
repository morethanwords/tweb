import {createEffect, createSignal, on, onCleanup, onMount} from 'solid-js';
import Chat from '../../components/chat/chat';
import appImManager from '../../lib/appManagers/appImManager';
import apiManagerProxy from '../../lib/mtproto/mtprotoworker';
import rootScope from '../../lib/rootScope';

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

export function useChat(chatId: () => ChatId) {
  const [chat, setChat] = createSignal(apiManagerProxy.getChat(chatId()));

  const onUpdate = (_chatId: ChatId) => {
    if(chatId() === _chatId) {
      setChat(apiManagerProxy.getChat(_chatId));
    }
  };

  createEffect(on(chatId, (id) => {
    setChat(apiManagerProxy.getChat(id));
  }));

  onMount(() => {
    rootScope.addEventListener('chat_update', onUpdate);
  });

  onCleanup(() => {
    rootScope.removeEventListener('chat_update', onUpdate);
  });

  return chat;
}
