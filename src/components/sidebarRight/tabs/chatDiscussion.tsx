import {Component, createSignal, onMount, Show} from 'solid-js';
import {attachClickEvent} from '@helpers/dom/clickEvent';
import findUpClassName from '@helpers/dom/findUpClassName';
import shake from '@helpers/dom/shake';
import toggleDisability from '@helpers/dom/toggleDisability';
import {Chat} from '@layer';
import appDialogsManager from '@lib/appDialogsManager';
import hasRights from '@appManagers/utils/chats/hasRights';
import getPeerActiveUsernames from '@appManagers/utils/peers/getPeerActiveUsernames';
import {i18n, LangPackKey} from '@lib/langPack';
import rootScope from '@lib/rootScope';
import Button from '@components/buttonTsx';
import Section from '@components/section';
import confirmationPopup from '@components/confirmationPopup';
import {AppNewGroupTab} from '@components/solidJsTabs/tabs';
import {toastNew} from '@components/toast';
import getPeerTitle from '@components/wrappers/getPeerTitle';
import wrapPeerTitle from '@components/wrappers/peerTitle';
import {handleChannelsTooMuch} from '@components/popups/channelsTooMuch';
import {useSuperTab} from '@components/solidJsTabs/superTabProvider';
import {usePromiseCollector} from '@components/solidJsTabs/promiseCollector';
import {useHotReloadGuard} from '@lib/solidjs/hotReloadGuard';
import type {AppChatDiscussionTab} from '@components/solidJsTabs/tabs';

const ChatDiscussion: Component = () => {
  const [tab] = useSuperTab<typeof AppChatDiscussionTab>();
  const promiseCollector = usePromiseCollector();
  const {appImManager, lottieLoader} = useHotReloadGuard();
  const {chatId} = tab.payload;

  let linkedChatId = tab.payload.linkedChatId;
  let isBroadcast: boolean;
  let canChangeInfo: boolean;

  let stickerContainer!: HTMLDivElement;
  let sectionContent!: HTMLElement;
  let btnUnlink!: HTMLElement;

  const [captionEl, setCaptionEl] = createSignal<HTMLElement>();
  const [sectionCaption, setSectionCaption] = createSignal<LangPackKey>();
  const [isBroadcastSig, setIsBroadcastSig] = createSignal(false);
  const [createGroupHidden, setCreateGroupHidden] = createSignal(false);
  const [unlinkHidden, setUnlinkHidden] = createSignal(false);
  const [unlinkText, setUnlinkText] = createSignal<LangPackKey>();

  const setDiscussionGroup = async(id: ChatId, groupId: ChatId) => {
    return handleChannelsTooMuch(() => {
      return tab.managers.appChatsManager.setDiscussionGroup(id, groupId);
    });
  };

  const onCreateGroup = async() => {
    let title = await getPeerTitle({peerId: chatId.toPeerId(true), plainText: true});
    title += ' Chat';

    const subTab = tab.slider.createTab(AppNewGroupTab);
    subTab.open({
      peerIds: [],
      onCreate: (newChatId) => {
        tab.slider.removeTabFromHistory(tab);
        setDiscussionGroup(chatId, newChatId);
      },
      openAfter: false,
      title,
      asChannel: true
    });
  };

  const onUnlink = async() => {
    const _linkedChatId = linkedChatId;
    await confirmationPopup({
      descriptionLangKey: isBroadcast ? 'DiscussionUnlinkChannelAlert' : 'DiscussionUnlinkGroupAlert',
      descriptionLangArgs: [await wrapPeerTitle({peerId: _linkedChatId.toPeerId(true)})],
      button: {
        langKey: 'DiscussionUnlink'
      }
    });

    const toggle = toggleDisability([btnUnlink], true);
    try {
      await setDiscussionGroup(isBroadcast ? chatId : _linkedChatId, undefined);
    } catch(err) {

    }

    if(!isBroadcast) {
      tab.close();
      return;
    }

    toggle();
  };

  onMount(() => {
    promiseCollector.collect((async() => {
      const p = {
        animationData: lottieLoader.loadAnimationFromURLManually('UtyanDiscussion'),
        chats: tab.managers.appChatsManager.getGroupsForDiscussion()
      };

      const [_isBroadcast, chat, linkedChat] = await Promise.all([
        tab.managers.appChatsManager.isBroadcast(chatId),
        tab.managers.appChatsManager.getChat(chatId) as Promise<Chat.channel | Chat.chat>,
        linkedChatId && tab.managers.appChatsManager.getChat(linkedChatId) as Promise<Chat.channel | Chat.chat>
      ]);

      isBroadcast = _isBroadcast;
      canChangeInfo = hasRights(chat, 'change_info');

      tab.title.replaceChildren(i18n(isBroadcast ? 'DiscussionController.Channel.Title' : 'DiscussionController.Group.Title'));
      tab.container.classList.add('chat-folders-container', 'chat-discussion-container');

      setIsBroadcastSig(isBroadcast);
      setSectionCaption(isBroadcast ? 'DiscussionChannelHelp2' : 'DiscussionGroupHelp2');
      setUnlinkText(isBroadcast ? 'DiscussionUnlinkGroup' : 'DiscussionUnlinkChannel');

      const setCaption = async() => {
        setCaptionEl(i18n(
          linkedChatId ? (isBroadcast ? 'DiscussionChannelGroupSetHelp2' : 'DiscussionGroupHelp') : 'DiscussionChannelHelp3',
          linkedChatId ? [await wrapPeerTitle({peerId: linkedChatId.toPeerId(true)})] : undefined
        ));
      };

      const chatlist = appDialogsManager.createChatList();
      chatlist.classList.add('chatlist');

      let busy = false;
      attachClickEvent(chatlist, async(e) => {
        const el = findUpClassName(e.target, 'chatlist-chat');
        if(!el) {
          return;
        }

        const peerId = el.dataset.peerId.toPeerId();

        if(linkedChatId) {
          appImManager.setInnerPeer({peerId});
          return;
        }

        if(busy) {
          return;
        }

        if(await tab.managers.appPeersManager.isForum(peerId)) {
          toastNew({langPackKey: 'ChannelTopicsDiscussionForbidden'});
          shake(el);
          return;
        }

        const d = document.createDocumentFragment();
        d.append(
          i18n('Discussion.Set.Modal.Text.PublicChannelPublicGroup', [
            await wrapPeerTitle({peerId}),
            await wrapPeerTitle({peerId: chatId.toPeerId(true)})
          ])
        );

        const [isPublicGroup, isPublicChannel, groupChatFull] = await Promise.all([
          tab.managers.appChatsManager.isPublic(peerId.toChatId()),
          tab.managers.appChatsManager.isPublic(chatId),
          tab.managers.appProfileManager.getChatFull(peerId.toChatId())
        ]);

        const br = document.createElement('br');
        if(!isPublicChannel) {
          d.append(br.cloneNode(), br.cloneNode(), i18n('Discussion.Set.PrivateChannel'));
        }

        if(!isPublicGroup) {
          d.append(br.cloneNode(), br.cloneNode(), i18n('Discussion.Set.PrivateGroup'));
        }

        if(groupChatFull._ === 'chatFull' || groupChatFull.pFlags.hidden_prehistory) {
          d.append(br.cloneNode(), br.cloneNode(), i18n('DiscussionLinkGroupAlertHistory'));
        }

        await confirmationPopup({
          peerId: chatId.toPeerId(true),
          description: d,
          button: {
            langKey: 'DiscussionLinkGroup'
          }
        });

        busy = true;
        try {
          await setDiscussionGroup(chatId, peerId.toChatId());
        } catch(err) {
          console.error('setDiscussionGroup error', err);
        }
        busy = false;
      }, {listenerSetter: tab.listenerSetter});

      sectionContent.append(chatlist);

      const loadPromises: Promise<any>[] = [];

      const loadAnimationPromise = p.animationData.then(async(cb) => {
        const player = await cb({
          container: stickerContainer,
          loop: true,
          autoplay: true,
          width: 120,
          height: 120
        });

        return lottieLoader.waitForFirstFrame(player);
      });

      const loadChatsPromise = (
        isBroadcast ?
          p.chats :
          Promise.resolve([])
      ).then((chats) => {
        if(linkedChatId && !chats.some((chat) => chat.id === linkedChatId)) {
          chats.push(linkedChat);
        }

        const promises = chats.map((chat) => {
          const loadPromises: Promise<any>[] = [];
          const {dom} = appDialogsManager.addDialogNew({
            peerId: chat.id.toPeerId(true),
            container: chatlist,
            rippleEnabled: true,
            avatarSize: 'abitbigger',
            loadPromises,
            wrapOptions: {
              middleware: tab.middlewareHelper.get()
            }
          });

          const username = getPeerActiveUsernames(chat)[0];

          if(username) {
            dom.lastMessageSpan.textContent = '@' + username;
          } else {
            dom.lastMessageSpan.append(i18n(isBroadcast ? 'DiscussionController.PrivateGroup' : 'DiscussionController.PrivateChannel'));
          }

          return Promise.all(loadPromises);
        });

        return Promise.all(promises);
      });

      const update = async() => {
        await setCaption();

        if(!isBroadcast) {
          return;
        }

        (Array.from(chatlist.children) as HTMLElement[]).forEach((el) => {
          const _chatId = el.dataset.peerId.toChatId();
          el.classList.toggle('hide', linkedChatId ? linkedChatId !== _chatId : false);
        });
        setUnlinkHidden(!linkedChatId || !canChangeInfo);
        setCreateGroupHidden(!!linkedChatId || !canChangeInfo);
      };

      tab.listenerSetter.add(rootScope)('dialog_migrate', ({migrateFrom, migrateTo}) => {
        const el = chatlist.querySelector(`[data-peer-id="${migrateFrom}"]`) as HTMLElement;
        if(el) {
          el.dataset.peerId = '' + migrateTo;
        }
      });

      tab.listenerSetter.add(rootScope)('chat_full_update', async(updatedChatId) => {
        if(chatId !== updatedChatId) {
          return;
        }

        const channelFull = await tab.managers.appProfileManager.getChannelFull(updatedChatId);
        linkedChatId = channelFull.linked_chat_id;
        update();
      });

      loadPromises.push(loadAnimationPromise, loadChatsPromise);

      await Promise.all(loadPromises);
      await update();
    })());
  });

  return (
    <>
      <div ref={stickerContainer} class="sticker-container" />
      <div class="caption">{captionEl()}</div>
      <Section caption={sectionCaption()} contentProps={{ref: (el) => sectionContent = el}}>
        <Show when={isBroadcastSig() && !createGroupHidden()}>
          <Button
            class="btn-primary btn-transparent primary"
            icon="newgroup"
            text="DiscussionCreateGroup"
            onClick={() => { onCreateGroup(); }}
          />
        </Show>
      </Section>
      <Section classList={{hide: unlinkHidden()}}>
        <Button
          ref={btnUnlink}
          class="btn-primary btn-transparent danger"
          icon="delete"
          text={unlinkText()}
          onClick={() => { onUnlink(); }}
        />
      </Section>
    </>
  );
};

export default ChatDiscussion;
