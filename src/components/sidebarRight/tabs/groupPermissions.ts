import ListenerSetter from "../../../helpers/listenerSetter";
import { Chat, ChatBannedRights } from "../../../layer";
import appChatsManager, { ChatRights } from "../../../lib/appManagers/appChatsManager";
import CheckboxField from "../../checkboxField";
import Row from "../../row";
import { SettingSection } from "../../sidebarLeft";
import { SliderSuperTabEventable } from "../../sliderTab";

export default class AppGroupPermissionsTab extends SliderSuperTabEventable {
  public chatId: number;

  protected init() {
    this.container.classList.add('edit-peer-container', 'group-permissions-container');
    this.title.innerHTML = 'Permissions';

    class ChatPermissions {
      private v: Array<{
        flags: ChatRights[],
        text: string,
        checkboxField?: CheckboxField
      }>;
      private toggleWith: Partial<{[chatRight in ChatRights]: ChatRights[]}>;

      constructor(options: {
        chatId: number,
        listenerSetter: ListenerSetter,
        appendTo: HTMLElement,
        userId: number
      }) {
        this.v = [
          {flags: ['send_messages'], text: 'Send Messages'},
          {flags: ['send_media'], text: 'Send Media'},
          {flags: ['send_stickers', 'send_gifs'], text: 'Send Stickers & GIFs'},
          {flags: ['send_polls'], text: 'Send Polls'},
          {flags: ['embed_links'], text: 'Send Links'},
          {flags: ['invite_users'], text: 'Add Users'},
          {flags: ['pin_messages'], text: 'Pin Messages'},
          {flags: ['change_info'], text: 'Change Chat Info'}
        ];

        this.toggleWith = {
          'send_messages': ['send_media', 'send_stickers', 'send_polls', 'embed_links']
        };

        for(const info of this.v) {
          const mainFlag = info.flags[0];
          info.checkboxField = new CheckboxField({
            text: info.text,
            checked: appChatsManager.hasRights(options.chatId, mainFlag, options.userId),
            restriction: true
          });
  
          if(this.toggleWith[mainFlag]) {
            options.listenerSetter.add(info.checkboxField.input, 'change', () => {
              if(!info.checkboxField.checked) {
                const other = this.v.filter(i => this.toggleWith[mainFlag].includes(i.flags[0]));
                other.forEach(info => {
                  info.checkboxField.checked = false;
                });
              }
            });
          }
  
          options.appendTo.append(info.checkboxField.label);
        }
      }

      public takeOut() {
        const rights: ChatBannedRights = {
          _: 'chatBannedRights',
          until_date: 0x7FFFFFFF,
          pFlags: {}
        };

        for(const info of this.v) {
          const banned = !info.checkboxField.checked;
          if(banned) {
            info.flags.forEach(flag => {
              // @ts-ignore
              rights.pFlags[flag] = true;
            });
          }
        }

        return rights;
      }
    }

    {
      const section = new SettingSection({
        name: 'What can members of this group do?',
      });

      const p = new ChatPermissions({
        chatId: this.chatId,
        listenerSetter: this.listenerSetter,
        appendTo: section.content,
        userId: 0
      });

      this.eventListener.addEventListener('destroy', () => {
        appChatsManager.editChatDefaultBannedRights(this.chatId, p.takeOut());
      });

      this.scrollable.append(section.container);
    }
    
    {
      const section = new SettingSection({
        name: 'Exceptions'
      });

      const removedUsersRow = new Row({
        title: 'Removed Users',
        subtitle: 'No removed users',
        icon: 'deleteuser',
        clickable: true
      });

      section.content.append(removedUsersRow.container);

      const c = section.generateContentElement();
      c.classList.add('chatlist-container');
      

      this.scrollable.append(section.container);
    }
  }
}
