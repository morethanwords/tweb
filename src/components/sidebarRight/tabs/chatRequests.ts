/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {attachClickEvent} from '../../../helpers/dom/clickEvent';
import {SliderSuperTabEventable} from '../../sliderTab';
import {createSelectorForTab} from './chatMembers';
import {getImportersLoader} from './chatInviteLink';
import {formatFullSentTime} from '../../../helpers/date';
import Button from '../../button';
import {i18n} from '../../../lib/langPack';
import findUpClassName from '../../../helpers/dom/findUpClassName';
import appImManager from '../../../lib/appManagers/appImManager';
import {DialogElement} from '../../../lib/appManagers/appDialogsManager';

export default class AppChatRequestsTab extends SliderSuperTabEventable<{
  finish: (changedLength: number) => void
}> {
  public async init(chatId: ChatId, link?: string) {
    const isBroadcast = await this.managers.appChatsManager.isBroadcast(chatId);
    this.container.classList.add('edit-peer-container', 'chat-members-container', 'chat-requests-container');
    this.setTitle(isBroadcast ? 'SubscribeRequests' : 'MemberRequests');

    const {importersMap, deleteImporter, load} = getImportersLoader({
      chatId,
      managers: this.managers,
      requested: true,
      link
    });

    const dialogElements: Map<PeerId, DialogElement> = new Map();
    const {selector, loadPromise} = createSelectorForTab({
      appendTo: this.content,
      managers: this.managers,
      middleware: this.middlewareHelper.get(),
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
        await this.managers.appChatsManager.hideChatJoinRequest(chatId, peerId, add);
        ++changedLength;
        selector.deletePeerId(peerId);
        dialogElements.delete(peerId);
        deleteImporter(peerId);
      } catch(err) {
        toggle();
      }
    }, {listenerSetter: this.listenerSetter});

    this.eventListener.addEventListener('close', () => {
      this.eventListener.dispatchEvent('finish', changedLength);
    });

    return loadPromise;
  }
}
