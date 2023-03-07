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
import {Chat, ChatFull} from '../../../layer';
import AppChatTypeTab from './chatType';
import rootScope from '../../../lib/rootScope';
import AppGroupPermissionsTab from './groupPermissions';
import {i18n, LangPackKey} from '../../../lib/langPack';
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

export default class AppEditChatTab extends SliderSuperTab {
  private chatNameInputField: InputField;
  private descriptionInputField: InputField;
  private editPeer: EditPeer;
  public chatId: ChatId;

  protected async _init() {
    // * cleanup prev
    this.listenerSetter.removeAll();
    this.scrollable.container.replaceChildren();

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
      appConfig
    ] = await Promise.all([
      this.managers.appProfileManager.getChatFull(this.chatId, true),
      this.managers.appChatsManager.getChat(this.chatId) as Promise<Chat.chat | Chat.channel>,
      this.managers.appChatsManager.isBroadcast(this.chatId),
      this.managers.appChatsManager.isChannel(this.chatId),
      this.managers.appChatsManager.hasRights(this.chatId, 'change_type'),
      this.managers.appChatsManager.hasRights(this.chatId, 'change_permissions'),
      this.managers.appChatsManager.hasRights(this.chatId, 'manage_topics'),
      this.managers.apiManager.getAppConfig()
    ]);

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
        chatFull = await this.managers.appProfileManager.getCachedFullChat(chatId) || chatFull;
        chatUpdateListeners['full'].forEach((callback) => callback());
      }
    });

    const peerId = this.chatId.toPeerId(true);

    {
      const section = new SettingSection({noDelimiter: true, caption: true});
      const inputFields: InputField[] = [];

      const inputWrapper = document.createElement('div');
      inputWrapper.classList.add('input-wrapper');

      this.chatNameInputField = new InputField({
        label: isBroadcast ? 'EnterChannelName' : 'CreateGroup.NameHolder',
        name: 'chat-name',
        maxLength: 255,
        required: true
      });
      this.descriptionInputField = new InputField({
        label: 'DescriptionPlaceholder',
        name: 'chat-description',
        maxLength: 255
      });

      this.chatNameInputField.setOriginalValue(chat.title);
      this.descriptionInputField.setOriginalValue(chatFull.about);

      inputWrapper.append(this.chatNameInputField.container, this.descriptionInputField.container);

      inputFields.push(this.chatNameInputField, this.descriptionInputField);

      this.editPeer = new EditPeer({
        peerId,
        inputFields,
        listenerSetter: this.listenerSetter,
        popupOptions: {isForum: (chat as Chat.channel).pFlags.forum}
      });
      this.content.append(this.editPeer.nextBtn);

      section.content.append(this.editPeer.avatarEdit.container, inputWrapper);

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

      if(canChangeType || canChangePermissions) {
        const reactionsRow = new Row({
          titleLangKey: 'Reactions',
          icon: 'reactions',
          clickable: () => {
            const tab = this.slider.createTab(AppChatReactionsTab);
            tab.chatId = this.chatId;
            tab.open();
          },
          listenerSetter: this.listenerSetter
        });

        const availableReactions = await this.managers.appReactionsManager.getAvailableReactions();
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
          permissionsRow.subtitle.textContent = flags.reduce((acc, f) => acc + +hasRights(chat, f, (chat as Chat.chat).default_banned_rights), 0) + '/' + flags.length;
        };

        setPermissionsLength();
        addChatUpdateListener(setPermissionsLength);
        section.content.append(permissionsRow.container);
      }

      if(canManageTopics && (chat.participants_count >= appConfig.forum_upgrade_participants_min || (chat as Chat.channel).pFlags.forum) && !isBroadcast) {
        const topicsRow = new Row({
          checkboxField: new CheckboxField({toggle: true}),
          titleLangKey: 'Topics',
          clickable: () => {},
          icon: 'topics',
          listenerSetter: this.listenerSetter
        });

        const setTopics = () => {
          const isForum = !!(chat as Chat.channel).pFlags.forum;
          this.editPeer.avatarElem.parentElement.classList.toggle('is-forum', isForum);
          topicsRow.checkboxField.setValueSilently(isForum);
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

        section.caption.replaceChildren(i18n('ForumToggleDescription'));
        section.content.append(topicsRow.container);
      }

      section.caption.classList.toggle('hide', !section.caption.childElementCount);

      /* const administratorsRow = new Row({
        titleLangKey: 'PeerInfo.Administrators',
        subtitle: '' + ((chatFull as ChatFull.channelFull).admins_count || 1),
        icon: 'admin',
        clickable: true
      });

      section.content.append(administratorsRow.container); */

      this.scrollable.append(section.container);

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


      /* if(appChatsManager.hasRights(-this.peerId, 'change_info')) {
        const discussionRow = new Row({
          titleLangKey: 'PeerInfo.Discussion',
          subtitleLangKey: 'PeerInfo.Discussion.Add',
          clickable: true,
          icon: 'message'
        });

        section.content.append(discussionRow.container);
      }

      const administratorsRow = new Row({
        titleLangKey: 'PeerInfo.Administrators',
        subtitle: '' + chatFull.admins_count,
        icon: 'admin',
        clickable: true
      });

      section.content.append(administratorsRow.container); */

      if(isBroadcast && await this.managers.appChatsManager.hasRights(this.chatId, 'change_info')) {
        const signMessagesCheckboxField = new CheckboxField({
          text: 'ChannelSignMessages',
          checked: !!(chat as Chat.channel).pFlags.signatures
        });

        this.listenerSetter.add(signMessagesCheckboxField.input)('change', () => {
          const toggle = signMessagesCheckboxField.toggleDisability(true);
          this.managers.appChatsManager.toggleSignatures(this.chatId, signMessagesCheckboxField.checked).then(() => {
            toggle();
          });
        });

        addChatUpdateListener(() => {
          signMessagesCheckboxField.setValueSilently(!!(chat as Chat.channel).pFlags.signatures);
        });

        section.content.append(CreateRowFromCheckboxField(signMessagesCheckboxField).container);
      }
    }

    if(!isBroadcast) {
      const section = new SettingSection({

      });

      /* const membersRow = new Row({
        titleLangKey: isBroadcast ? 'PeerInfo.Subscribers' : 'GroupMembers',
        icon: 'newgroup',
        clickable: true
      });

      membersRow.subtitle.append(i18n('Subscribers', [numberThousandSplitter(335356)]));

      section.content.append(membersRow.container); */

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

    if(await this.managers.appChatsManager.hasRights(this.chatId, 'delete_chat')) {
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
