import {createEffect, createMemo, createSignal, on, onCleanup, onMount} from 'solid-js';
import apiManagerProxy from '../lib/mtproto/mtprotoworker';
import rootScope from '../lib/rootScope';

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

export function useUser(userId: () => UserId) {
  const [user, setUser] = createSignal(apiManagerProxy.getUser(userId()));

  const onUpdate = (_userId: UserId) => {
    if(userId() === _userId) {
      setUser(apiManagerProxy.getUser(_userId));
    }
  };

  createEffect(on(userId, (id) => {
    setUser(apiManagerProxy.getUser(id));
  }));

  onMount(() => {
    rootScope.addEventListener('user_update', onUpdate);
  });

  onCleanup(() => {
    rootScope.removeEventListener('user_update', onUpdate);
  });

  return user;
}

export function usePeer(peerId: () => PeerId) {
  const [peer, setPeer] = createSignal<ReturnType<typeof apiManagerProxy['getPeer']>>();

  createEffect(() => {
    const _peerId = peerId();
    const accessor = _peerId.isUser() ? useUser(() => _peerId.toUserId()) : useChat(() => _peerId.toChatId());
    setPeer(accessor());
  });

  return peer;
}
