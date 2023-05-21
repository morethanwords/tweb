/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {attachClickEvent} from '../../../helpers/dom/clickEvent';
import toggleDisability from '../../../helpers/dom/toggleDisability';
import deepEqual from '../../../helpers/object/deepEqual';
import {ChannelParticipant, Chat, ChatParticipant} from '../../../layer';
import appDialogsManager from '../../../lib/appManagers/appDialogsManager';
import canEditAdmin from '../../../lib/appManagers/utils/chats/canEditAdmin';
import getParticipantPeerId from '../../../lib/appManagers/utils/chats/getParticipantPeerId';
import {LangPackKey, i18n} from '../../../lib/langPack';
import rootScope from '../../../lib/rootScope';
import Button from '../../button';
import confirmationPopup from '../../confirmationPopup';
import InputField from '../../inputField';
import SettingSection from '../../settingSection';
import SidebarSlider from '../../slider';
import {SliderSuperTabEventable} from '../../sliderTab';
import getUserStatusString from '../../wrappers/getUserStatusString';
import wrapPeerTitle from '../../wrappers/peerTitle';
import {ChatAdministratorRights, ChatPermissions} from './groupPermissions';

export default class AppUserPermissionsTab extends SliderSuperTabEventable {
  public participant: ChannelParticipant | ChatParticipant;
  public chatId: ChatId;
  public userId: UserId;
  public isAdmin: boolean;

  public static openTab = (
    slider: SidebarSlider,
    chatId: ChatId,
    participant: ChatParticipant | ChannelParticipant,
    isAdmin?: boolean
  ) => {
    const tab = slider.createTab(AppUserPermissionsTab);
    tab.participant = participant;
    tab.chatId = chatId;
    tab.userId = getParticipantPeerId(participant).toUserId();
    tab.isAdmin = isAdmin;
    tab.open();
  };

  public async init() {
    this.container.classList.add('edit-peer-container', 'user-permissions-container');
    this.setTitle(this.isAdmin ? 'EditAdmin' : 'UserRestrictions');

    let destroyListener: () => void;

    const chat = await this.managers.appChatsManager.getChat(this.chatId) as Chat.chat | Chat.channel;
    const isChannel = await this.managers.appChatsManager.isChannel(this.chatId);
    const isGroup = await this.managers.appPeersManager.isAnyGroup(this.chatId.toPeerId(true));
    const isCreator = this.participant?._ === 'channelParticipantCreator';
    const _canEditAdmin = canEditAdmin(chat, this.participant as ChannelParticipant, rootScope.myId);;

    let goodTypes: (ChannelParticipant | ChatParticipant)['_'][];
    if(this.isAdmin) {
      goodTypes = [
        'channelParticipantAdmin',
        'channelParticipantCreator'
      ];
    } else {
      goodTypes = [
        'channelParticipantBanned'
      ];
    }

    {
      const section = new SettingSection({
        name: this.isAdmin ? 'EditAdminWhatCanDo' : 'UserRestrictionsCanDo',
        caption: this.isAdmin ? true : undefined
      });

      const div = document.createElement('div');
      div.classList.add('chatlist-container');
      section.content.insertBefore(div, section.title);

      const list = appDialogsManager.createChatList({new: true});
      div.append(list);

      const {dom} = appDialogsManager.addDialogNew({
        peerId: this.userId.toPeerId(false),
        container: list,
        rippleEnabled: true,
        avatarSize: 'abitbigger',
        meAsSaved: false
      });

      dom.lastMessageSpan.append(getUserStatusString(await this.managers.appUsersManager.getUser(this.userId)));

      const options: ConstructorParameters<typeof ChatAdministratorRights>[0] = {
        chatId: this.chatId,
        listenerSetter: this.listenerSetter,
        appendTo: section.content,
        participant: goodTypes.includes(this.participant._) ? this.participant as any : undefined,
        chat,
        canEdit: _canEditAdmin
      };

      const participantFlags = goodTypes.includes(this.participant._) ?
        (this.isAdmin ? (this.participant as ChannelParticipant.channelParticipantAdmin).admin_rights : (this.participant as ChannelParticipant.channelParticipantBanned).banned_rights).pFlags :
        undefined;

      if(this.isAdmin) {
        const p = new ChatAdministratorRights(options);

        const field = p.fields[p.fields.length - 1];

        const onChange = () => {
          section.caption.replaceChildren(i18n(_canEditAdmin ? (field.checkboxField.checked ? 'Channel.Admin.AdminAccess' : 'Channel.Admin.AdminRestricted') : 'EditAdminCantEdit'));
        };

        onChange();
        this.listenerSetter.add(field.checkboxField.input)('change', onChange);

        destroyListener = () => {
          if(!canEditAdmin) {
            return;
          }

          const rights = p.takeOut();
          if(participantFlags && deepEqual(participantFlags, rights.pFlags)) {
            return;
          }

          this.managers.appChatsManager.editAdmin(
            this.chatId,
            this.participant,
            rights,
            rankInputField?.value
          );
        };
      } else {
        const p = new ChatPermissions(options as any, this.managers);

        destroyListener = () => {
          const rights = p.takeOut();
          if(participantFlags && deepEqual(participantFlags, rights.pFlags)) {
            return;
          }

          this.managers.appChatsManager.editBanned(
            this.chatId,
            this.participant,
            rights
          );
        };
      }

      this.eventListener.addEventListener('destroy', destroyListener, {once: true});

      this.scrollable.append(section.container);
    }

    let rankInputField: InputField;
    if(this.isAdmin && isGroup) {
      const rankKey: LangPackKey = this.participant._ === 'channelParticipantCreator' ? 'Chat.OwnerBadge' : 'ChatAdmin';
      const section = new SettingSection({
        name: 'EditAdminRank',
        caption: 'EditAdminRankInfo',
        captionArgs: [i18n(rankKey)]
      });

      const inputWrapper = document.createElement('div');
      inputWrapper.classList.add('input-wrapper');

      const inputField = rankInputField = new InputField({
        name: 'rank',
        placeholder: rankKey,
        maxLength: 16,
        canBeEdited: _canEditAdmin
      });

      const customRank = (this.participant as ChannelParticipant.channelParticipantAdmin).rank;
      if(customRank) {
        inputField.setOriginalValue(customRank, true);
      }

      inputWrapper.append(inputField.container);
      section.content.append(inputWrapper);
      this.scrollable.append(section.container);
    }

    if(this.isAdmin) {
      const section = new SettingSection({});

      if(!isCreator && canEditAdmin) {
        const btnDelete = Button('btn-primary btn-transparent danger', {icon: 'deleteuser', text: 'Channel.Admin.Dismiss'});
        attachClickEvent(btnDelete, async() => {
          const toggle = toggleDisability([btnDelete], true);

          try {
            await this.managers.appChatsManager.editAdmin(
              this.chatId,
              this.participant,
              {_: 'chatAdminRights', pFlags: {}},
              ''
            );
          } catch(err) {
            toggle();
            return;
          }

          this.eventListener.removeEventListener('destroy', destroyListener);
          this.close();
        }, {listenerSetter: this.listenerSetter});
        section.content.append(btnDelete);
      }

      if(section.content.childElementCount) {
        this.scrollable.append(section.container);
      }
    } else {
      const section = new SettingSection({});

      if(this.participant._ === 'channelParticipantBanned') {
        const btnDeleteException = Button('btn-primary btn-transparent danger', {icon: 'delete', text: 'GroupPermission.Delete'});

        attachClickEvent(btnDeleteException, () => {
          const toggle = toggleDisability([btnDeleteException], true);
          this.managers.appChatsManager.clearChannelParticipantBannedRights(
            this.chatId,
            this.participant as ChannelParticipant.channelParticipantBanned
          ).then(() => {
            this.eventListener.removeEventListener('destroy', destroyListener);
            this.close();
          }, () => {
            toggle();
          });
        }, {listenerSetter: this.listenerSetter});

        section.content.append(btnDeleteException);
      }

      const btnDelete = Button('btn-primary btn-transparent danger', {icon: 'deleteuser', text: 'UserRestrictionsBlock'});

      attachClickEvent(btnDelete, async() => {
        const toggle = toggleDisability([btnDelete], true);

        try {
          const peerId = this.userId.toPeerId();
          await confirmationPopup({
            peerId: this.chatId.toPeerId(true),
            descriptionLangKey: 'Permissions.RemoveFromGroup',
            descriptionLangArgs: [await wrapPeerTitle({peerId: peerId})],
            titleLangKey: 'ChannelBlockUser',
            button: {
              langKey: 'Remove',
              isDanger: true
            }
          });

          if(!isChannel) {
            await this.managers.appChatsManager.kickFromChat(this.chatId, this.participant);
          } else {
            await this.managers.appChatsManager.kickFromChannel(this.chatId, this.participant as ChannelParticipant);
          }
        } catch(err) {
          toggle();
          return;
        }

        this.eventListener.removeEventListener('destroy', destroyListener);
        this.close();
      }, {listenerSetter: this.listenerSetter});

      section.content.append(btnDelete);

      this.scrollable.append(section.container);
    }
  }
}
