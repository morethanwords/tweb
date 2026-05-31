import {Component} from 'solid-js';
import InputField from '@components/inputField';
import EditPeer from '@components/editPeer';
import Row, {CreateRowFromCheckboxField} from '@components/row';
import Button from '@components/button';
import {ChatRights} from '@appManagers/appChatsManager';
import {Chat, ChatFull, ChatParticipants} from '@layer';
import {AppChatTypeTab} from '@components/solidJsTabs/tabs';
import rootScope from '@lib/rootScope';
import {AppGroupPermissionsTab} from '@components/solidJsTabs/tabs';
import I18n, {i18n, join, LangPackKey} from '@lib/langPack';
import PopupDeleteDialog from '@components/popups/deleteDialog';
import {attachClickEvent} from '@helpers/dom/clickEvent';
import toggleDisability from '@helpers/dom/toggleDisability';
import CheckboxField from '@components/checkboxField';
import {AppChatReactionsTab} from '@components/solidJsTabs/tabs';
import hasRights from '@appManagers/utils/chats/hasRights';
import replaceContent from '@helpers/dom/replaceContent';
import SettingSection from '@components/settingSection';
import getPeerActiveUsernames from '@appManagers/utils/peers/getPeerActiveUsernames';
import PopupElement from '@components/popups';
import {AppChatAdministratorsTab} from '@components/solidJsTabs/tabs';
import numberThousandSplitter, {numberThousandSplitterForStars} from '@helpers/number/numberThousandSplitter';
import {AppChatMembersTab} from '@components/solidJsTabs/tabs';
import {AppRemovedUsersTab} from '@components/solidJsTabs/tabs';
import {AppChatDiscussionTab} from '@components/solidJsTabs/tabs';
import wrapPeerTitle from '@components/wrappers/peerTitle';
import cancelEvent from '@helpers/dom/cancelEvent';
import {hideToast, toastNew} from '@components/toast';
import {AppChatInviteLinksTab} from '@components/solidJsTabs/tabs';
import {AppChatRequestsTab} from '@components/solidJsTabs/tabs';
import getParticipantsCount from '@appManagers/utils/chats/getParticipantsCount';
import anchorCallback from '@helpers/dom/anchorCallback';
import PopupBoost from '@components/popups/boost';
import namedPromises from '@helpers/namedPromises';
import apiManagerProxy from '@lib/apiManagerProxy';
import {AppDirectMessagesTab} from '@components/solidJsTabs';
import {AppAdminRecentActionsTab} from '@components/solidJsTabs/tabs';
import appImManager from '@lib/appImManager';
import {ChatType} from '@components/chat/chatType';
import {appSettings} from '@stores/appSettings';
import {handleChannelsTooMuch} from '@components/popups/channelsTooMuch';
import {isParticipantAdmin} from '@lib/appManagers/utils/chats/isParticipantAdmin';
import {useSuperTab} from '@components/solidJsTabs/superTabProvider';
import {usePromiseCollector} from '@components/solidJsTabs/promiseCollector';
import type {AppEditChatTab} from '@components/solidJsTabs/tabs';

const EditChat: Component = () => {
  const [tab] = useSuperTab<typeof AppEditChatTab>();
  const promiseCollector = usePromiseCollector();
  let chatId = tab.payload.chatId;

  const _init = async() => {
    // * cleanup prev
    tab.listenerSetter.removeAll();

    tab.container.classList.add('edit-peer-container', 'edit-group-container');
    tab.title.replaceChildren(i18n('Edit'));

    let chatNameInputField: InputField, descriptionInputField: InputField, editPeer: EditPeer;

    let {
      chatFull,
      chat,
      isBroadcast,
      isChannel,
      canChangeType,
      canChangePermissions,
      canToggleForum,
      canManageAdmins,
      canChangeInfo,
      canDeleteChat,
      canPostMessages,
      canManageInviteLinks,
      canInviteUsers,
      isBroadcastGroup,
      appConfig,
      availableReactions
    } = await namedPromises({
      chatFull: tab.managers.appProfileManager.getChatFull(chatId, true),
      chat: tab.managers.appChatsManager.getChat(chatId) as Promise<Chat.chat | Chat.channel>,
      isBroadcast: tab.managers.appChatsManager.isBroadcast(chatId),
      isChannel: tab.managers.appChatsManager.isChannel(chatId),
      isBroadcastGroup: tab.managers.appChatsManager.isBroadcastGroup(chatId),
      canChangeType: tab.managers.appChatsManager.hasRights(chatId, 'change_type'),
      canChangePermissions: tab.managers.appChatsManager.hasRights(chatId, 'change_permissions'),
      canToggleForum: tab.managers.appChatsManager.hasRights(chatId, 'toggle_forum'),
      canManageAdmins: tab.managers.appChatsManager.hasRights(chatId, 'change_permissions'),
      canChangeInfo: tab.managers.appChatsManager.hasRights(chatId, 'change_info'),
      canDeleteChat: tab.managers.appChatsManager.hasRights(chatId, 'delete_chat'),
      canPostMessages: tab.managers.appChatsManager.hasRights(chatId, 'post_messages'),
      canManageInviteLinks: tab.managers.appChatsManager.hasRights(chatId, 'invite_links'),
      canInviteUsers: tab.managers.appChatsManager.hasRights(chatId, 'invite_users'),
      appConfig: tab.managers.apiManager.getAppConfig(),
      availableReactions: tab.managers.appReactionsManager.getAvailableReactions()
    });

    tab.scrollable.replaceChildren();

    const chatUpdateListeners: {[type in 'full' | 'basic']: (() => void)[]} = {full: [], basic: []};
    const addChatUpdateListener = (callback: () => void, type: 'full' | 'basic' = 'basic') => {
      chatUpdateListeners[type].push(callback);
    };

    tab.listenerSetter.add(rootScope)('chat_update', async(updatedChatId) => {
      if(chatId === updatedChatId) {
        chat = await tab.managers.appChatsManager.getChat(chatId) as typeof chat;
        chatUpdateListeners['basic'].forEach((callback) => callback());
      }
    });

    tab.listenerSetter.add(rootScope)('chat_full_update', async(updatedChatId) => {
      if(chatId === updatedChatId) {
        chatFull = await tab.managers.appProfileManager.getChatFull(updatedChatId);
        chatUpdateListeners['full'].forEach((callback) => callback());
      }
    });

    const peerId = chatId.toPeerId(true);
    const isAdmin = hasRights(chat, 'just_admin');

    {
      const section = new SettingSection({noDelimiter: true, caption: 'PeerInfo.SetAboutDescription'});
      const inputFields: InputField[] = [];

      const inputWrapper = document.createElement('div');
      inputWrapper.classList.add('input-wrapper');

      chatNameInputField = new InputField({
        label: isBroadcast ? 'EnterChannelName' : 'CreateGroup.NameHolder',
        name: 'chat-name',
        maxLength: 255,
        required: true,
        canBeEdited: canChangeInfo
      });
      descriptionInputField = new InputField({
        label: 'DescriptionPlaceholder',
        name: 'chat-description',
        maxLength: 255,
        withLinebreaks: true,
        canBeEdited: canChangeInfo
      });

      chatNameInputField.setOriginalValue(chat.title);
      descriptionInputField.setOriginalValue(chatFull.about);

      inputWrapper.append(chatNameInputField.container, descriptionInputField.container);

      inputFields.push(chatNameInputField, descriptionInputField);

      editPeer = new EditPeer({
        peerId,
        inputFields,
        listenerSetter: tab.listenerSetter,
        popupOptions: {isForum: (chat as Chat.channel).pFlags.forum},
        middleware: tab.middlewareHelper.get()
      });
      tab.content.append(editPeer.nextBtn);

      if(!canChangeInfo) {
        editPeer.avatarElem.node.classList.remove('avatar-placeholder');
        editPeer.avatarEdit.container.replaceChildren(editPeer.avatarElem.node);
        editPeer.avatarEdit.container.classList.add('disable-hover');
      }

      section.content.append(inputWrapper);
      tab.scrollable.append(editPeer.avatarEdit.container, section.container);
    }

    {
      const section = new SettingSection({caption: true});

      if(canChangeType) {
        const chatTypeRow = new Row({
          titleLangKey: isBroadcast ? 'ChannelType' : 'GroupType',
          clickable: () => {
            tab.slider.createTab(AppChatTypeTab).open({chatId: chatId, chatFull});
          },
          icon: 'lock',
          listenerSetter: tab.listenerSetter
        });

        const setChatTypeSubtitle = () => {
          let key: LangPackKey;
          const username = getPeerActiveUsernames(chat as Chat.channel)[0];
          if(isBroadcast) {
            key = username ? 'TypePublic' : 'TypePrivate';
          } else {
            key = username ? 'TypePublicGroup' : 'TypePrivateGroup';
          }

          chatTypeRow.subtitle.replaceChildren(i18n(key));
        };

        setChatTypeSubtitle();
        addChatUpdateListener(setChatTypeSubtitle);
        section.content.append(chatTypeRow.container);
      }

      if(canManageInviteLinks) {
        const inviteLinksRow = new Row({
          titleLangKey: 'InviteLinks',
          navigationTab: {
            constructor: AppChatInviteLinksTab,
            slider: tab.slider,
            getInitArgs: () => ({
              chatId: chatId,
              p: AppChatInviteLinksTab.getInitArgs(chatId)
            })
          },
          icon: 'link',
          listenerSetter: tab.listenerSetter,
          subtitle: true
        });

        const setInviteLinksCount = () => {
          inviteLinksRow.subtitle.textContent = '1';
        };

        setInviteLinksCount();
        addChatUpdateListener(setInviteLinksCount, 'full');

        section.content.append(inviteLinksRow.container);
      }

      if(canInviteUsers && isAdmin) {
        const requestsRow = new Row({
          titleLangKey: isBroadcast ? 'SubscribeRequests' : 'MemberRequests',
          navigationTab: {
            constructor: AppChatRequestsTab,
            getInitArgs: () => chatId,
            slider: tab.slider
          },
          icon: 'adduser',
          listenerSetter: tab.listenerSetter,
          subtitle: true
        });

        const setRequestsCount = () => {
          const count = chatFull.requests_pending;
          requestsRow.subtitle.textContent = '' + count;
          requestsRow.container.classList.toggle('hide', !count);
        };

        setRequestsCount();
        addChatUpdateListener(setRequestsCount, 'full');

        section.content.append(requestsRow.container);
      }

      // if(canChangeType || canChangePermissions) {
      if(canChangeInfo && isAdmin) {
        const reactionsRow = new Row({
          titleLangKey: 'Reactions',
          icon: 'reactions',
          navigationTab: {
            constructor: AppChatReactionsTab,
            slider: tab.slider,
            getInitArgs: () => ({
              chatId: chatId
            })
          },
          listenerSetter: tab.listenerSetter
        });

        const availableReactionsLength = availableReactions.filter((availableReaction) => !availableReaction.pFlags.inactive).length;
        const setReactionsLength = () => {
          const chatAvailableReactions = chatFull.available_reactions ?? {_: 'chatReactionsNone'};
          if(chatAvailableReactions._ === 'chatReactionsSome') {
            const length = chatAvailableReactions.reactions.length;
            if(length === availableReactionsLength) {
              replaceContent(reactionsRow.subtitle, i18n('ReactionsAll'));
            } else {
              reactionsRow.subtitle.textContent = length + '/' + availableReactionsLength;
            }
          } else {
            replaceContent(reactionsRow.subtitle, i18n(chatAvailableReactions._ === 'chatReactionsAll' ? 'ReactionsAll' : 'Checkbox.Disabled'));
          }
        };

        setReactionsLength();
        addChatUpdateListener(setReactionsLength, 'full');
        section.content.append(reactionsRow.container);
      }

      if(canChangeInfo && isBroadcast && isAdmin) {
        const directMessagesRow = new Row({
          titleLangKey: 'ChannelDirectMessages.Settings.Title',
          icon: 'messageunread',
          clickable: () => {
            if(chat._ !== 'channel') return;
            tab.slider.createTab(AppDirectMessagesTab).open({chat});
          },
          listenerSetter: tab.listenerSetter
        });

        const setEnabledStatus = () => {
          if(chat._ !== 'channel') return;

          const linkedMonoforumChat = chat.linked_monoforum_id ? apiManagerProxy.getChat(chat.linked_monoforum_id) : undefined;

          if(linkedMonoforumChat?._ !== 'channel') {
            replaceContent(directMessagesRow.subtitle, i18n('ChannelDirectMessages.Settings.Off'));
            return;
          }

          const starsAmount = linkedMonoforumChat.send_paid_messages_stars || 0;

          replaceContent(
            directMessagesRow.subtitle,
            starsAmount ?
              i18n('Stars', [numberThousandSplitterForStars(starsAmount)]) :
              i18n('ChannelDirectMessages.Settings.Free')
          );
        };

        setEnabledStatus();
        addChatUpdateListener(setEnabledStatus, 'basic');
        section.content.append(directMessagesRow.container);
      }

      if(canChangePermissions && !isBroadcast && !isBroadcastGroup) {
        const flags = [
          'send_stickers',
          'send_polls',
          'send_photos',
          'send_videos',
          'send_roundvideos',
          'send_audios',
          'send_voices',
          'send_docs',
          'send_plain',
          'embed_links',
          'invite_users',
          'pin_messages',
          'change_info'
        ] as ChatRights[];

        const permissionsRow = new Row({
          titleLangKey: 'ChannelPermissions',
          clickable: () => {
            const permsTab = tab.slider.createTab(AppGroupPermissionsTab);
            permsTab.open({chatId: chatId});
          },
          icon: 'permissions',
          listenerSetter: tab.listenerSetter
        });

        const setPermissionsLength = () => {
          const permissions = flags.reduce((acc, f) => acc + +hasRights(chat, f, (chat as Chat.chat).default_banned_rights), 0) + '/' + flags.length;
          const paid = !!+(chat as Chat.channel)?.send_paid_messages_stars ? I18n.format('PrivacySettingsController.Paid', true) : undefined;
          permissionsRow.subtitle.innerHTML = '';
          permissionsRow.subtitle.append(...join([permissions, paid].filter(Boolean)));
        };

        setPermissionsLength();
        addChatUpdateListener(setPermissionsLength);
        section.content.append(permissionsRow.container);
      }

      if(/* canChangeInfo &&  */isAdmin) {
        const discussionRow = new Row({
          icon: 'comments',
          titleLangKey: isBroadcast ? 'PeerInfo.Discussion' : 'LinkedChannel',
          subtitle: true,
          navigationTab: {
            constructor: AppChatDiscussionTab,
            getInitArgs: () => ({
              chatId: chatId,
              linkedChatId: (chatFull as ChatFull.channelFull).linked_chat_id
            }),
            slider: tab.slider
          },
          listenerSetter: tab.listenerSetter
        });

        const setSubtitle = async() => {
          const linkedChatId = (chatFull as ChatFull.channelFull).linked_chat_id;
          let el: HTMLElement;
          if(linkedChatId) {
            el = await wrapPeerTitle({peerId: linkedChatId.toPeerId(true)});
          } else {
            el = i18n('PeerInfo.Discussion.Add');
          }

          if(!isBroadcast) {
            discussionRow.container.classList.toggle('hide', !linkedChatId);
          }

          discussionRow.subtitle.replaceChildren(el);
        };

        await setSubtitle();
        addChatUpdateListener(setSubtitle, 'full');

        section.caption.replaceChildren(i18n('DiscussionInfo'));
        section.content.append(discussionRow.container);
      }

      if(isAdmin && isChannel) {
        const recentActionsRow = new Row({
          icon: 'clipboard',
          titleLangKey: 'RecentActions',
          clickable: () => {
            if(appSettings.logsDiffView) {
              tab.slider.createTab(AppAdminRecentActionsTab).open({channelId: chatId, isBroadcast});
            } else {
              appImManager.setInnerPeer({
                peerId: chatId.toPeerId(true),
                type: ChatType.Logs
              });
            }
          },
          listenerSetter: tab.listenerSetter
        });

        section.content.append(recentActionsRow.container);
      }

      if(
        canToggleForum &&
        (chat.participants_count >= appConfig.forum_upgrade_participants_min || (chat as Chat.channel).pFlags.forum) &&
        !isBroadcast
      ) {
        const topicsRow = new Row({
          checkboxField: new CheckboxField({toggle: true}),
          titleLangKey: 'Topics',
          clickable: (e) => {
            if((chatFull as ChatFull.channelFull).linked_chat_id) {
              toastNew({langPackKey: 'ChannelTopicsDiscussionForbidden'});
              cancelEvent(e);
              return;
            }
          },
          icon: 'topics',
          listenerSetter: tab.listenerSetter
        });

        const setTopics = () => {
          const isForum = !!(chat as Chat.channel).pFlags.forum;
          editPeer.avatarElem.node.parentElement.classList.toggle('is-forum', isForum);
          topicsRow.checkboxField.setValueSilently(isForum);

          // const linkedChatId = (chatFull as ChatFull.channelFull).linked_chat_id;
          // topicsRow.toggleDisability(!!linkedChatId);
        };

        tab.listenerSetter.add(topicsRow.checkboxField.input)('change', (e) => {
          if(!e.isTrusted) {
            return;
          }

          const value = topicsRow.checkboxField.checked;
          const promise = handleChannelsTooMuch(() => tab.managers.appChatsManager.toggleForum(chatId, value));
          topicsRow.disableWithPromise(promise);
        });

        setTopics();
        addChatUpdateListener(setTopics);
        addChatUpdateListener(setTopics, 'full');

        section.caption.replaceChildren(i18n('ForumToggleDescription'));
        section.content.append(topicsRow.container);
      }

      section.caption.classList.toggle('hide', !section.caption.childElementCount);

      if(section.content.childElementCount) tab.scrollable.append(section.container);

      attachClickEvent(editPeer.nextBtn, () => {
        editPeer.nextBtn.disabled = true;

        const promises: Promise<any>[] = [];

        const id = chatId;
        if(chatNameInputField.isValidToChange()) {
          promises.push(tab.managers.appChatsManager.editTitle(id, chatNameInputField.value));
        }

        if(descriptionInputField.isValidToChange()) {
          promises.push(tab.managers.appChatsManager.editAbout(id, descriptionInputField.value));
        }

        if(editPeer.uploadAvatar) {
          promises.push(editPeer.uploadAvatar().then((inputFile) => {
            return tab.managers.appChatsManager.editPhoto(id, inputFile);
          }));
        }

        Promise.race(promises).finally(() => {
          editPeer.nextBtn.removeAttribute('disabled');
          tab.close();
        });
      }, {listenerSetter: tab.listenerSetter});
    }

    {
      const section = new SettingSection({});

      /* if(canManageAdmins)  */{
        const administratorsRow = new Row({
          titleLangKey: 'PeerInfo.Administrators',
          subtitle: true,
          icon: 'admin',
          navigationTab: {
            constructor: AppChatAdministratorsTab,
            slider: tab.slider,
            getInitArgs: () => ({
              chatId: chatId
            })
          },
          listenerSetter: tab.listenerSetter
        });

        const setAdministratorsLength = () => {
          let count: number;
          const participants = (chatFull as ChatFull.chatFull).participants as ChatParticipants.chatParticipants;
          if(participants?._ === 'chatParticipants') {
            count = participants.participants.filter(isParticipantAdmin).length;
          } else {
            count = (chatFull as ChatFull.channelFull).admins_count;
          }

          count ||= 1;
          administratorsRow.subtitle.textContent = '' + count;
        };

        setAdministratorsLength();
        addChatUpdateListener(setAdministratorsLength, 'full');

        section.content.append(administratorsRow.container);
      }

      {
        const membersRow = new Row({
          titleLangKey: isBroadcast ? 'PeerInfo.Subscribers' : 'GroupMembers',
          icon: 'newgroup',
          clickable: () => {
            tab.slider.createTab(AppChatMembersTab).open(chatId);
          },
          listenerSetter: tab.listenerSetter,
          subtitle: true
        });

        // const i = new I18n.IntlElement();
        // membersRow.subtitle.append(i.element);

        const setMembersLength = () => {
          const participants = getParticipantsCount(chatFull);
          membersRow.subtitle.textContent = numberThousandSplitter(participants);
          // i.compareAndUpdate({
          //   key: isBroadcast ? 'Subscribers' : 'Members',
          //   args: [numberThousandSplitter(participants)]
          // });
        };

        setMembersLength();
        addChatUpdateListener(setMembersLength, 'full');

        section.content.append(membersRow.container);
      }

      /* if(canChangePermissions)  */{
        const removedUsersRow = new Row({
          titleLangKey: 'ChannelBlockedUsers',
          subtitle: true,
          icon: 'deleteuser',
          clickable: () => {
            const removedTab = tab.slider.createTab(AppRemovedUsersTab);
            removedTab.open(chatId);
          },
          listenerSetter: tab.listenerSetter
        });

        const setRemovedUsersLength = () => {
          removedUsersRow.container.classList.toggle('hide', !isChannel);
          const kickedCount = (chatFull as ChatFull.channelFull).kicked_count || 0;
          if(kickedCount) {
            removedUsersRow.subtitle.textContent = numberThousandSplitter(kickedCount);
          } else {
            removedUsersRow.subtitle.replaceChildren(i18n('NoBlockedUsers'));
          }
        };

        setRemovedUsersLength();
        addChatUpdateListener(setRemovedUsersLength, 'full');

        section.content.append(removedUsersRow.container);
      }

      tab.scrollable.append(section.container);
    }

    if(isBroadcast && canChangeInfo) {
      const section = new SettingSection({});

      const r = new Row({
        titleLangKey: 'ChannelAutotranslation',
        checkboxField: new CheckboxField({
          toggle: true
        }),
        icon: 'premium_translate',
        clickable: (e) => {
          if(((chat as Chat.channel).level ?? 0) < appConfig.channel_autotranslation_level_min) {
            toastNew({
              langPackKey: 'ChannelAutotranslationLevelMin',
              langPackArguments: [
                appConfig.channel_autotranslation_level_min,
                anchorCallback(() => {
                  hideToast();
                  PopupElement.createPopup(PopupBoost, peerId);
                })
              ]
            });
            cancelEvent(e);
          }
        }
      });

      tab.listenerSetter.add(r.checkboxField.input)('change', () => {
        const toggle = r.toggleDisability(true);
        tab.managers.appChatsManager.toggleAutotranslation(chatId, r.checkboxField.checked)
        .catch(() => {
          r.checkboxField.setValueSilently(false);
        }).finally(toggle);
      });

      const update = () => {
        r.checkboxField.setValueSilently(!!(chat as Chat.channel).pFlags.autotranslation);
      };

      update();
      addChatUpdateListener(update);

      section.content.append(r.container);

      tab.scrollable.append(section.container);
    }

    if(isBroadcast && canPostMessages) {
      const section = new SettingSection({caption: true});
      const signMessagesCheckboxField = new CheckboxField({
        text: 'ChannelSignMessages'
      });

      const showProfilesCheckboxField = new CheckboxField({
        text: 'ChannelSignMessagesWithProfile'
      });

      tab.listenerSetter.add(signMessagesCheckboxField.input)('change', () => {
        const toggle = signMessagesCheckboxField.toggleDisability(true);
        tab.managers.appChatsManager.toggleSignatures(chatId, signMessagesCheckboxField.checked, signMessagesCheckboxField.checked && showProfilesCheckboxField.checked).then(() => {
          toggle();
        });
      });

      tab.listenerSetter.add(showProfilesCheckboxField.input)('change', () => {
        const toggle = showProfilesCheckboxField.toggleDisability(true);
        tab.managers.appChatsManager.toggleSignatures(chatId, signMessagesCheckboxField.checked, showProfilesCheckboxField.checked).then(() => {
          toggle();
        });
      });

      const update = () => {
        signMessagesCheckboxField.setValueSilently(!!(chat as Chat.channel).pFlags.signatures);
        showProfilesCheckboxField.setValueSilently(signMessagesCheckboxField.checked && !!(chat as Chat.channel).pFlags.signature_profiles);
        row2.container.classList.toggle('hide', !signMessagesCheckboxField.checked);
        section.caption.replaceChildren(i18n(showProfilesCheckboxField.checked ? 'ChannelSignProfilesInfo' : 'ChannelSignMessagesInfo'));
      };

      const row2 = CreateRowFromCheckboxField(showProfilesCheckboxField);

      update();
      addChatUpdateListener(update);

      section.content.append(CreateRowFromCheckboxField(signMessagesCheckboxField).container, row2.container);
      tab.scrollable.append(section.container);
    }

    if(!isBroadcast) {
      const section = new SettingSection({

      });

      if(!isBroadcast && canChangeType) {
        const showChatHistoryCheckboxField = new CheckboxField({
          text: 'ChatHistory'
        });

        tab.listenerSetter.add(showChatHistoryCheckboxField.input)('change', () => {
          const toggle = showChatHistoryCheckboxField.toggleDisability(true);
          const value = !showChatHistoryCheckboxField.checked;
          handleChannelsTooMuch(() => tab.managers.appChatsManager.togglePreHistoryHidden(chatId, value))
          .catch((err) => {
            console.error('togglePreHistoryHidden error:', err);
            showChatHistoryCheckboxField.setValueSilently(value);
          }).finally(toggle);
        });

        const onChatUpdate = () => {
          showChatHistoryCheckboxField.setValueSilently(isChannel && !(chatFull as ChatFull.channelFull).pFlags.hidden_prehistory);
        };

        onChatUpdate();
        addChatUpdateListener(onChatUpdate, 'full');

        section.content.append(CreateRowFromCheckboxField(showChatHistoryCheckboxField).container);
      }

      if(section.content.childElementCount) {
        tab.scrollable.append(section.container);
      }
    }

    if(canDeleteChat) {
      const section = new SettingSection({});

      const btnDelete = Button('btn-primary btn-transparent danger', {icon: 'delete', text: isBroadcast ? 'PeerInfo.DeleteChannel' : 'DeleteAndExitButton'});

      attachClickEvent(btnDelete, () => {
        PopupElement.createPopup(PopupDeleteDialog, peerId/* , 'delete' */, undefined, (promise) => {
          const toggle = toggleDisability([btnDelete], true);
          promise.then(() => {
            tab.close();
          }, () => {
            toggle();
          });
        });
      }, {listenerSetter: tab.listenerSetter});

      section.content.append(btnDelete);

      tab.scrollable.append(section.container);
    }

    if(!isChannel) {
      // ! this one will fire earlier than tab's closeAfterTimeout (destroy) event and listeners will be erased, so destroy won't fire
      tab.listenerSetter.add(rootScope)('dialog_migrate', ({migrateFrom, migrateTo}) => {
        if(peerId === migrateFrom) {
          chatId = migrateTo.toChatId();
          _init();
        }
      });
    }
  };

  promiseCollector.collect(_init());

  return null;
};

export default EditChat;
