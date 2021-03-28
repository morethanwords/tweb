import { copyTextToClipboard } from "../../../helpers/clipboard";
import { attachClickEvent, toggleDisability } from "../../../helpers/dom";
import { randomLong } from "../../../helpers/random";
import { Chat, ChatFull, ExportedChatInvite } from "../../../layer";
import appChatsManager from "../../../lib/appManagers/appChatsManager";
import appProfileManager from "../../../lib/appManagers/appProfileManager";
import Button from "../../button";
import { setButtonLoader } from "../../misc";
import PopupConfirmAction from "../../popups/confirmAction";
import RadioField from "../../radioField";
import Row, { RadioFormFromRows } from "../../row";
import { SettingSection } from "../../sidebarLeft";
import { toast } from "../../toast";
import { UsernameInputField } from "../../usernameInputField";
import { SliderSuperTabEventable } from "../../sliderTab";
import I18n from "../../../lib/langPack";

export default class AppGroupTypeTab extends SliderSuperTabEventable {
  public peerId: number;
  public chatFull: ChatFull;

  protected init() {
    this.container.classList.add('edit-peer-container', 'group-type-container');
    this.setTitle('GroupType');

    const section = new SettingSection({
      name: 'GroupType'
    });

    const random = randomLong();
    const privateRow = new Row({
      radioField: new RadioField({
        langKey: 'MegaPrivate', 
        name: random, 
        value: 'private'
      }),
      subtitleLangKey: 'MegaPrivateInfo'
    });
    const publicRow = new Row({
      radioField: new RadioField({
        langKey: 'MegaPublic', 
        name: random, 
        value: 'public'
      }),
      subtitleLangKey: 'MegaPublicInfo'
    });
    const form = RadioFormFromRows([privateRow, publicRow], (value) => {
      const a = [privateSection, publicSection];
      if(value === 'public') a.reverse();

      a[0].container.classList.remove('hide');
      a[1].container.classList.add('hide');

      onChange();
    });

    const chat: Chat = appChatsManager.getChat(-this.peerId);

    section.content.append(form);

    const privateSection = new SettingSection({});

    //let revoked = false;
    const linkRow = new Row({
      title: (this.chatFull.exported_invite as ExportedChatInvite.chatInviteExported).link,
      subtitleLangKey: 'MegaPrivateLinkHelp',
      clickable: () => {
        copyTextToClipboard((this.chatFull.exported_invite as ExportedChatInvite.chatInviteExported).link);
        toast(I18n.format('LinkCopied', true));
      }
    });

    const btnRevoke = Button('btn-primary btn-transparent danger', {icon: 'delete', text: 'RevokeLink'});

    attachClickEvent(btnRevoke, () => {
      new PopupConfirmAction('revoke-link', [{
        langKey: 'RevokeButton',
        callback: () => {
          const toggle = toggleDisability([btnRevoke], true);
          
          appProfileManager.getChatInviteLink(-this.peerId, true).then(link => {
            toggle();
            linkRow.title.innerHTML = link;
            //revoked = true;
            //onChange();
          });
        }
      }], {
        title: 'RevokeLink',
        text: 'RevokeAlert'
      }).show();
    }, {listenerSetter: this.listenerSetter});

    privateSection.content.append(linkRow.container, btnRevoke);

    const publicSection = new SettingSection({
      caption: 'Channel.UsernameAboutGroup',
      noDelimiter: true
    });

    const inputWrapper = document.createElement('div');
    inputWrapper.classList.add('input-wrapper');

    const placeholder = 't.me/';

    const onChange = () => {
      const changed = (privateRow.radioField.checked && (originalValue !== placeholder/*  || revoked */)) 
        || (linkInputField.isValid() && linkInputField.input.classList.contains('valid'));
      applyBtn.classList.toggle('is-visible', changed);
    };

    const linkInputField = new UsernameInputField({
      label: 'SetUrlPlaceholder',
      name: 'group-public-link',
      plainText: true,
      listenerSetter: this.listenerSetter,
      availableText: 'Link.Available',
      invalidText: 'Link is invalid',
      takenText: 'Link.Taken',
      onChange: onChange,
      peerId: this.peerId,
      head: placeholder
    });

    const originalValue = placeholder + ((chat as Chat.channel).username || '');

    inputWrapper.append(linkInputField.container)
    publicSection.content.append(inputWrapper);

    const applyBtn = Button('btn-circle btn-corner tgico-check is-visible');
    this.content.append(applyBtn);

    attachClickEvent(applyBtn, () => {
      /* const unsetLoader =  */setButtonLoader(applyBtn);
      const username = publicRow.radioField.checked ? linkInputField.getValue() : '';
      appChatsManager.migrateChat(-this.peerId).then(channelId => {
        return appChatsManager.updateUsername(channelId, username);
      }).then(() => {
        //unsetLoader();
        this.close();
      });
    }, {listenerSetter: this.listenerSetter});

    (originalValue !== placeholder ? publicRow : privateRow).radioField.checked = true;
    linkInputField.setOriginalValue(originalValue);

    this.scrollable.append(section.container, privateSection.container, publicSection.container);
  }
}
