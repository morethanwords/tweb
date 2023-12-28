/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import deferredPromise from '../../../helpers/cancellablePromise';
import {attachClickEvent} from '../../../helpers/dom/clickEvent';
import createParticipantContextMenu from '../../../helpers/dom/createParticipantContextMenu';
import {ChannelParticipant, Chat, ChatFull, ChatParticipant} from '../../../layer';
import {i18n} from '../../../lib/langPack';
import rootScope from '../../../lib/rootScope';
import AppSelectPeers from '../../appSelectPeers';
import ButtonCorner from '../../buttonCorner';
import CheckboxField from '../../checkboxField';
import PopupElement from '../../popups';
import PopupPickUser from '../../popups/pickUser';
import Row from '../../row';
import SettingSection from '../../settingSection';
import {SliderSuperTabEventable} from '../../sliderTab';
import wrapPeerTitle from '../../wrappers/peerTitle';
import AppUserPermissionsTab from './userPermissions';

export function createSelectorForParticipants(options: ConstructorParameters<typeof AppSelectPeers>[0]) {
  const deferred = deferredPromise<void>();
  const selector = new AppSelectPeers({
    ...options,
    peerType: ['channelParticipants'],
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

export default class AppChatAdministratorsTab extends SliderSuperTabEventable {
  private addBtn: HTMLButtonElement;
  private selector: AppSelectPeers;

  public static getInitArgs(chatId: ChatId) {
    return {
      chatFull: rootScope.managers.appProfileManager.getChatFull(chatId),
      appConfig: rootScope.managers.apiManager.getAppConfig()
    };
  }

  public async init({
    chatId,
    p = AppChatAdministratorsTab.getInitArgs(chatId)
  }: {
    chatId: ChatId,
    p: ReturnType<typeof AppChatAdministratorsTab['getInitArgs']>
  }) {
    const peerId = chatId.toPeerId(true);
    this.container.classList.add('edit-peer-container', 'chat-administrators-container');
    this.setTitle('PeerInfo.Administrators');

    const [chat, isBroadcast, chatFull, appConfig] = await Promise.all([
      this.managers.appChatsManager.getChat(chatId),
      this.managers.appChatsManager.isBroadcast(chatId),
      p.chatFull,
      p.appConfig
    ]);

    this.addBtn = ButtonCorner({icon: 'addmember_filled', className: 'is-visible'});
    this.content.append(this.addBtn);

    attachClickEvent(this.addBtn, () => {
      const popup = PopupElement.createPopup(
        PopupPickUser,
        {
          peerType: ['channelParticipants'],
          peerId,
          onSelect: (peerId) => {
            const participant = popup.selector.participants.get(peerId);
            openPermissions(participant);
          },
          placeholder: 'SearchPlaceholder'
        }
      );
    }, {listenerSetter: this.listenerSetter});

    const openPermissions = async(participant: ChatParticipant | ChannelParticipant) => {
      AppUserPermissionsTab.openTab(this.slider, chatId, participant, true);
    };

    const canToggleAntiSpam = !isBroadcast && (chat as Chat.chat | Chat.channel).participants_count >= appConfig.telegram_antispam_group_size_min;

    const {selector, loadPromise} = createSelectorForParticipants({
      appendTo: this.content,
      managers: this.managers,
      middleware: this.middlewareHelper.get(),
      peerId,
      channelParticipantsFilter: (q) => {
        return {_: 'channelParticipantsAdmins', q};
      },
      getSubtitleForElement: async(peerId) => {
        const participant = this.selector.participants.get(peerId);
        if(participant._ === 'channelParticipantCreator' || participant._ === 'chatParticipantCreator') {
          return i18n('ChannelCreator');
        }

        const promotedBy = (participant as ChannelParticipant.channelParticipantAdmin).promoted_by.toPeerId(false);
        return i18n('EditAdminPromotedBy', [await wrapPeerTitle({peerId: promotedBy})]);
      },
      onSelect: (peerId) => {
        const participant = this.selector.participants.get(peerId);
        openPermissions(participant);
      },
      channelParticipantsUpdateFilter: (participant) => {
        return ([
          'channelParticipantAdmin',
          'channelParticipantCreator'
        ] as ChannelParticipant['_'][]).includes(participant?._);
      }
      // noDelimiter: canToggleAntiSpam
    });

    this.selector = selector;

    if(canToggleAntiSpam) {
      const section = new SettingSection({
        noDelimiter: true,
        caption: 'ChannelAntiSpamInfo'
      });

      const checked = !!(chatFull as ChatFull.channelFull)?.pFlags?.antispam;
      const row = new Row({
        titleLangKey: 'ChannelAntiSpam',
        // icon: 'hide',
        checkboxField: new CheckboxField({
          name: 'agg',
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

        this.managers.appChatsManager.toggleAntiSpam(chatId, _checked);
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
