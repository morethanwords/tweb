import {Component, createEffect, createRoot} from 'solid-js';
import {attachClickEvent} from '@helpers/dom/clickEvent';
import toggleDisability from '@helpers/dom/toggleDisability';
import {ChannelParticipant, Chat, ChatAdminRights, ChatBannedRights, ChatParticipant} from '@layer';
import canEditAdmin from '@appManagers/utils/chats/canEditAdmin';
import getParticipantPeerId from '@appManagers/utils/chats/getParticipantPeerId';
import {LangPackKey, i18n} from '@lib/langPack';
import rootScope from '@lib/rootScope';
import Button from '@components/button';
import confirmationPopup from '@components/confirmationPopup';
import {toastNew} from '@components/toast';
import InputField from '@components/inputField';
import SettingSection from '@components/settingSection';
import wrapPeerTitle from '@components/wrappers/peerTitle';
import {
  ChatAdministratorRights,
  ChatPermissions,
  createSolidTabState
} from '@components/sidebarRight/tabs/groupPermissions/sharedPermissions';
import {isParticipantAdmin, isParticipantCreator, participantAdminPredicates} from '@lib/appManagers/utils/chats/isParticipantAdmin';
import copy from '@helpers/object/copy';
import {handleChannelsTooMuch} from '@components/popups/channelsTooMuch';
import Row from '@components/row';
import formatDuration from '@helpers/formatDuration';
import {wrapFormattedDuration} from '@components/wrappers/wrapDuration';
import {ButtonMenuItemOptions} from '@components/buttonMenu';
import CheckboxField from '@components/checkboxField';
import {BANNED_RIGHTS_UNTIL_FOREVER} from '@lib/appManagers/constants';
import tsNow from '@helpers/tsNow';
import showDatePickerPopup from '@components/popups/datePicker';
import {formatDate, formatFullSentTime} from '@helpers/date';
import anchorCallback from '@helpers/dom/anchorCallback';
import appImManager from '@lib/appImManager';
import {useSuperTab} from '@components/solidJsTabs/superTabProvider';
import {usePromiseCollector} from '@components/solidJsTabs/promiseCollector';
import type {AppUserPermissionsTab} from '@components/solidJsTabs/tabs';
import limitBotAdminRights from '@appManagers/utils/bots/limitBotAdminRights';
import attachAdminRightsCaption from './attachAdminRightsCaption';
import appendPermissionsPeerDialog from './permissionsPeerDialog';

const ChatUserPermissions: Component = () => {
  const [tab] = useSuperTab<typeof AppUserPermissionsTab>();
  if('communityId' in tab.payload) {
    return null;
  }

  const promiseCollector = usePromiseCollector();

  const {
    participant,
    chatId,
    userId,
    editingAdmin,
    initialAdminRights,
    existingAdminRights,
    addingBot
  } = tab.payload;

  let saveCallback: () => Promise<any>;
  const solidState = createSolidTabState<{
    rights: ChatAdminRights | ChatBannedRights,
    rank: string,
    addAsAdmin: boolean,
    processJoinRequests: boolean
  }>({
    tab,
    save: () => handleChannelsTooMuch(saveCallback),
    unsavedConfirmationProps: {},
    alwaysShowSave: !!(
      addingBot?.existingAdmin &&
      addingBot.sendStartAfterAdmin &&
      addingBot.startParam
    )
  });

  tab.header.append(solidState.saveIcon());
  // title is set by the scaffold (function of editingAdmin)

  promiseCollector.collect((async() => {
    tab.container.classList.add('edit-peer-container', 'user-permissions-container');

    const [chat, isChannel, isGroup, user] = await Promise.all([
      tab.managers.appChatsManager.getChat(chatId) as Promise<Chat.chat | Chat.channel>,
      tab.managers.appChatsManager.isChannel(chatId),
      tab.managers.appPeersManager.isAnyGroup(chatId.toPeerId(true)),
      tab.managers.appUsersManager.getUser(userId)
    ]);
    const isBroadcast = chat._ === 'channel' && !!chat.pFlags.broadcast;
    const isCreator = isParticipantCreator(participant);
    const isAdmin = isParticipantAdmin(participant);
    const _canEditAdmin = canEditAdmin(chat, participant as ChannelParticipant, rootScope.myId);
    let addAsAdmin = true;

    let goodTypes: (ChannelParticipant | ChatParticipant)['_'][];
    if(editingAdmin) {
      goodTypes = [...participantAdminPredicates];
    } else {
      goodTypes = [
        'channelParticipantBanned'
      ];
    }

    // a guard bot greets new members in its own mini app instead of admins approving them by hand;
    // it is stored on the chat (channelFull.guard_bot_id), not in the participant's admin rights
    let confirmGuardBotChange: () => Promise<void>;
    let applyGuardBotChange: () => Promise<void>;
    let guardBotSection: SettingSection;

    let chatPermissions: ChatPermissions;
    {
      const section = new SettingSection({
        name: editingAdmin ? 'EditAdminWhatCanDo' : 'UserRestrictionsCanDo',
        caption: editingAdmin ? true : undefined
      });

      appendPermissionsPeerDialog({
        section,
        userId,
        user,
        middleware: tab.middlewareHelper.get()
      });

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
        rights: editingAdmin ? initialAdminRights : undefined,
        chat,
        canEdit: _canEditAdmin
      };

      if(editingAdmin) {
        options.onSomethingChanged = () => solidState.set({rights: p.takeOut()});
        const p = new ChatAdministratorRights(options);
        if(isAdmin) {
          solidState.setInitial({
            rights: copy(existingAdminRights || (isChannel ? participantRights : p.takeOut()))
          });
        }

        options.onSomethingChanged();

        attachAdminRightsCaption({
          section,
          permissions: p,
          canEdit: _canEditAdmin,
          listenerSetter: tab.listenerSetter
        });

        saveCallback = async() => {
          if(!_canEditAdmin) {
            return;
          }

          await confirmGuardBotChange?.();

          let rights = p.takeOut();
          if(addingBot && !addAsAdmin) {
            await tab.managers.appMessagesManager.addBotToChat(userId, chatId, addingBot.startParam);
            appImManager.setInnerPeer({peerId: chatId.toPeerId(true)});
            return;
          }

          if(addingBot) {
            rights = limitBotAdminRights(chat, rights);
            if(!addingBot.existingAdmin) {
              await confirmationPopup({
                titleLangKey: 'AddBot',
                descriptionLangKey: isBroadcast ? 'BotAddAsAdminChannelConfirm' : 'BotAddAsAdminGroupConfirm',
                descriptionLangArgs: [await wrapPeerTitle({peerId: chatId.toPeerId(true)})],
                button: {
                  langKey: 'Add'
                }
              });
            }
          }

          const resultChatId = await tab.managers.appChatsManager.editAdmin(
            chatId,
            participant,
            rights,
            rankInputField?.value
          );
          const targetChatId = resultChatId || chatId;

          await applyGuardBotChange?.();

          if(addingBot?.sendStartAfterAdmin && addingBot.startParam) {
            await tab.managers.appMessagesManager.startBot(userId, targetChatId, addingBot.startParam);
          }

          if(addingBot) {
            appImManager.setInnerPeer({peerId: targetChatId.toPeerId(true)});
          }
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

      if(addingBot && !isBroadcast && !addingBot.existingAdmin) {
        const addAsAdminSection = new SettingSection({});
        const addAsAdminField = new CheckboxField({
          name: 'add-as-admin',
          toggle: true,
          checked: true,
          listenerSetter: tab.listenerSetter
        });
        const addAsAdminRow = new Row({
          titleLangKey: 'EditAdmin',
          checkboxField: addAsAdminField,
          listenerSetter: tab.listenerSetter
        });
        const onAddAsAdminChange = () => {
          addAsAdmin = addAsAdminField.checked;
          section.container.classList.toggle('hide', !addAsAdmin);
          // a bot that is not being made an admin cannot be the chat's guard bot either
          guardBotSection?.container.classList.toggle('hide', !addAsAdmin);
          solidState.set({addAsAdmin});
        };

        tab.listenerSetter.add(addAsAdminField.input)('change', onAddAsAdminChange);
        addAsAdminSection.content.append(addAsAdminRow.container);
        tab.scrollable.append(addAsAdminSection.container);
        onAddAsAdminChange();
      }

      tab.scrollable.append(section.container);
    }

    if(
      editingAdmin &&
      isChannel &&
      user.pFlags.bot_guard &&
      _canEditAdmin &&
      userId !== rootScope.myId
    ) {
      const getCurrentGuardBotId = async() => {
        const channelFull = await tab.managers.appProfileManager.getChannelFull(chatId);
        return channelFull?.guard_bot_id;
      };

      const isThisBot = (guardBotId: Awaited<ReturnType<typeof getCurrentGuardBotId>>) => {
        return !!guardBotId && String(guardBotId) === String(userId);
      };

      const wasEnabled = isThisBot(await getCurrentGuardBotId());

      const section = guardBotSection = new SettingSection({
        caption: 'GuardBotProcessJoinRequestsInfo'
      });

      const checkboxField = new CheckboxField({
        toggle: true,
        checked: wasEnabled,
        listenerSetter: tab.listenerSetter
      });

      const row = new Row({
        titleLangKey: 'GuardBotProcessJoinRequests',
        checkboxField,
        listenerSetter: tab.listenerSetter
      });

      solidState.setInitial({processJoinRequests: wasEnabled});
      tab.listenerSetter.add(checkboxField.input)('change', () => {
        solidState.set({processJoinRequests: checkboxField.checked});
      });

      section.content.append(row.container);
      section.container.classList.toggle('hide', !addAsAdmin);
      tab.scrollable.append(section.container);

      confirmGuardBotChange = async() => {
        const currentGuardBotId = await getCurrentGuardBotId();
        if(!addAsAdmin || !checkboxField.checked || isThisBot(currentGuardBotId)) {
          return;
        }

        const peerId = userId.toPeerId(false);
        // `rejectWithReason` keeps a cancel from rejecting with `undefined`, which the
        // `handleChannelsTooMuch` wrapper around the save would then read `.type` off
        if(currentGuardBotId) {
          await confirmationPopup({
            titleLangKey: 'GuardBotReplaceTitle',
            descriptionLangKey: 'GuardBotReplaceText',
            descriptionLangArgs: [
              await wrapPeerTitle({peerId: currentGuardBotId.toPeerId(false)}),
              await wrapPeerTitle({peerId})
            ],
            button: {
              langKey: 'GuardBotReplaceUse',
              langArgs: [await wrapPeerTitle({peerId})]
            },
            peerId,
            rejectWithReason: true
          });

          return;
        }

        await confirmationPopup({
          titleLangKey: isBroadcast ? 'ChannelSettingsJoinRequestChannel' : 'ChannelSettingsJoinRequest',
          descriptionLangKey: isBroadcast ? 'GuardBotEnableSubscribersText' : 'GuardBotEnableMembersText',
          descriptionLangArgs: [await wrapPeerTitle({peerId})],
          button: {
            langKey: 'GuardBotEnable'
          },
          peerId,
          rejectWithReason: true
        });
      };

      applyGuardBotChange = async() => {
        const currentGuardBotId = await getCurrentGuardBotId();
        const isCurrent = isThisBot(currentGuardBotId);
        if(!addAsAdmin || checkboxField.checked === isCurrent) {
          return;
        }

        try {
          if(checkboxField.checked) {
            await tab.managers.appChatsManager.toggleJoinRequest(chatId, true, {guardBotId: userId});
          } else {
            // dropping the bot must not silently turn approvals off for the chat
            await tab.managers.appChatsManager.toggleJoinRequest(
              chatId,
              !!(chat as Chat.channel).pFlags.join_request,
              {clearGuardBot: true}
            );
          }
        } catch(err) {
          // the admin rights are already saved by now, so a rejected guard change would otherwise
          // pass silently — the server refuses a bot it does not consider a guard bot at all
          toastNew({langPackKey: 'Error.AnError'});
          throw err;
        }
      };
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

export default ChatUserPermissions;
