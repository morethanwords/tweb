/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import deferredPromise from '../../../helpers/cancellablePromise';
import {attachClickEvent} from '../../../helpers/dom/clickEvent';
import createParticipantContextMenu from '../../../helpers/dom/createParticipantContextMenu';
import {ChannelParticipant} from '../../../layer';
import {i18n} from '../../../lib/langPack';
import AppSelectPeers from '../../appSelectPeers';
import ButtonCorner from '../../buttonCorner';
import PopupElement from '../../popups';
import PopupPickUser from '../../popups/pickUser';
import SettingSection from '../../settingSection';
import {SliderSuperTabEventable} from '../../sliderTab';
import wrapPeerTitle from '../../wrappers/peerTitle';
import {createSelectorForParticipants} from './chatMembers';

export default class AppRemovedUsersTab extends SliderSuperTabEventable {
  private addBtn: HTMLButtonElement;
  private selector: AppSelectPeers;

  public async init(chatId: ChatId) {
    const isBroadcast = await this.managers.appChatsManager.isBroadcast(chatId);
    this.container.classList.add('edit-peer-container', 'removed-users-container');
    this.setTitle('ChannelBlacklist');

    this.addBtn = ButtonCorner({icon: 'addmember_filled', className: 'is-visible'});
    this.content.append(this.addBtn);

    attachClickEvent(this.addBtn, () => {
      const popup = PopupElement.createPopup(
        PopupPickUser,
        {
          peerType: ['channelParticipants'],
          peerId: chatId.toPeerId(true),
          onSelect: (peerId) => {
            const participant = popup.selector.participants.get(peerId);
            this.managers.appChatsManager.kickFromChat(chatId, participant);
          },
          placeholder: 'SearchPlaceholder'
        }
      );
    }, {listenerSetter: this.listenerSetter});

    const {selector, loadPromise} = createSelectorForParticipants({
      appendTo: this.content,
      managers: this.managers,
      middleware: this.middlewareHelper.get(),
      peerId: chatId.toPeerId(true),
      channelParticipantsFilter: (q) => ({_: 'channelParticipantsKicked', q}),
      channelParticipantsUpdateFilter: (participant) => participant?._ === 'channelParticipantBanned' && participant.pFlags.left,
      getSubtitleForElement: async(peerId) => {
        const participant = this.selector.participants.get(peerId);
        const kickedBy = (participant as ChannelParticipant.channelParticipantBanned).kicked_by.toPeerId(false);
        return i18n('UserRemovedBy', [await wrapPeerTitle({peerId: kickedBy})]);
      }
      // onSelect: (peerId) => {
      //   const participant = this.selector.participants.get(peerId);
      //   openPermissions(participant);
      // },
    });

    this.selector = selector;

    const section = new SettingSection({
      noDelimiter: true,
      caption: isBroadcast ? 'NoBlockedChannel2' : 'NoBlockedGroup2'
      // name: 'FilterChatTypes'
    });

    section.container.firstElementChild.remove();
    this.selector.scrollable.container.firstElementChild.remove();
    this.selector.scrollable.container.append(section.container, this.selector.scrollable.container.lastElementChild);

    createParticipantContextMenu({
      listenTo: this.selector.scrollable.container,
      slider: this.slider,
      chatId,
      participants: this.selector.participants,
      middleware: this.middlewareHelper.get()
    });

    return loadPromise;
  }
}
