/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {SliderSuperTab} from '../../slider'
import InputField from '../../inputField';
import EditPeer from '../../editPeer';
import Row, {CreateRowFromCheckboxField} from '../../row';
import Button from '../../button';
import {ChatRights} from '../../../lib/appManagers/appChatsManager';
import {Chat, ChatFull, ChatParticipants} from '../../../layer';
import AppChatTypeTab from './chatType';
import rootScope from '../../../lib/rootScope';
import AppGroupPermissionsTab from './groupPermissions';
import I18n, {i18n, join, LangPackKey} from '../../../lib/langPack';
import PopupDeleteDialog from '../../popups/deleteDialog';
import {attachClickEvent} from '../../../helpers/dom/clickEvent';
import toggleDisability from '../../../helpers/dom/toggleDisability';
import CheckboxField from '../../checkboxField';
import AppChatReactionsTab from './chatReactions';
import hasRights from '../../../lib/appManagers/utils/chats/hasRights';
import replaceContent from '../../../helpers/dom/replaceContent';
import SettingSection from '../../settingSection';
import getPeerActiveUsernames from '../../../lib/appManagers/utils/peers/getPeerActiveUsernames';
import PopupElement from '../../popups';
import AppChatAdministratorsTab from './chatAdministrators';
import numberThousandSplitter from '../../../helpers/number/numberThousandSplitter';
import AppChatMembersTab from './chatMembers';
import AppRemovedUsersTab from './removedUsers';
import AppChatDiscussionTab from './chatDiscussion';
import wrapPeerTitle from '../../wrappers/peerTitle';
import cancelEvent from '../../../helpers/dom/cancelEvent';
import {toastNew} from '../../toast';
import AppChatInviteLinksTab from './chatInviteLinks';
import AppChatRequestsTab from './chatRequests';
import getParticipantsCount from '../../../lib/appManagers/utils/chats/getParticipantsCount';

export default class AppEditChatTab extends SliderSuperTab {
  private chatNameInputField: InputField;
  private descriptionInputField: InputField;
  private editPeer: EditPeer;
  public chatId: ChatId;

  protected async _init() {
    // * cleanup prev
    this.listenerSetter.removeAll();

    this.container.classList.add('edit-peer-container', 'edit-group-container');
    this.setTitle('Edit');

    let [
      chatFull,
      chat,
      isBroadcast,
      isChannel,
      canChangeType,
      canChangePermissions,
      canManageTopics,
      canManageAdmins,
      canChangeInfo,
      canDeleteChat,
      canPostMessages,
      canManageInviteLinks,
      canInviteUsers,
      appConfig,
      availableReactions
    ] = await Promise.all([
      this.managers.appProfileManager.getChatFull(this.chatId, true),
      this.managers.appChatsManager.getChat(this.chatId) as Promise<Chat.chat | Chat.channel>,
      this.managers.appChatsManager.isBroadcast(this.chatId),
      this.managers.appChatsManager.isChannel(this.chatId),
      this.managers.appChatsManager.hasRights(this.chatId, 'change_type'),
      this.managers.appChatsManager.hasRights(this.chatId, 'change_permissions'),
      this.managers.appChatsManager.hasRights(this.chatId, 'manage_topics'),
      this.managers.appChatsManager.hasRights(this.chatId, 'change_permissions'),
      this.managers.appChatsManager.hasRights(this.chatId, 'change_info'),
      this.managers.appChatsManager.hasRights(this.chatId, 'delete_chat'),
      this.managers.appChatsManager.hasRights(this.chatId, 'post_messages'),
      this.managers.appChatsManager.hasRights(this.chatId, 'invite_links'),
      this.managers.appChatsManager.hasRights(this.chatId, 'invite_users'),
      this.managers.apiManager.getAppConfig(),
      this.managers.appReactionsManager.getAvailableReactions()
    ]);

    this.scrollable.replaceChildren();

    const chatUpdateListeners: {[type in 'full' | 'basic']: (() => void)[]} = {full: [], basic: []};
    const addChatUpdateListener = (callback: () => void, type: 'full' | 'basic' = 'basic') => {
      chatUpdateListeners[type].push(callback);
    };

    this.listenerSetter.add(rootScope)('chat_update', async(chatId) => {
      if(this.chatId === chatId) {
        chat = await this.managers.appChatsManager.getChat(this.chatId) as typeof chat;
        chatUpdateListeners['basic'].forEach((callback) => callback());
      }
    });

    this.listenerSetter.add(rootScope)('chat_full_update', async(chatId) => {
      if(this.chatId === chatId) {
        chatFull = await this.managers.appProfileManager.getCachedFullChat(chatId) ||
          chatFull ||
          await this.managers.appProfileManager.getChatFull(chatId);
        chatUpdateListeners['full'].forEach((callback) => callback());
      }
    });

    const peerId = this.chatId.toPeerId(true);
    const isAdmin = !!chat.admin_rights;

    {
      const section = new SettingSection({noDelimiter: true, caption: 'PeerInfo.SetAboutDescription'});
      const inputFields: InputField[] = [];

      const inputWrapper = document.createElement('div');
      inputWrapper.classList.add('input-wrapper');

      this.chatNameInputField = new InputField({
        label: isBroadcast ? 'EnterChannelName' : 'CreateGroup.NameHolder',
        name: 'chat-name',
        maxLength: 255,
        required: true,
        canBeEdited: canChangeInfo
      });
      this.descriptionInputField = new InputField({
        label: 'DescriptionPlaceholder',
        name: 'chat-description',
        maxLength: 255,
        withLinebreaks: true,
        canBeEdited: canChangeInfo
      });

      this.chatNameInputField.setOriginalValue(chat.title);
      this.descriptionInputField.setOriginalValue(chatFull.about);

      inputWrapper.append(this.chatNameInputField.container, this.descriptionInputField.container);

      inputFields.push(this.chatNameInputField, this.descriptionInputField);

      this.editPeer = new EditPeer({
        peerId,
        inputFields,
        listenerSetter: this.listenerSetter,
        popupOptions: {isForum: (chat as Chat.channel).pFlags.forum},
        middleware: this.middlewareHelper.get()
      });
      this.content.append(this.editPeer.nextBtn);

      if(!canChangeInfo) {
        this.editPeer.avatarElem.node.classList.remove('avatar-placeholder');
        this.editPeer.avatarEdit.container.replaceChildren(this.editPeer.avatarElem.node);
        this.editPeer.avatarEdit.container.classList.add('disable-hover');
      }

      section.content.append(this.editPeer.avatarEdit.container, inputWrapper);
      this.scrollable.append(section.container);
    }

    {
      const section = new SettingSection({caption: true});

      if(canChangeType) {
        const chatTypeRow = new Row({
          titleLangKey: isBroadcast ? 'ChannelType' : 'GroupType',
          clickable: () => {
            const tab = this.slider.createTab(AppChatTypeTab);
            tab.chatId = this.chatId;
            tab.chatFull = chatFull;
            tab.open();
          },
          icon: 'lock',
          listenerSetter: this.listenerSetter
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
            slider: this.slider,
            getInitArgs: () => ({
              chatId: this.chatId,
              p: AppChatInviteLinksTab.getInitArgs(this.chatId)
            })
          },
          icon: 'link',
          listenerSetter: this.listenerSetter,
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
            getInitArgs: () => this.chatId,
            slider: this.slider
          },
          icon: 'adduser',
          listenerSetter: this.listenerSetter,
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
            slider: this.slider,
            getInitArgs: () => ({
              chatId: this.chatId,
              p: AppChatReactionsTab.getInitArgs(this.chatId)
            })
          },
          listenerSetter: this.listenerSetter
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

      if(canChangePermissions && !isBroadcast) {
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
            const tab = this.slider.createTab(AppGroupPermissionsTab);
            tab.chatId = this.chatId;
            tab.open();
          },
          icon: 'permissions',
          listenerSetter: this.listenerSetter
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

      if(canChangeInfo && isAdmin) {
        const discussionRow = new Row({
          icon: 'comments',
          titleLangKey: isBroadcast ? 'PeerInfo.Discussion' : 'LinkedChannel',
          subtitle: true,
          navigationTab: {
            constructor: AppChatDiscussionTab,
            getInitArgs: () => ({
              chatId: this.chatId,
              linkedChatId: (chatFull as ChatFull.channelFull).linked_chat_id,
              p: AppChatDiscussionTab.getInitArgs()
            }),
            slider: this.slider
          },
          listenerSetter: this.listenerSetter
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

      if(canManageTopics && isAdmin && (chat.participants_count >= appConfig.forum_upgrade_participants_min || (chat as Chat.channel).pFlags.forum) && !isBroadcast) {
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
          listenerSetter: this.listenerSetter
        });

        const setTopics = () => {
          const isForum = !!(chat as Chat.channel).pFlags.forum;
          this.editPeer.avatarElem.node.parentElement.classList.toggle('is-forum', isForum);
          topicsRow.checkboxField.setValueSilently(isForum);

          // const linkedChatId = (chatFull as ChatFull.channelFull).linked_chat_id;
          // topicsRow.toggleDisability(!!linkedChatId);
        };

        this.listenerSetter.add(topicsRow.checkboxField.input)('change', (e) => {
          if(!e.isTrusted) {
            return;
          }

          const promise = this.managers.appChatsManager.toggleForum(this.chatId, topicsRow.checkboxField.checked);
          topicsRow.disableWithPromise(promise);
        });

        setTopics();
        addChatUpdateListener(setTopics);
        addChatUpdateListener(setTopics, 'full');

        section.caption.replaceChildren(i18n('ForumToggleDescription'));
        section.content.append(topicsRow.container);
      }

      section.caption.classList.toggle('hide', !section.caption.childElementCount);

      if(section.content.childElementCount) this.scrollable.append(section.container);

      attachClickEvent(this.editPeer.nextBtn, () => {
        this.editPeer.nextBtn.disabled = true;

        const promises: Promise<any>[] = [];

        const id = this.chatId;
        if(this.chatNameInputField.isValidToChange()) {
          promises.push(this.managers.appChatsManager.editTitle(id, this.chatNameInputField.value));
        }

        if(this.descriptionInputField.isValidToChange()) {
          promises.push(this.managers.appChatsManager.editAbout(id, this.descriptionInputField.value));
        }

        if(this.editPeer.uploadAvatar) {
          promises.push(this.editPeer.uploadAvatar().then((inputFile) => {
            return this.managers.appChatsManager.editPhoto(id, inputFile);
          }));
        }

        Promise.race(promises).finally(() => {
          this.editPeer.nextBtn.removeAttribute('disabled');
          this.close();
        });
      }, {listenerSetter: this.listenerSetter});
    }

    {
      const section = new SettingSection({});

      if(canManageAdmins) {
        const administratorsRow = new Row({
          titleLangKey: 'PeerInfo.Administrators',
          subtitle: true,
          icon: 'admin',
          navigationTab: {
            constructor: AppChatAdministratorsTab,
            slider: this.slider,
            getInitArgs: () => ({
              chatId: this.chatId,
              p: AppChatAdministratorsTab.getInitArgs(this.chatId)
            })
          },
          listenerSetter: this.listenerSetter
        });

        const setAdministratorsLength = () => {
          administratorsRow.subtitle.textContent = '' + ((chatFull as ChatFull.channelFull).admins_count || 1);
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
            this.slider.createTab(AppChatMembersTab).open(this.chatId);
          },
          listenerSetter: this.listenerSetter,
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

      if(canChangePermissions) {
        const removedUsersRow = new Row({
          titleLangKey: 'ChannelBlockedUsers',
          subtitle: true,
          icon: 'deleteuser',
          clickable: () => {
            const tab = this.slider.createTab(AppRemovedUsersTab);
            tab.open(this.chatId);
          },
          listenerSetter: this.listenerSetter
        });

        const setRemovedUsersLength = () => {
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

      this.scrollable.append(section.container);
    }

    if(isBroadcast && canPostMessages) {
      const section = new SettingSection({caption: true});
      const signMessagesCheckboxField = new CheckboxField({
        text: 'ChannelSignMessages'
      });

      const showProfilesCheckboxField = new CheckboxField({
        text: 'ChannelSignMessagesWithProfile'
      });

      this.listenerSetter.add(signMessagesCheckboxField.input)('change', () => {
        const toggle = signMessagesCheckboxField.toggleDisability(true);
        this.managers.appChatsManager.toggleSignatures(this.chatId, signMessagesCheckboxField.checked, signMessagesCheckboxField.checked && showProfilesCheckboxField.checked).then(() => {
          toggle();
        });
      });

      this.listenerSetter.add(showProfilesCheckboxField.input)('change', () => {
        const toggle = showProfilesCheckboxField.toggleDisability(true);
        this.managers.appChatsManager.toggleSignatures(this.chatId, signMessagesCheckboxField.checked, showProfilesCheckboxField.checked).then(() => {
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
      this.scrollable.append(section.container);
    }

    if(!isBroadcast) {
      const section = new SettingSection({

      });

      if(!isBroadcast && canChangeType) {
        const showChatHistoryCheckboxField = new CheckboxField({
          text: 'ChatHistory'
        });

        this.listenerSetter.add(showChatHistoryCheckboxField.input)('change', () => {
          const toggle = showChatHistoryCheckboxField.toggleDisability(true);
          this.managers.appChatsManager.togglePreHistoryHidden(this.chatId, !showChatHistoryCheckboxField.checked).then(() => {
            toggle();
          });
        });

        // ! it won't be updated because chatFull will be old
        const onChatUpdate = () => {
          showChatHistoryCheckboxField.setValueSilently(isChannel && !(chatFull as ChatFull.channelFull).pFlags.hidden_prehistory);
        };

        onChatUpdate();
        addChatUpdateListener(onChatUpdate);

        section.content.append(CreateRowFromCheckboxField(showChatHistoryCheckboxField).container);
      }

      if(section.content.childElementCount) {
        this.scrollable.append(section.container);
      }
    }

    if(canDeleteChat) {
      const section = new SettingSection({});

      const btnDelete = Button('btn-primary btn-transparent danger', {icon: 'delete', text: isBroadcast ? 'PeerInfo.DeleteChannel' : 'DeleteAndExitButton'});

      attachClickEvent(btnDelete, () => {
        PopupElement.createPopup(PopupDeleteDialog, peerId/* , 'delete' */, undefined, (promise) => {
          const toggle = toggleDisability([btnDelete], true);
          promise.then(() => {
            this.close();
          }, () => {
            toggle();
          });
        });
      }, {listenerSetter: this.listenerSetter});

      section.content.append(btnDelete);

      this.scrollable.append(section.container);
    }

    if(!isChannel) {
      // ! this one will fire earlier than tab's closeAfterTimeout (destroy) event and listeners will be erased, so destroy won't fire
      this.listenerSetter.add(rootScope)('dialog_migrate', ({migrateFrom, migrateTo}) => {
        if(peerId === migrateFrom) {
          this.chatId = migrateTo.toChatId();
          this._init();
        }
      });
    }
  }

  public init() {
    return this._init();
  }
}
