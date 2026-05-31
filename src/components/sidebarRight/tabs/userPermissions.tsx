import {Component, createEffect, createRoot} from 'solid-js';
import {attachClickEvent} from '@helpers/dom/clickEvent';
import toggleDisability from '@helpers/dom/toggleDisability';
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
import getUserStatusString from '@components/wrappers/getUserStatusString';
import wrapPeerTitle from '@components/wrappers/peerTitle';
import {ChatAdministratorRights, ChatPermissions, createSolidTabState} from '@components/sidebarRight/tabs/groupPermissions/sharedPermissions';
import {isParticipantAdmin, isParticipantCreator, participantAdminPredicates} from '@lib/appManagers/utils/chats/isParticipantAdmin';
import copy from '@helpers/object/copy';
import {handleChannelsTooMuch} from '@components/popups/channelsTooMuch';
import Row from '@components/row';
import formatDuration from '@helpers/formatDuration';
import {wrapFormattedDuration} from '@components/wrappers/wrapDuration';
import {ButtonMenuItemOptions} from '@components/buttonMenu';
import {BANNED_RIGHTS_UNTIL_FOREVER} from '@lib/appManagers/constants';
import tsNow from '@helpers/tsNow';
import showDatePickerPopup from '@components/popups/datePicker';
import {formatDate, formatFullSentTime} from '@helpers/date';
import anchorCallback from '@helpers/dom/anchorCallback';
import appImManager from '@lib/appImManager';
import {useSuperTab} from '@components/solidJsTabs/superTabProvider';
import {usePromiseCollector} from '@components/solidJsTabs/promiseCollector';
import type {AppUserPermissionsTab} from '@components/solidJsTabs/tabs';

const UserPermissions: Component = () => {
  const [tab] = useSuperTab<typeof AppUserPermissionsTab>();
  const promiseCollector = usePromiseCollector();
  const {participant, chatId, userId, editingAdmin} = tab.payload;

  let saveCallback: () => Promise<any>;
  const solidState = createSolidTabState<{
    rights: ChatAdminRights | ChatBannedRights,
    rank: string
  }>({
    tab,
    save: () => handleChannelsTooMuch(saveCallback),
    unsavedConfirmationProps: {}
  });

  tab.header.append(solidState.saveIcon());
  tab.title.replaceChildren(i18n(editingAdmin ? 'EditAdmin' : 'UserRestrictions'));

  promiseCollector.collect((async() => {
    tab.container.classList.add('edit-peer-container', 'user-permissions-container');

    const [chat, isChannel, isGroup, user] = await Promise.all([
      tab.managers.appChatsManager.getChat(chatId) as Promise<Chat.chat | Chat.channel>,
      tab.managers.appChatsManager.isChannel(chatId),
      tab.managers.appPeersManager.isAnyGroup(chatId.toPeerId(true)),
      tab.managers.appUsersManager.getUser(userId)
    ]);
    const isCreator = isParticipantCreator(participant);
    const isAdmin = isParticipantAdmin(participant);
    const _canEditAdmin = canEditAdmin(chat, participant as ChannelParticipant, rootScope.myId);

    let goodTypes: (ChannelParticipant | ChatParticipant)['_'][];
    if(editingAdmin) {
      goodTypes = [...participantAdminPredicates];
    } else {
      goodTypes = [
        'channelParticipantBanned'
      ];
    }

    let chatPermissions: ChatPermissions;
    {
      const section = new SettingSection({
        name: editingAdmin ? 'EditAdminWhatCanDo' : 'UserRestrictionsCanDo',
        caption: editingAdmin ? true : undefined
      });

      const div = document.createElement('div');
      div.classList.add('chatlist-container');
      section.content.insertBefore(div, section.title);

      const list = appDialogsManager.createChatList({new: true});
      div.append(list);

      const {dom} = appDialogsManager.addDialogNew({
        peerId: userId.toPeerId(false),
        container: list,
        rippleEnabled: true,
        avatarSize: 'abitbigger',
        meAsSaved: false,
        wrapOptions: {
          middleware: tab.middlewareHelper.get()
        }
      });

      dom.lastMessageSpan.append(getUserStatusString(user));

      const participantRights = goodTypes.includes(participant._) ?
        (editingAdmin ?
          (participant as ChannelParticipant.channelParticipantAdmin).admin_rights :
          (participant as ChannelParticipant.channelParticipantBanned).banned_rights
        ) :
        undefined;

      const options: ConstructorParameters<typeof ChatAdministratorRights | typeof ChatPermissions>[0] = {
        chatId,
        listenerSetter: tab.listenerSetter,
        appendTo: section.content,
        participant: goodTypes.includes(participant._) ? participant as any : undefined,
        chat,
        canEdit: _canEditAdmin
      };

      if(editingAdmin) {
        options.onSomethingChanged = () => solidState.set({rights: p.takeOut()});
        const p = new ChatAdministratorRights(options);
        if(isAdmin) {
          solidState.setInitial({
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
        tab.listenerSetter.add(field.checkboxField.input)('change', onChange);

        saveCallback = () => {
          if(!_canEditAdmin) {
            return;
          }

          const rights = p.takeOut();
          return tab.managers.appChatsManager.editAdmin(
            chatId,
            participant,
            rights,
            rankInputField?.value
          );
        };
      } else {
        options.onSomethingChanged = () => solidState.set({rights: p.takeOut()});
        const p = chatPermissions = new ChatPermissions(options as any, tab.managers);
        solidState.setInitial({rights: p.takeOut()});

        options.onSomethingChanged();

        saveCallback = () => {
          const rights = p.takeOut();
          return tab.managers.appChatsManager.editBanned(
            chatId,
            participant,
            rights
          );
        };
      }

      tab.scrollable.append(section.container);
    }

    let rankInputField: InputField;
    if(editingAdmin && isGroup) {
      const rankKey: LangPackKey = isParticipantCreator(participant) ? 'Chat.OwnerBadge' : 'ChatAdmin';
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

      const customRank = (participant as ChannelParticipant.channelParticipantAdmin).rank;
      if(customRank) {
        inputField.setOriginalValue(customRank, true);
        solidState.setInitial({rank: customRank});
      }

      tab.listenerSetter.add(inputField.input)('input', () => {
        solidState.set({rank: inputField.value || undefined});
        solidState.setValid(inputField.isValid());
      });

      inputWrapper.append(inputField.container);
      section.content.append(inputWrapper);
      tab.scrollable.append(section.container);
    }

    const saveSomethingDifferent = async(btn: HTMLElement, _callback: () => Promise<any>) => {
      if(solidState.saving()) {
        return;
      }

      const toggle = toggleDisability([btn], true);
      const callback = saveCallback;
      try {
        saveCallback = _callback;
        await solidState.save();
      } catch(err) {
        saveCallback = callback;
        toggle();
        throw err;
      }
    };

    if(editingAdmin) {
      const section = new SettingSection({});

      if(
        !isCreator &&
        _canEditAdmin &&
        isAdmin &&
        getParticipantPeerId(participant) !== rootScope.myId
      ) {
        const btnDelete = Button('btn-primary btn-transparent danger', {icon: 'deleteuser', text: 'Channel.Admin.Dismiss'});

        const removeAdmin = () => tab.managers.appChatsManager.editAdmin(
          chatId,
          participant,
          {_: 'chatAdminRights', pFlags: {}},
          ''
        );

        attachClickEvent(btnDelete, () => {
          saveSomethingDifferent(btnDelete, removeAdmin);
        }, {listenerSetter: tab.listenerSetter});
        section.content.append(btnDelete);
      }

      if(section.content.childElementCount) {
        tab.scrollable.append(section.container);
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
              showDatePickerPopup({
                initDate: new Date(),
                withTime: true,
                onPick: (timestamp) => {
                  getDurationOnClick(timestamp, true)();
                },
                btnConfirmLangKey: 'Set'
              });
            }
          }]
        },
        listenerSetter: tab.listenerSetter
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
        tab.middlewareHelper.get().onDestroy(dispose);

        createEffect(() => {
          updateDurationSubtitle((solidState.store.rights as ChatBannedRights).until_date);
        });
      });

      const restrictedByPeerId = (participant as ChannelParticipant.channelParticipantBanned)?.kicked_by?.toPeerId(false);
      const anchor = restrictedByPeerId ? anchorCallback(() => {
        appImManager.setInnerPeer({peerId: restrictedByPeerId});
      }) : undefined;
      if(restrictedByPeerId) anchor.append(await wrapPeerTitle({peerId: restrictedByPeerId}));
      const section = new SettingSection({
        ...(anchor ? {
          caption: 'UserPermissions.RestrictedBy',
          captionArgs: [
            anchor,
            formatFullSentTime((participant as ChannelParticipant.channelParticipantBanned).date)
          ]
        } : {})
      });

      if(participant._ === 'channelParticipantBanned') {
        const btnDeleteException = Button('btn-primary btn-transparent danger', {icon: 'delete', text: 'GroupPermission.Delete'});

        const clearChannelParticipantBannedRights = () => {
          return tab.managers.appChatsManager.clearChannelParticipantBannedRights(
            chatId,
            participant as ChannelParticipant.channelParticipantBanned
          );
        };

        attachClickEvent(btnDeleteException, () => {
          saveSomethingDifferent(btnDeleteException, clearChannelParticipantBannedRights);
        }, {listenerSetter: tab.listenerSetter});

        section.content.append(btnDeleteException);
      }

      const btnDelete = Button('btn-primary btn-transparent danger', {icon: 'deleteuser', text: 'UserRestrictionsBlock'});

      const kickFromChat = async() => {
        const peerId = userId.toPeerId();
        await confirmationPopup({
          peerId: chatId.toPeerId(true),
          descriptionLangKey: 'Permissions.RemoveFromGroup',
          descriptionLangArgs: [await wrapPeerTitle({peerId: peerId})],
          titleLangKey: 'ChannelBlockUser',
          button: {
            langKey: 'Remove',
            isDanger: true
          }
        });

        await tab.managers.appChatsManager.kickFromChat(chatId, participant);
      };

      attachClickEvent(btnDelete, async() => {
        saveSomethingDifferent(btnDelete, kickFromChat);
      }, {listenerSetter: tab.listenerSetter});

      section.content.append(btnDelete);

      tab.scrollable.append(sectionDuration.container, section.container);
    }
  })());

  return null;
};

export default UserPermissions;
