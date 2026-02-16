/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {attachClickEvent} from '@helpers/dom/clickEvent';
import toggleDisability from '@helpers/dom/toggleDisability';
import deepEqual from '@helpers/object/deepEqual';
import {ChannelParticipant, Chat, ChatAdminRights, ChatBannedRights, ChatParticipant} from '@layer';
import appDialogsManager from '@lib/appDialogsManager';
import canEditAdmin from '@appManagers/utils/chats/canEditAdmin';
import getParticipantPeerId from '@appManagers/utils/chats/getParticipantPeerId';
import {LangPackKey, i18n} from '@lib/langPack';
import rootScope from '@lib/rootScope';
import Button from '@components/button';
import confirmationPopup from '@components/confirmationPopup';
import InputField from '@components/inputField';
import SettingSection from '@components/settingSection';
import SidebarSlider from '@components/slider';
import {SliderSuperTabEventable} from '@components/sliderTab';
import {providedTabs} from '@components/solidJsTabs';
import getUserStatusString from '@components/wrappers/getUserStatusString';
import wrapPeerTitle from '@components/wrappers/peerTitle';
import {ChatAdministratorRights, ChatPermissions, createSolidTabState} from '@components/sidebarRight/tabs/groupPermissions';
import {isParticipantAdmin, isParticipantCreator, participantAdminPredicates} from '@lib/appManagers/utils/chats/isParticipantAdmin';
import copy from '@helpers/object/copy';
import {handleChannelsTooMuch} from '@components/popups/channelsTooMuch';
import Row from '@components/row';
import formatDuration from '@helpers/formatDuration';
import {wrapFormattedDuration} from '@components/wrappers/wrapDuration';
import {ButtonMenuItemOptions} from '@components/buttonMenu';
import {BANNED_RIGHTS_UNTIL_FOREVER} from '@lib/appManagers/constants';
import tsNow from '@helpers/tsNow';
import PopupSchedule from '@components/popups/schedule';
import PopupElement from '@components/popups';
import {formatDate, formatFullSentTime} from '@helpers/date';
import {createEffect, createRoot} from 'solid-js';
import anchorCallback from '@helpers/dom/anchorCallback';
import appImManager from '@lib/appImManager';

export default class AppUserPermissionsTab extends SliderSuperTabEventable {
  public participant: ChannelParticipant | ChatParticipant;
  public chatId: ChatId;
  public userId: UserId;
  public editingAdmin: boolean;

  private saveCallback: () => Promise<any>;
  private solidState = createSolidTabState<{
    rights: ChatAdminRights | ChatBannedRights,
    rank: string
  }>({
    tab: this,
    save: () => handleChannelsTooMuch(this.saveCallback),
    unsavedConfirmationProps: {}
  });

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
    tab.editingAdmin = isAdmin;
    tab.open();
  };

  public async init() {
    this.container.classList.add('edit-peer-container', 'user-permissions-container');
    this.setTitle(this.editingAdmin ? 'EditAdmin' : 'UserRestrictions');

    this.header.append(this.solidState.saveIcon());

    const [chat, isChannel, isGroup, user] = await Promise.all([
      this.managers.appChatsManager.getChat(this.chatId) as Promise<Chat.chat | Chat.channel>,
      this.managers.appChatsManager.isChannel(this.chatId),
      this.managers.appPeersManager.isAnyGroup(this.chatId.toPeerId(true)),
      this.managers.appUsersManager.getUser(this.userId)
    ]);
    const isCreator = isParticipantCreator(this.participant);
    const isAdmin = isParticipantAdmin(this.participant);
    const _canEditAdmin = canEditAdmin(chat, this.participant as ChannelParticipant, rootScope.myId);

    let goodTypes: (ChannelParticipant | ChatParticipant)['_'][];
    if(this.editingAdmin) {
      goodTypes = [...participantAdminPredicates];
    } else {
      goodTypes = [
        'channelParticipantBanned'
      ];
    }

    let chatPermissions: ChatPermissions;
    {
      const section = new SettingSection({
        name: this.editingAdmin ? 'EditAdminWhatCanDo' : 'UserRestrictionsCanDo',
        caption: this.editingAdmin ? true : undefined
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
        meAsSaved: false,
        wrapOptions: {
          middleware: this.middlewareHelper.get()
        }
      });

      dom.lastMessageSpan.append(getUserStatusString(user));

      const participantRights = goodTypes.includes(this.participant._) ?
        (this.editingAdmin ?
          (this.participant as ChannelParticipant.channelParticipantAdmin).admin_rights :
          (this.participant as ChannelParticipant.channelParticipantBanned).banned_rights
        ) :
        undefined;

      const options: ConstructorParameters<typeof ChatAdministratorRights | typeof ChatPermissions>[0] = {
        chatId: this.chatId,
        listenerSetter: this.listenerSetter,
        appendTo: section.content,
        participant: goodTypes.includes(this.participant._) ? this.participant as any : undefined,
        chat,
        canEdit: _canEditAdmin
      };

      if(this.editingAdmin) {
        options.onSomethingChanged = () => this.solidState.set({rights: p.takeOut()});
        const p = new ChatAdministratorRights(options);
        if(isAdmin) {
          this.solidState.setInitial({
            rights: copy(isChannel ? participantRights : p.takeOut())
          });
        }

        options.onSomethingChanged();

        const field = p.fields.find((field) => field.flags[0] === 'add_admins');

        const onChange = () => {
          section.caption.replaceChildren(i18n(
            _canEditAdmin ?
              (field.checkboxField.checked ? 'Channel.Admin.AdminAccess' : 'Channel.Admin.AdminRestricted') :
              'EditAdminCantEdit'
          ));
        };

        onChange();
        this.listenerSetter.add(field.checkboxField.input)('change', onChange);

        this.saveCallback = () => {
          if(!_canEditAdmin) {
            return;
          }

          const rights = p.takeOut();
          return this.managers.appChatsManager.editAdmin(
            this.chatId,
            this.participant,
            rights,
            rankInputField?.value
          );
        };
      } else {
        options.onSomethingChanged = () => this.solidState.set({rights: p.takeOut()});
        const p = chatPermissions = new ChatPermissions(options as any, this.managers);
        this.solidState.setInitial({rights: p.takeOut()});

        options.onSomethingChanged();

        this.saveCallback = () => {
          const rights = p.takeOut();
          return this.managers.appChatsManager.editBanned(
            this.chatId,
            this.participant,
            rights
          );
        };
      }

      this.scrollable.append(section.container);
    }

    let rankInputField: InputField;
    if(this.editingAdmin && isGroup) {
      const rankKey: LangPackKey = isParticipantCreator(this.participant) ? 'Chat.OwnerBadge' : 'ChatAdmin';
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
        canBeEdited: _canEditAdmin,
        label: 'Rank.Label'
      });

      const customRank = (this.participant as ChannelParticipant.channelParticipantAdmin).rank;
      if(customRank) {
        inputField.setOriginalValue(customRank, true);
        this.solidState.setInitial({rank: customRank});
      }

      this.listenerSetter.add(inputField.input)('input', () => {
        this.solidState.set({rank: inputField.value || undefined});
        this.solidState.setValid(inputField.isValid());
      });

      inputWrapper.append(inputField.container);
      section.content.append(inputWrapper);
      this.scrollable.append(section.container);
    }

    const saveSomethingDifferent = async(btn: HTMLElement, _callback: () => Promise<any>) => {
      if(this.solidState.saving()) {
        return;
      }

      const toggle = toggleDisability([btn], true);
      const callback = this.saveCallback;
      try {
        this.saveCallback = _callback;
        await this.solidState.save();
      } catch(err) {
        this.saveCallback = callback;
        toggle();
        throw err;
      }
    };

    if(this.editingAdmin) {
      const section = new SettingSection({});

      if(
        !isCreator &&
        _canEditAdmin &&
        isAdmin &&
        getParticipantPeerId(this.participant) !== rootScope.myId
      ) {
        const btnDelete = Button('btn-primary btn-transparent danger', {icon: 'deleteuser', text: 'Channel.Admin.Dismiss'});

        const removeAdmin = () => this.managers.appChatsManager.editAdmin(
          this.chatId,
          this.participant,
          {_: 'chatAdminRights', pFlags: {}},
          ''
        );

        attachClickEvent(btnDelete, () => {
          saveSomethingDifferent(btnDelete, removeAdmin);
        }, {listenerSetter: this.listenerSetter});
        section.content.append(btnDelete);
      }

      if(section.content.childElementCount) {
        this.scrollable.append(section.container);
      }
    } else {
      const sectionDuration = new SettingSection({});

      const wrapDuration = (duration: number) => {
        return wrapFormattedDuration(formatDuration(duration, 1));
      };

      const getDurationOnClick = (duration: number, isTimestamp: boolean) => {
        const timestamp = isTimestamp ? duration : tsNow(true) + duration;
        return () => chatPermissions.setUntilDate(timestamp);
      };

      const rowDuration = new Row({
        titleLangKey: 'UserPermissions.Duration',
        subtitle: true,
        clickable: (e) => {
          rowDuration.openContextMenu(e);
        },
        contextMenu: {
          buttons: [{
            text: 'UserPermissions.Duration.Forever',
            onClick: getDurationOnClick(BANNED_RIGHTS_UNTIL_FOREVER, true)
          }, ...[86400, 86400 * 7, 86400 * 365 / 12].map((duration) => {
            const options: ButtonMenuItemOptions = {
              regularText: wrapDuration(duration),
              onClick: getDurationOnClick(duration, false)
            };

            return options;
          }), {
            text: 'UserPermissions.Duration.Custom',
            onClick: () => {
              PopupElement.createPopup(PopupSchedule, {
                initDate: new Date(),
                onPick: (timestamp) => {
                  getDurationOnClick(timestamp, true)();
                },
                btnConfirmLangKey: 'Set'
              }).show();
            }
          }]
        },
        listenerSetter: this.listenerSetter
      });

      sectionDuration.content.append(rowDuration.container);

      const updateDurationSubtitle = (timestamp: number) => {
        rowDuration.subtitle.replaceChildren(
          timestamp === BANNED_RIGHTS_UNTIL_FOREVER ?
           i18n('UserPermissions.Duration.Forever') :
           formatDate(new Date(timestamp * 1000), {withTime: true})
        );
      };

      createRoot((dispose) => {
        this.middlewareHelper.get().onDestroy(dispose);

        createEffect(() => {
          updateDurationSubtitle((this.solidState.store.rights as ChatBannedRights).until_date);
        });
      });

      const restrictedByPeerId = (this.participant as ChannelParticipant.channelParticipantBanned)?.kicked_by?.toPeerId(false);
      const anchor = restrictedByPeerId ? anchorCallback(() => {
        appImManager.setInnerPeer({peerId: restrictedByPeerId});
      }) : undefined;
      if(restrictedByPeerId) anchor.append(await wrapPeerTitle({peerId: restrictedByPeerId}));
      const section = new SettingSection({
        ...(anchor ? {
          caption: 'UserPermissions.RestrictedBy',
          captionArgs: [
            anchor,
            formatFullSentTime((this.participant as ChannelParticipant.channelParticipantBanned).date)
          ]
        } : {})
      });

      if(this.participant._ === 'channelParticipantBanned') {
        const btnDeleteException = Button('btn-primary btn-transparent danger', {icon: 'delete', text: 'GroupPermission.Delete'});

        const clearChannelParticipantBannedRights = () => {
          return this.managers.appChatsManager.clearChannelParticipantBannedRights(
            this.chatId,
            this.participant as ChannelParticipant.channelParticipantBanned
          );
        };

        attachClickEvent(btnDeleteException, () => {
          saveSomethingDifferent(btnDeleteException, clearChannelParticipantBannedRights);
        }, {listenerSetter: this.listenerSetter});

        section.content.append(btnDeleteException);
      }

      const btnDelete = Button('btn-primary btn-transparent danger', {icon: 'deleteuser', text: 'UserRestrictionsBlock'});

      const kickFromChat = async() => {
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

        await this.managers.appChatsManager.kickFromChat(this.chatId, this.participant);
      };

      attachClickEvent(btnDelete, async() => {
        saveSomethingDifferent(btnDelete, kickFromChat);
      }, {listenerSetter: this.listenerSetter});

      section.content.append(btnDelete);

      this.scrollable.append(sectionDuration.container, section.container);
    }
  }
}

providedTabs.AppUserPermissionsTab = AppUserPermissionsTab;
