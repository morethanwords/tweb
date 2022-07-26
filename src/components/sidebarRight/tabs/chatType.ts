/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import { copyTextToClipboard } from "../../../helpers/clipboard";
import { randomLong } from "../../../helpers/random";
import { Chat, ChatFull, ExportedChatInvite } from "../../../layer";
import Button from "../../button";
import { setButtonLoader } from "../../putPreloader";
import RadioField from "../../radioField";
import Row, { RadioFormFromRows } from "../../row";
import { SettingSection } from "../../sidebarLeft";
import { toast } from "../../toast";
import { UsernameInputField } from "../../usernameInputField";
import { SliderSuperTabEventable } from "../../sliderTab";
import I18n from "../../../lib/langPack";
import PopupPeer from "../../popups/peer";
import ButtonCorner from "../../buttonCorner";
import { attachClickEvent } from "../../../helpers/dom/clickEvent";
import toggleDisability from "../../../helpers/dom/toggleDisability";
import CheckboxField from "../../checkboxField";
import rootScope from "../../../lib/rootScope";

export default class AppChatTypeTab extends SliderSuperTabEventable {
  public chatId: ChatId;
  public chatFull: ChatFull;

  protected async init() {
    this.container.classList.add('edit-peer-container', 'group-type-container');

    const isBroadcast = await this.managers.appChatsManager.isBroadcast(this.chatId);

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
      const a = [privateSection, publicSection];
      if(value === 'public') a.reverse();

      a[0].container.classList.remove('hide');
      a[1].container.classList.add('hide');

      onChange();
    });

    const chat: Chat = await this.managers.appChatsManager.getChat(this.chatId);

    section.content.append(form);

    const privateSection = new SettingSection({});

    //let revoked = false;
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
      new PopupPeer('revoke-link', {
        buttons: [{
          langKey: 'RevokeButton',
          callback: () => {
            const toggle = toggleDisability([btnRevoke], true);
            
            this.managers.appProfileManager.getChatInviteLink(this.chatId, true).then((link) => {
              toggle();
              linkRow.title.innerHTML = link;
              //revoked = true;
              //onChange();
            });
          }
        }],
        titleLangKey: 'RevokeLink',
        descriptionLangKey: 'RevokeAlert'
      }).show();
    }, {listenerSetter: this.listenerSetter});

    privateSection.content.append(linkRow.container, btnRevoke);

    const publicSection = new SettingSection({
      caption: isBroadcast ? 'Channel.UsernameAboutChannel' : 'Channel.UsernameAboutGroup',
      noDelimiter: true
    });

    const inputWrapper = document.createElement('div');
    inputWrapper.classList.add('input-wrapper');

    const placeholder = 't.me/';

    const onChange = () => {
      const changed = (privateRow.radioField.checked && (originalValue !== placeholder/*  || revoked */)) 
        || (linkInputField.isValidToChange() && linkInputField.input.classList.contains('valid'));
      applyBtn.classList.toggle('is-visible', changed);
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

    const originalValue = placeholder + ((chat as Chat.channel).username || '');

    inputWrapper.append(linkInputField.container)
    publicSection.content.append(inputWrapper);

    const applyBtn = ButtonCorner({icon: 'check', className: 'is-visible'});
    this.content.append(applyBtn);

    attachClickEvent(applyBtn, () => {
      /* const unsetLoader =  */setButtonLoader(applyBtn);
      const username = publicRow.radioField.checked ? linkInputField.getValue() : '';
      this.managers.appChatsManager.migrateChat(this.chatId).then((channelId) => {
        return this.managers.appChatsManager.updateUsername(channelId, username);
      }).then(() => {
        //unsetLoader();
        this.close();
      });
    }, {listenerSetter: this.listenerSetter});

    (originalValue !== placeholder ? publicRow : privateRow).radioField.checked = true;
    linkInputField.setOriginalValue(originalValue);

    this.scrollable.append(section.container, privateSection.container, publicSection.container);

    {
      const section = new SettingSection({
        name: 'SavingContentTitle',
        caption: isBroadcast ? 'RestrictSavingContentInfoChannel' : 'RestrictSavingContentInfoGroup'
      });

      const checkboxField = new CheckboxField({
        text: 'RestrictSavingContent',
        withRipple: true
      });

      this.listenerSetter.add(checkboxField.input)('change', () => {
        const toggle = checkboxField.toggleDisability(true);
        this.managers.appChatsManager.toggleNoForwards(this.chatId, checkboxField.checked).then(() => {
          toggle();
        });
      });

      const onChatUpdate = () => {
        checkboxField.setValueSilently(!!(chat as Chat.channel).pFlags.noforwards);
      };

      this.listenerSetter.add(rootScope)('chat_update', (chatId) => {
        if(this.chatId === chatId) {
          onChatUpdate();
        }
      });

      onChatUpdate();

      section.content.append(checkboxField.label);

      this.scrollable.append(section.container);
    }
  }
}
