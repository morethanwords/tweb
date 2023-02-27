/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {attachClickEvent} from '../../../helpers/dom/clickEvent';
import toggleDisability from '../../../helpers/dom/toggleDisability';
import deepEqual from '../../../helpers/object/deepEqual';
import {ChannelParticipant, ChatParticipant} from '../../../layer';
import appDialogsManager from '../../../lib/appManagers/appDialogsManager';
import Button from '../../button';
import confirmationPopup from '../../confirmationPopup';
import SettingSection from '../../settingSection';
import {SliderSuperTabEventable} from '../../sliderTab';
import getUserStatusString from '../../wrappers/getUserStatusString';
import wrapPeerTitle from '../../wrappers/peerTitle';
import {ChatPermissions} from './groupPermissions';

export default class AppUserPermissionsTab extends SliderSuperTabEventable {
  public participant: ChannelParticipant | ChatParticipant;
  public chatId: ChatId;
  public userId: UserId;

  public async init() {
    this.container.classList.add('edit-peer-container', 'user-permissions-container');
    this.setTitle('UserRestrictions');

    let destroyListener: () => void;

    const isChannel = await this.managers.appChatsManager.isChannel(this.chatId);

    {
      const section = new SettingSection({
        name: 'UserRestrictionsCanDo'
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
        avatarSize: 'abitbigger'
      });

      dom.lastMessageSpan.append(getUserStatusString(await this.managers.appUsersManager.getUser(this.userId)));

      const p = new ChatPermissions({
        chatId: this.chatId,
        listenerSetter: this.listenerSetter,
        appendTo: section.content,
        participant: this.participant._ === 'channelParticipantBanned' ? this.participant : undefined
      }, this.managers);

      destroyListener = () => {
        const rights = p.takeOut();
        if(this.participant._ === 'channelParticipantBanned' && deepEqual(this.participant.banned_rights.pFlags, rights.pFlags)) {
          return;
        }

        this.managers.appChatsManager.editBanned(this.chatId, this.participant, rights);
      };

      this.eventListener.addEventListener('destroy', destroyListener, {once: true});

      this.scrollable.append(section.container);
    }

    {
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
