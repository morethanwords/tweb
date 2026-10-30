import type {ChatRights} from '@appManagers/appChatsManager';
import flatten from '@helpers/array/flatten';
import rootScope from '@lib/rootScope';
import {toastNew} from '@components/toast';
import showPickUserPopup from '@components/popups/pickUser';
import getMediaFromMessage from '@appManagers/utils/messages/getMediaFromMessage';
import getServerMessageId from '@appManagers/utils/messageId/getServerMessageId';
import {copyTextToClipboard} from '@helpers/clipboard';
import {FormatterArguments, i18n, join, LangPackKey} from '@lib/langPack';
import {useAppConfig, useIsFrozen} from '@stores/appState';
import {InputMedia, Message, User} from '@layer';
import {createMemo, createRoot, Show} from 'solid-js';
import {createStore} from 'solid-js/store';
import Animated from '@helpers/solid/animations';
import classNames from '@helpers/string/classNames';
import InputFieldMessage from '@components/inputFieldMessage';
import PopupElement from '@components/popups/indexTsx';
import InputFieldAnimated from '@components/inputFieldAnimated';
import ChatInput from '@components/chat/input';
import ListenerSetter from '@helpers/listenerSetter';
import wrapPeerTitle from '@components/wrappers/peerTitle';
import SendMenu from '@components/chat/sendContextMenu';
import showScheduleSendingPopup from '@components/popups/scheduleSendingPopup';
import {getMiddleware} from '@helpers/middleware';
import {SEND_WHEN_ONLINE_TIMESTAMP} from '@appManagers/constants';
import {hotReloadGuard} from '@lib/solidjs/hotReloadGuardProvider';
import {bindManagersToSession} from '@lib/accounts/bindManagersToAccount';
import {copyStoryLink} from '@components/stories/share';
import toHHMMSS from '@helpers/string/toHHMMSS';

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

/**
 * A story shared instead of messages: it goes after the comment, as iOS and tdesktop send it, and
 * counts as one message.
 */
export type ForwardPopupStory = {
  peerId: PeerId,
  id: number,
  /** whether "Copy Link" copies the story's link (`copyStoryLink`) while nobody is picked; without it there is no such button */
  canCopyLink?: boolean,
  /** shows where the story went, in place of the toast */
  onSent?: (text: HTMLElement) => void
};

export default async function showForwardPopup(
  peerIdMids?: {[fromPeerId: PeerId]: number[]},
  _onSelect?: (peerId: PeerId, threadId?: number) => Promise<void> | void,
  noTopics?: boolean,
  onClose?: () => void,
  story?: ForwardPopupStory,
  /** a video's forward starts it at this second for whoever gets it ("Share at 0:42"), as its link does */
  videoTimestamp?: number
) {
  const managers = bindManagersToSession(rootScope.managers);
  const chatRightsActions: ChatRights[] = story ? ['send_media'] : peerIdMids ? await resolveChatRightsActions(peerIdMids) : [];
  if(!chatRightsActions.length) {
    chatRightsActions.push('send_plain');
  }

  let canCopyLink = false, messageCount = 0, storyMedia: InputMedia.inputMediaStory, username: string;
  if(story) {
    messageCount = 1;
    canCopyLink = !!story.canCopyLink;
    storyMedia = {
      _: 'inputMediaStory',
      id: story.id,
      peer: await managers.appPeersManager.getInputPeerById(story.peerId)
    };
  } else if(peerIdMids) {
    for(const fromPeerId in peerIdMids) {
      const mids = peerIdMids[fromPeerId];
      messageCount += mids.length;
    }

    const fromPeerIdStr = Object.keys(peerIdMids)[0];
    const fromPeerId = fromPeerIdStr.toPeerId();
    const mid = peerIdMids[fromPeerIdStr as any as number][0];
    const firstMessage = await managers.appMessagesManager.getMessageByPeer(fromPeerId, mid) as Message.message;
    canCopyLink = !!firstMessage?.pFlags?.post;
    if(canCopyLink && videoTimestamp !== undefined) {
      // * a link with a time is a public channel's only, as tdesktop has it
      username = await managers.appPeersManager.getPeerUsername(fromPeerId);
      canCopyLink = !!username;
    }
  }

  const {message_length_max: MAX_MESSAGE_LENGTH} = await managers.apiManager.getConfig();

  const listenerSetter = new ListenerSetter();
  const sendMenuMiddleware = getMiddleware();
  let sendMenu: SendMenu | undefined;
  let silent = false;
  let scheduleDate: number | undefined;
  let scheduleRepeatPeriod: number | undefined;

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
    if(story) {
      if(await copyStoryLink(managers, story.peerId, story.id)) {
        handle.hide();
      }

      return;
    }

    const fromPeerIdStr = Object.keys(peerIdMids)[0];
    const fromPeerId = fromPeerIdStr.toPeerId();
    const mid = peerIdMids[fromPeerIdStr as any as number][0];
    username ??= await managers.appPeersManager.getPeerUsername(fromPeerId);
    const msgId = getServerMessageId(mid);
    let url = 'https://t.me/';
    if(username) {
      url += username + '/' + msgId;
      if(videoTimestamp !== undefined) {
        url += '?t=' + videoTimestamp;
      }
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
      await hotReloadGuard.appImManager.setInnerPeer({peerId, threadId, monoforumThreadId});
      hotReloadGuard.appImManager.chat.input.initMessagesForward(peerIdMids, videoTimestamp);
    } else {
      const result = await ChatInput.sendMessageWithForward({
        inputField,
        sendingParams: {
          peerId,
          threadId,
          // * the direct messages thread picked: a shared story has always gone there, a forward is
          // * left as it was
          replyToMonoforumPeerId: storyMedia ? monoforumThreadId : undefined,
          silent: silent || undefined,
          scheduleDate: scheduleDate || undefined,
          scheduleRepeatPeriod: scheduleRepeatPeriod || undefined
        },
        forwarding: peerIdMids,
        forwardParams: {videoTimestamp},
        media: storyMedia,
        slowModeParams: {
          peerId,
          // * a story picked with one click while "Copy Link" stands in for the field: the hint goes over that
          element: btnRef?.isConnected ? btnRef : copyLinkRef,
          managers
        }
      });

      success = !!result;
    }

    return success;
  };

  const updateSendMenuPeerParams = () => {
    if(!sendMenu) return;
    const selected = handle?.selector?.getSelected() ?? [];
    const peerIds = selected.filter((k): k is PeerId => k.isPeerId());
    const allSelf = peerIds.length > 0 && peerIds.every((p) => p === rootScope.myId);
    const peerId = allSelf ?
      rootScope.myId :
      (peerIds.find((p) => p !== rootScope.myId) ?? rootScope.myId);
    const map = handle?.selector?.starsAmountByPeer;
    const isPaid = map ? peerIds.some((p) => (map.get(p) || 0) > 0) : false;
    sendMenu.setPeerParams({peerId, isPaid});
  };

  const setupSendMenu = (btn: HTMLElement) => {
    if(!btn) return;
    sendMenuMiddleware.clean();

    sendMenu = new SendMenu({
      onSilentClick: () => {
        silent = true;
        finalizingThroughButton = true;
        handle.finalize();
      },
      onScheduleClick: () => {
        showScheduleSendingPopup({
          onPick: (timestamp, repeatPeriod) => {
            scheduleDate = timestamp;
            scheduleRepeatPeriod = repeatPeriod;
            finalizingThroughButton = true;
            handle.finalize();
          },
          canSendWhenOnline: false
        });
      },
      onSendWhenOnlineClick: () => {
        scheduleDate = SEND_WHEN_ONLINE_TIMESTAMP;
        finalizingThroughButton = true;
        handle.finalize();
      },
      canSendWhenOnline: async() => {
        const selected = handle?.selector?.getSelected() ?? [];
        const peerIds = selected.filter((k): k is PeerId => k.isPeerId());
        if(peerIds.length !== 1) return false;
        const peerId = peerIds[0];
        if(peerId === rootScope.myId || !peerId.isUser()) return false;
        if(!(await managers.appUsersManager.isUserOnlineVisible(peerId.toUserId()))) {
          return false;
        }
        const user = await managers.appUsersManager.getUser(peerId.toUserId()) as User.user;
        if(user?.pFlags?.bot) return false;
        return user?.status?._ !== 'userStatusOnline';
      },
      middleware: sendMenuMiddleware.get(),
      openSide: 'top-left',
      onContextElement: btn,
      onOpen: () => {
        const peerIds = (handle?.selector?.getSelected() ?? []).filter((k) => k.isPeerId());
        return peerIds.length > 0;
      }
    });

    updateSendMenuPeerParams();
  };

  const resetSendOptions = () => {
    silent = false;
    scheduleDate = undefined;
    scheduleRepeatPeriod = undefined;
  };

  let onSelect: Parameters<typeof showPickUserPopup>[0]['onSelect'];
  if(!peerIdMids && _onSelect) {
    onSelect = (chosen) => _onSelect(chosen[0].peerId, chosen[0].threadId);
  } else {
    onSelect = async(chosen) => {
      const sentToPeerIds: Set<PeerId> = new Set();
      const succeeded: Array<typeof chosen[0]> = [];
      const isSavedMessagesNoText = chosen.length === 1 &&
        chosen[0].peerId === rootScope.myId &&
        !starsState.store.messageLength;
      // * a story has no composer to wait in: it goes at once, as it did from a single pick
      const openChat = !story && chosen.length === 1 && !finalizingThroughButton && !isSavedMessagesNoText;
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

      let langPackKey: LangPackKey, langPackArguments: FormatterArguments;
      if(sentToPeerIds.size === 1 && [...sentToPeerIds.values()][0] === rootScope.myId) {
        langPackKey = story ? 'StorySharedToSavedMessages' : messageCount > 1 ? 'FwdMessagesToSavedMessages' : 'FwdMessageToSavedMessages';
      } else if(sentToPeerIds.size) {
        const peerTitles = sentToPeerIds.size <= 3 ? await Promise.all(Array.from(sentToPeerIds).map((peerId) => {
          return wrapPeerTitle({peerId, dialog: true});
        })) : [];

        const boldPeerTitles = peerTitles.map((element) => {
          const b = document.createElement('b');
          b.append(element);
          return b;
        });
        langPackKey = story ? 'StorySharedTo' : messageCount === 1 ? 'FwdMessageTo' : 'FwdMessagesTo';
        langPackArguments = peerTitles.length ? [join(boldPeerTitles)] : [i18n('FwdMessagesToChats', [sentToPeerIds.size])];
      }

      if(langPackKey && story?.onSent) {
        story.onSent(i18n(langPackKey, langPackArguments));
      } else if(langPackKey) {
        toastNew({langPackKey, langPackArguments});
      }

      // * deselect failed
      if(!openChat && succeeded.length !== chosen.length) {
        handle.selector.removeBatch(succeeded.map(({key}) => key));
        throw new Error();
      }
    };
  }

  let btnRef: HTMLElement, copyLinkRef: HTMLElement, inputField: InputFieldAnimated;
  handle = showPickUserPopup({
    peerType: ['dialogs', 'contacts'],
    onSelect,
    onChange: () => {
      const selected = handle.selector.getSelected() ?? [];
      const peerIds = selected.filter((k): k is PeerId => k.isPeerId());
      starsState.set('selectedPeers', peerIds);
      updateSendMenuPeerParams();
    },
    multiSelect: 'hidden',
    placeholder: 'ShareModal.Search.ForwardPlaceholder',
    chatRightsActions,
    selfPresence: 'ChatYourSelf',
    useTopics: !noTopics,
    ...(videoTimestamp !== undefined ? {
      titleLangKey: 'ShareAtTimeWith',
      titleLangArgs: [toHHMMSS(videoTimestamp)]
    } : {
      titleLangKey: 'ShareWith'
    }),
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
      const hasMessage = () => !!starsState.store.messageLength;
      const showCopyLink = () => canCopyLink && multiSelect() === 'hidden' && !hasMessage();
      const isFooterHidden = () => !canCopyLink && multiSelect() === 'hidden' && !hasMessage();
      return (
        <div class={classNames('popup-forward-footer-content', isFooterHidden() && 'is-hidden')}>
          <Animated type="cross-fade" itemClass="popup-forward-footer-item">
            <Show
              when={showCopyLink()}
              fallback={
                <InputFieldMessage
                  btnProps={{
                    ref: (ref) => {
                      btnRef = ref;
                      setupSendMenu(ref);
                    },
                    onClick: () => {
                      resetSendOptions();
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
              <PopupElement.FooterButton ref={(ref) => copyLinkRef = ref} callback={handleCopyLink}>
                {i18n('CopyLink')}
              </PopupElement.FooterButton>
            </Show>
          </Animated>
        </div>
      );
    },
    onClose: () => {
      listenerSetter.removeAll();
      sendMenuMiddleware.destroy();
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
