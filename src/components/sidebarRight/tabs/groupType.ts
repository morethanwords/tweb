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
import { SliderSuperTab } from "../../slider";
import { toast } from "../../toast";
import { UsernameInputField } from "../../usernameInputField";

export default class AppGroupTypeTab extends SliderSuperTab {
  public peerId: number;
  public chatFull: ChatFull;

  protected init() {
    this.container.classList.add('edit-peer-container', 'group-type-container');
    this.title.innerHTML = 'Group Type';

    const section = new SettingSection({
      name: 'Group Type'
    });

    const random = randomLong();
    const privateRow = new Row({
      radioField: new RadioField({
        text: 'Private Group', 
        name: random, 
        value: 'private'
      }),
      subtitle: 'Private groups can only be joined if you were invited or have an invite link.'
    });
    const publicRow = new Row({
      radioField: new RadioField({
        text: 'Public Group', 
        name: random, 
        value: 'public'
      }),
      subtitle: 'Public groups can be found in search, history is available to everyone and anyone can join.'
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
      subtitle: 'People can join your group by following this link. You can revoke the link at any time.',
      clickable: () => {
        copyTextToClipboard((this.chatFull.exported_invite as ExportedChatInvite.chatInviteExported).link);
        toast('Invite link copied to clipboard.');
      }
    });

    const btnRevoke = Button('btn-primary btn-transparent danger', {icon: 'delete', text: 'Revoke Link'});

    attachClickEvent(btnRevoke, () => {
      new PopupConfirmAction('revoke-link', [{
        text: 'OK',
        callback: () => {
          toggleDisability([btnRevoke], true);
          
          appProfileManager.getChatInviteLink(-this.peerId, true).then(link => {
            toggleDisability([btnRevoke], false);
            linkRow.title.innerHTML = link;
            //revoked = true;
            //onChange();
          });
        }
      }], {
        title: 'Revoke Link?',
        text: 'Your previous link will be deactivated and we\'ll generate a new invite link for you.'
      }).show();
    }, {listenerSetter: this.listenerSetter});

    privateSection.content.append(linkRow.container, btnRevoke);

    const publicSection = new SettingSection({
      caption: 'People can share this link with others and find your group using Telegram search.',
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
      label: 'Link',
      name: 'group-public-link',
      plainText: true,
      listenerSetter: this.listenerSetter,
      availableText: 'Link is available',
      invalidText: 'Link is invalid',
      takenText: 'Link is already taken',
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
      const unsetLoader = setButtonLoader(applyBtn);
      const username = publicRow.radioField.checked ? linkInputField.getValue() : '';
      appChatsManager.migrateChat(-this.peerId).then(channelId => {
        return appChatsManager.updateUsername(channelId, username);
      }).then(() => {
        unsetLoader();
        this.close();
      });
    }, {listenerSetter: this.listenerSetter});

    (originalValue !== placeholder ? publicRow : privateRow).radioField.checked = true;
    linkInputField.setOriginalValue(originalValue);

    this.scrollable.append(section.container, privateSection.container, publicSection.container);
  }
}
