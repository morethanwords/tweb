import {Component} from 'solid-js';
import {attachClickEvent} from '@helpers/dom/clickEvent';
import {createSelectorForTab} from '@components/sidebarRight/tabs/participantsSelector';
import {getImportersLoader} from '@components/sidebarRight/tabs/chatInviteLinkShared';
import {formatFullSentTime} from '@helpers/date';
import Button from '@components/button';
import {i18n} from '@lib/langPack';
import findUpClassName from '@helpers/dom/findUpClassName';
import {DialogElement} from '@lib/appDialogsManager';
import {useSuperTab} from '@components/solidJsTabs/superTabProvider';
import {usePromiseCollector} from '@components/solidJsTabs/promiseCollector';
import {useHotReloadGuard} from '@lib/solidjs/hotReloadGuard';
import type {AppChatRequestsTab} from '@components/solidJsTabs/tabs';

const ChatRequests: Component = () => {
  const [tab] = useSuperTab<typeof AppChatRequestsTab>();
  const promiseCollector = usePromiseCollector();
  const {appImManager} = useHotReloadGuard();
  const chatId = tab.payload;

  promiseCollector.collect((async() => {
    const isBroadcast = await tab.managers.appChatsManager.isBroadcast(chatId);
    tab.container.classList.add('edit-peer-container', 'chat-members-container', 'chat-requests-container');
    tab.title.replaceChildren(i18n(isBroadcast ? 'SubscribeRequests' : 'MemberRequests'));

    const {importersMap, deleteImporter, load} = getImportersLoader({
      chatId,
      managers: tab.managers,
      requested: true,
      link: undefined
    });

    const dialogElements: Map<PeerId, DialogElement> = new Map();
    const {selector, loadPromise} = createSelectorForTab({
      appendTo: tab.content,
      managers: tab.managers,
      middleware: tab.middlewareHelper.get(),
      peerId: chatId.toPeerId(true),
      peerType: ['custom'],
      getMoreCustom: load,
      getSubtitleForElement: (peerId) => i18n('RequestedToJoinAt', [formatFullSentTime(importersMap.get(peerId)?.date)]),
      processElementAfter: (peerId, dialogElement) => {
        const buttons = document.createElement('div');
        buttons.classList.add('chatlist-chat-buttons');
        const button = Button('btn-primary btn-control-small btn-color-primary', {text: isBroadcast ? 'AddToChannel' : 'AddToGroup'});
        const button2 = Button('btn-transparent btn-control-small primary', {text: 'Dismiss'});
        buttons.append(button, button2);
        dialogElement.container.append(buttons);
        dialogElements.set(peerId, dialogElement);
      },
      placeholderElementsGap: 36
    });

    let changedLength = 0;
    attachClickEvent(selector.scrollable.container, async(e) => {
      const target = findUpClassName(e.target as HTMLElement, 'chatlist-chat');
      if(!target) {
        return;
      }

      const peerId = target.dataset.peerId.toPeerId();
      const dialogElement = dialogElements.get(peerId);

      const addButton = findUpClassName(e.target, 'btn-color-primary');
      const dismissButton = findUpClassName(e.target, 'btn-transparent');
      const add = addButton ? true : (dismissButton ? false : undefined);

      if(add === undefined) {
        appImManager.setInnerPeer({peerId});
        return;
      }

      const toggle = dialogElement.toggleDisability(true);
      try {
        await tab.managers.appChatsManager.hideChatJoinRequest(chatId, peerId, add);
        ++changedLength;
        selector.deletePeerId(peerId);
        dialogElements.delete(peerId);
        deleteImporter(peerId);
      } catch(err) {
        toggle();
      }
    }, {listenerSetter: tab.listenerSetter});

    tab.eventListener.addEventListener('close', () => {
      tab.eventListener.dispatchEvent('finish', changedLength);
    });

    await loadPromise;
  })());

  return null;
};

export default ChatRequests;
