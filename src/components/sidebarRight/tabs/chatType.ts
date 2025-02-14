/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {copyTextToClipboard} from '../../../helpers/clipboard';
import {randomLong} from '../../../helpers/random';
import {Chat, ChatFull, ExportedChatInvite} from '../../../layer';
import Button from '../../button';
import {setButtonLoader} from '../../putPreloader';
import RadioField from '../../radioField';
import Row, {RadioFormFromRows} from '../../row';
import {toast} from '../../toast';
import {UsernameInputField} from '../../usernameInputField';
import {SliderSuperTabEventable} from '../../sliderTab';
import I18n, {i18n} from '../../../lib/langPack';
import PopupPeer from '../../popups/peer';
import ButtonCorner from '../../buttonCorner';
import {attachClickEvent} from '../../../helpers/dom/clickEvent';
import toggleDisability from '../../../helpers/dom/toggleDisability';
import CheckboxField from '../../checkboxField';
import rootScope from '../../../lib/rootScope';
import SettingSection from '../../settingSection';
import UsernamesSection from '../../usernamesSection';
import getPeerEditableUsername from '../../../lib/appManagers/utils/peers/getPeerEditableUsername';
import getPeerActiveUsernames from '../../../lib/appManagers/utils/peers/getPeerActiveUsernames';
import {purchaseUsernameCaption} from '../../sidebarLeft/tabs/editProfile';
import confirmationPopup from '../../confirmationPopup';
import PopupElement from '../../popups';
import apiManagerProxy from '../../../lib/mtproto/mtprotoworker';

export default class AppChatTypeTab extends SliderSuperTabEventable {
  public chatId: ChatId;
  public chatFull: ChatFull;

  public async init() {
    this.container.classList.add('edit-peer-container', 'group-type-container');

    const isBroadcast = await this.managers.appChatsManager.isBroadcast(this.chatId);
    const linkedChatId = (this.chatFull as ChatFull.channelFull).linked_chat_id;

    this.setTitle(isBroadcast ? 'ChannelType' : 'GroupType');

    const section = new SettingSection({
      name: isBroadcast ? 'ChannelType' : 'GroupType'
    });

    const random = randomLong();
    const privateRow = new Row({
      radioField: new RadioField({
        langKey: isBroadcast ? 'ChannelPrivate' : 'MegaPrivate',
        name: random,
        value: 'private'
      }),
      subtitleLangKey: isBroadcast ? 'ChannelPrivateInfo' : 'MegaPrivateInfo'
    });
    const publicRow = new Row({
      radioField: new RadioField({
        langKey: isBroadcast ? 'ChannelPublic' : 'MegaPublic',
        name: random,
        value: 'public'
      }),
      subtitleLangKey: isBroadcast ? 'ChannelPublicInfo' : 'MegaPublicInfo'
    });
    const form = RadioFormFromRows([privateRow, publicRow], (value) => {
      const a: HTMLElement[][] = [[privateSection.container], [publicContainer]];
      if(value === 'public') a.reverse();

      a[0].forEach((container) => container.classList.remove('hide'));
      a[1].forEach((container) => container.classList.add('hide'));

      onChange();

      if(joinRequestSection && !linkedChatId) {
        joinRequestSection.container.classList.toggle('hide', value !== 'public');
      }
    });

    let chat: Chat = apiManagerProxy.getChat(this.chatId);

    const chatUpdateListeners: {[type in 'basic']: (() => void)[]} = {basic: []};
    const addChatUpdateListener = (callback: () => void, type: 'basic' = 'basic') => {
      chatUpdateListeners[type].push(callback);
    };

    this.listenerSetter.add(rootScope)('chat_update', (chatId) => {
      if(this.chatId === chatId) {
        chat = apiManagerProxy.getChat(this.chatId) as typeof chat;
        chatUpdateListeners['basic'].forEach((callback) => callback());
      }
    });

    section.content.append(form);

    const privateSection = new SettingSection({});

    // let revoked = false;
    const linkRow = new Row({
      title: (this.chatFull.exported_invite as ExportedChatInvite.chatInviteExported).link,
      subtitleLangKey: isBroadcast ? 'ChannelPrivateLinkHelp' : 'MegaPrivateLinkHelp',
      clickable: () => {
        copyTextToClipboard((this.chatFull.exported_invite as ExportedChatInvite.chatInviteExported).link);
        toast(I18n.format('LinkCopied', true));
      },
      listenerSetter: this.listenerSetter
    });

    const btnRevoke = Button('btn-primary btn-transparent danger', {icon: 'delete', text: 'RevokeLink'});

    attachClickEvent(btnRevoke, () => {
      PopupElement.createPopup(PopupPeer, 'revoke-link', {
        buttons: [{
          langKey: 'RevokeButton',
          callback: () => {
            const toggle = toggleDisability([btnRevoke], true);

            this.managers.appProfileManager.getChatInviteLink(this.chatId, true).then((link) => {
              toggle();
              linkRow.title.textContent = link;
              // revoked = true;
              // onChange();
            });
          }
        }],
        titleLangKey: 'RevokeLink',
        descriptionLangKey: 'RevokeAlert'
      }).show();
    }, {listenerSetter: this.listenerSetter});

    privateSection.content.append(linkRow.container, btnRevoke);

    const publicSection = new SettingSection({
      caption: true,
      noDelimiter: true
    });

    const inputWrapper = document.createElement('div');
    inputWrapper.classList.add('input-wrapper');

    const placeholder = 't.me/';

    let changedPrivacy: boolean, changedJoinToSend: boolean, changedJoinRequest: boolean;
    const onChange = () => {
      changedPrivacy = (privateRow.radioField.checked && (originalValue !== placeholder/*  || revoked */)) ||
        (linkInputField.isValidToChange() && linkInputField.input.classList.contains('valid'));
      changedJoinToSend = !!joinToSendRow && joinToSendRow.checkboxField.checked !== originalJoinToSend;
      changedJoinRequest = !!joinRequestRow && joinRequestRow.checkboxField.checked !== originalJoinRequest;
      applyBtn.classList.toggle('is-visible', changedPrivacy || changedJoinToSend || changedJoinRequest);

      const {error} = linkInputField;
      const isPurchase = error?.type === 'USERNAME_PURCHASE_AVAILABLE';
      setUsername(isPurchase ? linkInputField.getValue() : undefined);
    };

    const linkInputField = new UsernameInputField({
      label: 'SetUrlPlaceholder',
      name: 'group-public-link',
      plainText: true,
      listenerSetter: this.listenerSetter,
      availableText: 'Link.Available',
      invalidText: 'Link.Invalid',
      takenText: 'Link.Taken',
      onChange: onChange,
      peerId: this.chatId.toPeerId(true),
      head: placeholder
    }, this.managers);

    const {setUsername, element: p} = purchaseUsernameCaption();

    publicSection.caption.append(
      p,
      i18n(isBroadcast ? 'Channel.UsernameAboutChannel' : 'Channel.UsernameAboutGroup')
    );

    const usernamesSection = new UsernamesSection({
      peerId: this.chatId.toPeerId(true),
      peer: chat as Chat.channel,
      listenerSetter: this.listenerSetter,
      usernameInputField: linkInputField,
      middleware: this.middlewareHelper.get()
    });

    const publicContainer = document.createElement('div');
    publicContainer.append(publicSection.container, usernamesSection.container);

    const originalValue = placeholder + (getPeerEditableUsername(chat as Chat.channel) || '');

    inputWrapper.append(linkInputField.container)
    publicSection.content.append(inputWrapper);

    const applyBtn = ButtonCorner({icon: 'check', className: 'is-visible'});
    this.content.append(applyBtn);

    const getUsername = () => publicRow.radioField.checked ? linkInputField.getValue() : '';

    const changePrivacy = async() => {
      const username = getUsername();
      const channelId = await this.managers.appChatsManager.migrateChat(this.chatId);
      if(!username) {
        return this.managers.appChatsManager.makeChannelPrivate(channelId);
      } else {
        return this.managers.appChatsManager.updateUsername(channelId, username);
      }
    };

    const confirmChangingPrivacy = async() => {
      const username = getUsername();
      if(!username) {
        const chat = apiManagerProxy.getChat(this.chatId);
        const wasUsername = getPeerEditableUsername(chat as Chat.channel);
        if(wasUsername) {
          await confirmationPopup({
            descriptionLangKey: isBroadcast ? 'ChannelVisibility.Confirm.MakePrivate.Channel' : 'ChannelVisibility.Confirm.MakePrivate.Group',
            descriptionLangArgs: [wasUsername],
            button: {
              langKey: 'OK'
            }
          });
        }
      }
    };

    attachClickEvent(applyBtn, async() => {
      if(changedPrivacy) {
        await confirmChangingPrivacy();
      }

      const unsetLoader = setButtonLoader(applyBtn);
      try {
        if(changedPrivacy) {
          await changePrivacy();
        }

        if(changedJoinToSend || changedJoinRequest) {
          await Promise.all([
            changedJoinToSend && this.managers.appChatsManager.toggleJoinToSend(
              this.chatId,
              joinToSendRow.checkboxField.checked
            ),
            changedJoinRequest && this.managers.appChatsManager.toggleJoinRequest(
              this.chatId,
              joinRequestRow.checkboxField.checked
            )
          ]);
        }

        this.close();
      } catch(err) {
        unsetLoader();
      }
    }, {listenerSetter: this.listenerSetter});

    this.scrollable.append(section.container, privateSection.container, publicContainer);

    let joinRequestSection: SettingSection, joinToSendRow: Row, joinRequestRow: Row, originalJoinToSend: boolean, originalJoinRequest: boolean;
    if(!isBroadcast) {
      const section = joinRequestSection = new SettingSection({
        name: 'ChannelSettingsJoinTitle',
        caption: linkedChatId ? 'ChannelSettingsJoinToSendInfo' : 'ChannelSettingsJoinRequestInfo'
      });

      joinToSendRow = new Row({
        titleLangKey: 'ChannelSettingsJoinToSend',
        checkboxField: new CheckboxField({
          toggle: true
        })
      });

      joinRequestRow = new Row({
        titleLangKey: 'ChannelSettingsJoinRequest',
        checkboxField: new CheckboxField({
          toggle: true
        })
      });

      const canToggleJoinRequest = () => {
        return linkedChatId ? joinToSendRow.checkboxField.checked : !publicContainer.classList.contains('hide');
      };

      const toggleJoinRequestVisibility = () => {
        const can = canToggleJoinRequest();
        joinRequestRow.container.classList.toggle('hide', !can);
        if(!can && joinRequestRow.checkboxField.checked) {
          joinRequestRow.checkboxField.checked = false;
        }
      };

      const onChatUpdate = () => {
        originalJoinToSend = !!(chat as Chat.channel).pFlags.join_to_send;
        originalJoinRequest = !!(chat as Chat.channel).pFlags.join_request;
        joinToSendRow.checkboxField.setValueSilently(originalJoinToSend);
        joinRequestRow.checkboxField.setValueSilently(originalJoinRequest);
        toggleJoinRequestVisibility();
        onChange();
      };

      [joinToSendRow, joinRequestRow].forEach((row) => {
        this.listenerSetter.add(row.checkboxField.input)('change', () => {
          if(joinToSendRow === row) {
            toggleJoinRequestVisibility();
          }

          onChange();
        });
      });

      if(!linkedChatId) {
        joinToSendRow.container.classList.add('hide');
      }

      addChatUpdateListener(onChatUpdate);
      onChatUpdate();

      section.content.append(joinToSendRow.container, joinRequestRow.container);
      this.scrollable.append(section.container);
    }

    {
      const section = new SettingSection({
        name: 'SavingContentTitle',
        caption: isBroadcast ? 'RestrictSavingContentInfoChannel' : 'RestrictSavingContentInfoGroup'
      });

      let checkboxField: CheckboxField;
      const row = new Row({
        titleLangKey: 'RestrictSavingContent',
        checkboxField: checkboxField = new CheckboxField({toggle: true})
      });

      this.listenerSetter.add(checkboxField.input)('change', () => {
        const toggle = row.toggleDisability(true);
        this.managers.appChatsManager.toggleNoForwards(this.chatId, checkboxField.checked).then(() => {
          toggle();
        });
      });

      const onChatUpdate = () => {
        checkboxField.setValueSilently(!!(chat as Chat.channel).pFlags.noforwards);
      };

      addChatUpdateListener(onChatUpdate);
      onChatUpdate();

      section.content.append(row.container);

      this.scrollable.append(section.container);
    }

    (originalValue !== placeholder || getPeerActiveUsernames(chat as Chat.channel).length ? publicRow : privateRow).radioField.checked = true;
    linkInputField.setOriginalValue(originalValue, true);
  }
}
