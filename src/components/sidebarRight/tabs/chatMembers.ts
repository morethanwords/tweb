/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import deferredPromise from '../../../helpers/cancellablePromise';
import {attachClickEvent} from '../../../helpers/dom/clickEvent';
import createParticipantContextMenu from '../../../helpers/dom/createParticipantContextMenu';
import {Chat, ChatFull} from '../../../layer';
import addChatUsers from '../../addChatUsers';
import AppSelectPeers from '../../appSelectPeers';
import ButtonCorner from '../../buttonCorner';
import CheckboxField from '../../checkboxField';
import Row from '../../row';
import SettingSection from '../../settingSection';
import {SliderSuperTabEventable} from '../../sliderTab';

export function createSelectorForTab(options: ConstructorParameters<typeof AppSelectPeers>[0]) {
  const deferred = deferredPromise<void>();
  const selector = new AppSelectPeers({
    ...options,
    multiSelect: false,
    headerSearch: true,
    placeholder: 'SearchPlaceholder',
    meAsSaved: false,
    noShadow: false,
    onFirstRender: () => {
      deferred.resolve();
    }
  });

  return {selector, loadPromise: deferred};
}

export function createSelectorForParticipants(options: ConstructorParameters<typeof AppSelectPeers>[0]) {
  return createSelectorForTab({...options, peerType: ['channelParticipants']});
}

export default class AppChatMembersTab extends SliderSuperTabEventable {
  private addBtn: HTMLButtonElement;
  private selector: AppSelectPeers;

  public async init(chatId: ChatId) {
    const chat = await this.managers.appChatsManager.getChat(chatId) as Chat.channel | Chat.chat;
    const isBroadcast = await this.managers.appChatsManager.isBroadcast(chatId);
    const channelFull = await this.managers.appProfileManager.getChannelFull(chatId).catch(() => undefined as ChatFull.channelFull);
    this.container.classList.add('edit-peer-container', 'chat-members-container');
    this.setTitle(isBroadcast ? 'PeerInfo.Subscribers' : 'GroupMembers');

    this.addBtn = ButtonCorner({icon: 'addmember_filled', className: 'is-visible'});
    this.content.append(this.addBtn);

    attachClickEvent(this.addBtn, () => {
      addChatUsers({
        peerId: chatId.toPeerId(true),
        slider: this.slider
      });
    }, {listenerSetter: this.listenerSetter});

    const participantsCount = (chat as Chat.chat).participants_count/*  + (channelFull?.admins_count || 0) */;
    // const participantsCount = Infinity;
    const canHideMembers = !isBroadcast &&
      participantsCount >= ((await this.managers.apiManager.getAppConfig()).hidden_members_group_size_min || 0) &&
      !!chat.admin_rights;

    const {selector, loadPromise} = createSelectorForParticipants({
      appendTo: this.content,
      managers: this.managers,
      middleware: this.middlewareHelper.get(),
      peerId: chatId.toPeerId(true),
      channelParticipantsUpdateFilter: (participant) => !!participant
    });

    this.selector = selector;

    if(canHideMembers) {
      const section = new SettingSection({
        noDelimiter: true,
        caption: 'ChannelHideMembersInfo'
      });

      const checked = !!channelFull?.pFlags?.participants_hidden;
      const row = new Row({
        titleLangKey: 'ChannelHideMembers',
        icon: 'hide',
        checkboxField: new CheckboxField({
          name: 'hide-members',
          toggle: true,
          listenerSetter: this.listenerSetter,
          checked
        }),
        listenerSetter: this.listenerSetter
      });

      this.eventListener.addEventListener('destroy', () => {
        const _checked = row.checkboxField.checked;
        if(_checked === checked) {
          return;
        }

        this.managers.appChatsManager.toggleParticipantsHidden(chatId, _checked);
      }, {once: true});

      section.content.append(row.container);

      this.selector.scrollable.append(section.container, this.selector.scrollable.container.lastElementChild);
    }

    createParticipantContextMenu({
      chatId,
      listenTo: this.selector.scrollable.container,
      participants: this.selector.participants,
      slider: this.slider,
      middleware: this.middlewareHelper.get()
    });

    return loadPromise;
  }
}
