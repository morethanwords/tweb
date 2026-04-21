/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import type {ChatRights} from '@appManagers/appChatsManager';
import flatten from '@helpers/array/flatten';
import appImManager from '@lib/appImManager';
import rootScope from '@lib/rootScope';
import {toastNew} from '@components/toast';
import showPickUserPopup from '@components/popups/pickUser';
import getMediaFromMessage from '@appManagers/utils/messages/getMediaFromMessage';
import getServerMessageId from '@appManagers/utils/messageId/getServerMessageId';
import {copyTextToClipboard} from '@helpers/clipboard';
import {i18n, join} from '@lib/langPack';
import {useAppConfig, useIsFrozen} from '@stores/appState';
import {Message} from '@layer';
import {createMemo, createRoot, Show} from 'solid-js';
import {createStore} from 'solid-js/store';
import Animated from '@helpers/solid/animations';
import InputFieldMessage from '@components/inputFieldMessage';
import PopupElement from '@components/popups/indexTsx';
import InputFieldAnimated from '@components/inputFieldAnimated';
import ChatInput from '@components/chat/input';
import ListenerSetter from '@helpers/listenerSetter';
import wrapPeerTitle from '@components/wrappers/peerTitle';

async function resolveChatRightsActions(peerIdMids: {[fromPeerId: PeerId]: number[]}): Promise<ChatRights[]> {
  const messagesPromises = Object.keys(peerIdMids).map((peerId) => {
    const mids = peerIdMids[peerId as any as number];
    return mids.map((mid) => {
      return rootScope.managers.appMessagesManager.getMessageByPeer(peerId.toPeerId(), mid);
    });
  });

  const messages = await Promise.all(flatten(messagesPromises));
  const actions: Set<ChatRights> = new Set();
  messages.forEach((message) => {
    if(!message) {
      return;
    }

    const media = getMediaFromMessage(message);
    let action: ChatRights;
    if(!media) {
      if(message.viaBotId) {
        action = 'send_inline';
      } else {
        action = 'send_plain';
      }
    } else {
      if(media._ === 'webPage') {
        action = 'embed_links';
      } else if(media._ === 'photo') {
        action = 'send_photos';
      } else if(media._ === 'game') {
        action = 'send_games';
      } else {
        switch(media.type) {
          case 'audio':
            action = 'send_audios';
            break;
          case 'gif':
            action = 'send_gifs';
            break;
          case 'round':
            action = 'send_roundvideos';
            break;
          case 'sticker':
            action = 'send_stickers';
            break;
          case 'voice':
            action = 'send_voices';
            break;
          case 'video':
            action = 'send_videos';
            break;
          default:
            action = 'send_docs';
            break;
        }
      }
    }

    if(action) {
      actions.add(action);
    }
  });

  return Array.from(actions);
}

export default async function showForwardPopup(
  peerIdMids?: {[fromPeerId: PeerId]: number[]},
  _onSelect?: (peerId: PeerId, threadId?: number) => Promise<void> | void,
  noTopics?: boolean,
  onClose?: () => void
) {
  const chatRightsActions = peerIdMids ? await resolveChatRightsActions(peerIdMids) : [];
  if(!chatRightsActions.length) {
    chatRightsActions.push('send_plain');
  }

  let canCopyLink = false, messageCount = 0;
  if(peerIdMids) {
    for(const fromPeerId in peerIdMids) {
      const mids = peerIdMids[fromPeerId];
      messageCount += mids.length;
    }

    const fromPeerIdStr = Object.keys(peerIdMids)[0];
    const fromPeerId = fromPeerIdStr.toPeerId();
    const mid = peerIdMids[fromPeerIdStr as any as number][0];
    const firstMessage = await rootScope.managers.appMessagesManager.getMessageByPeer(fromPeerId, mid) as Message.message;
    canCopyLink = !!firstMessage?.pFlags?.post;
  }

  const {message_length_max: MAX_MESSAGE_LENGTH} = await rootScope.managers.apiManager.getConfig();

  const listenerSetter = new ListenerSetter();

  // eslint-disable-next-line prefer-const -- referenced by starsState memo created before the popup handle is assigned
  let handle: ReturnType<typeof showPickUserPopup>;
  let finalizingThroughButton = false;

  let starsStateDispose: () => void;
  const starsState = createRoot((dispose) => {
    starsStateDispose = dispose;

    const [store, set] = createStore({
      messageLength: 0,
      selectedPeers: [] as PeerId[],
      starsTick: 0
    });

    const messageMsgCount = createMemo(() => {
      const len = store.messageLength;
      if(!len) return 0;
      return Math.max(1, Math.ceil(len / MAX_MESSAGE_LENGTH));
    });

    const totalMessages = createMemo(() => messageCount + messageMsgCount());

    const totalStars = createMemo(() => {
      store.starsTick;
      const msgs = totalMessages();
      if(!msgs) return 0;
      const map = handle?.selector?.starsAmountByPeer;
      if(!map) return 0;
      const peers = store.selectedPeers;
      if(!peers.length) return 0;
      let sum = 0;
      for(const peerId of peers) {
        sum += (map.get(peerId) || 0) * msgs;
      }
      return sum;
    });

    return {store, set, totalStars};
  });

  const handleCopyLink = async() => {
    const fromPeerIdStr = Object.keys(peerIdMids)[0];
    const fromPeerId = fromPeerIdStr.toPeerId();
    const mid = peerIdMids[fromPeerIdStr as any as number][0];
    const username = await rootScope.managers.appPeersManager.getPeerUsername(fromPeerId);
    const msgId = getServerMessageId(mid);
    let url = 'https://t.me/';
    if(username) {
      url += username + '/' + msgId;
    } else {
      url += 'c/' + fromPeerId.toChatId() + '/' + msgId;
    }

    copyTextToClipboard(url);
    toastNew({langPackKey: 'LinkCopied'});
    handle.hide();
  };

  const processSingle = async({
    peerId,
    threadId,
    monoforumThreadId
  }: {
    peerId: number,
    threadId?: number,
    monoforumThreadId?: number
  }, openChat: boolean) => {
    if(_onSelect) {
      const res = _onSelect(peerId);
      if(res instanceof Promise) {
        await res;
      }
    }

    let success: boolean;
    if(openChat) {
      await appImManager.setInnerPeer({peerId, threadId, monoforumThreadId});
      appImManager.chat.input.initMessagesForward(peerIdMids);
    } else {
      const result = await ChatInput.sendMessageWithForward({
        inputField,
        sendingParams: {
          peerId,
          threadId
        },
        forwarding: peerIdMids,
        slowModeParams: {
          peerId,
          element: btnRef,
          managers: rootScope.managers
        }
      });

      success = !!result;
    }

    return success;
  };

  let onSelect: Parameters<typeof showPickUserPopup>[0]['onSelect'];
  if(!peerIdMids && _onSelect) {
    onSelect = (chosen) => _onSelect(chosen[0].peerId, chosen[0].threadId);
  } else {
    onSelect = async(chosen) => {
      const sentToPeerIds: Set<PeerId> = new Set();
      const succeeded: Array<typeof chosen[0]> = [];
      const openChat = chosen.length === 1 && !finalizingThroughButton;
      for(const item of chosen) {
        const success = await processSingle(
          item,
          openChat
        );

        if(success) {
          sentToPeerIds.add(item.peerId);
          succeeded.push(item);
        }
      }

      if(sentToPeerIds.size === 1 && [...sentToPeerIds.values()][0] === rootScope.myId) {
        toastNew({
          langPackKey: messageCount > 1 ? 'FwdMessagesToSavedMessages' : 'FwdMessageToSavedMessages'
        });
      } else if(sentToPeerIds.size) {
        const peerTitles = sentToPeerIds.size <= 3 ? await Promise.all(Array.from(sentToPeerIds).map((peerId) => {
          return wrapPeerTitle({peerId, dialog: true});
        })) : [];

        const boldPeerTitles = peerTitles.map((element) => {
          const b = document.createElement('b');
          b.append(element);
          return b;
        });
        toastNew({
          langPackKey: messageCount === 1 ? 'FwdMessageTo' : 'FwdMessagesTo',
          langPackArguments: peerTitles.length ? [join(boldPeerTitles)] : [i18n('FwdMessagesToChats', [sentToPeerIds.size])]
        });
      }

      // * deselect failed
      if(!openChat && succeeded.length !== chosen.length) {
        handle.selector.removeBatch(succeeded.map(({key}) => key));
        throw new Error();
      }
    };
  }

  let busy = false;
  let btnRef: HTMLElement, inputField: InputFieldAnimated;
  handle = showPickUserPopup({
    peerType: ['dialogs', 'contacts'],
    onSelect: async(...args) => {
      if(busy) {
        return;
      }

      busy = true;
      try {
        await onSelect(...args);
        busy = false;
      } catch(err) {
        busy = false;
        throw err;
      }
    },
    onChange: () => {
      const selected = handle.selector.getSelected() ?? [];
      const peerIds = selected.filter((k): k is PeerId => k.isPeerId());
      starsState.set('selectedPeers', peerIds);
    },
    multiSelect: 'hidden',
    placeholder: 'ShareModal.Search.ForwardPlaceholder',
    chatRightsActions,
    selfPresence: 'ChatYourSelf',
    useTopics: !noTopics,
    titleLangKey: 'ShareWith',
    showTopPeers: true,
    ...(useIsFrozen() && {
      getMoreCustom: async() => {
        const appConfig = useAppConfig();
        const peer = await rootScope.managers.appUsersManager.resolveUsername(appConfig.freeze_appeal_url.split('/').pop());
        return {
          result: [peer.id.toPeerId(peer._ !== 'user')],
          isEnd: true
        };
      },
      peerType: ['custom'],
      noSearch: true,
      headerLangPackKey: 'Forward'
    }),
    footer: ({multiSelect}) => {
      const showCopyLink = () => canCopyLink && multiSelect() === 'hidden';
      return (
        <Animated type="cross-fade" itemClass="popup-forward-footer-item">
          <Show
            when={showCopyLink()}
            fallback={
              <InputFieldMessage
                btnProps={{
                  ref: (ref) => btnRef = ref,
                  onClick: () => {
                    finalizingThroughButton = true;
                    handle.finalize();
                  }
                }}
                ref={(ref) => inputField = ref}
                listenerSetter={listenerSetter}
                onInput={(_hasValue, length) => starsState.set('messageLength', length)}
                stars={starsState.totalStars}
              />
            }
          >
            <PopupElement.FooterButton
              class="btn-primary btn-color-primary"
              callback={handleCopyLink}
            >
              {i18n('CopyLink')}
            </PopupElement.FooterButton>
          </Show>
        </Animated>
      );
    },
    onClose: () => {
      listenerSetter.removeAll();
      starsStateDispose?.();
      handle.selector && (handle.selector.onStarsAmountUpdate = undefined);
      onClose?.();
    },
    btnConfirmOnEnter: () => btnRef
  });

  if(handle.selector) {
    handle.selector.onStarsAmountUpdate = () => {
      starsState.set('starsTick', (t) => t + 1);
    };
  }
}
