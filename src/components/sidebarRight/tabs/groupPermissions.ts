import { attachClickEvent, findUpTag } from "../../../helpers/dom";
import ListenerSetter from "../../../helpers/listenerSetter";
import ScrollableLoader from "../../../helpers/listLoader";
import { ChannelParticipant, Chat, ChatBannedRights, Update } from "../../../layer";
import appChatsManager, { ChatRights } from "../../../lib/appManagers/appChatsManager";
import appDialogsManager from "../../../lib/appManagers/appDialogsManager";
import appProfileManager from "../../../lib/appManagers/appProfileManager";
import rootScope from "../../../lib/rootScope";
import CheckboxField from "../../checkboxField";
import PopupPickUser from "../../popups/pickUser";
import Row from "../../row";
import { SettingSection } from "../../sidebarLeft";
import { SliderSuperTabEventable } from "../../sliderTab";
import { toast } from "../../toast";
import AppUserPermissionsTab from "./userPermissions";

export class ChatPermissions {
  public v: Array<{
    flags: ChatRights[],
    text: string,
    checkboxField?: CheckboxField
  }>;
  private toggleWith: Partial<{[chatRight in ChatRights]: ChatRights[]}>;

  constructor(options: {
    chatId: number,
    listenerSetter: ListenerSetter,
    appendTo: HTMLElement,
    participant?: ChannelParticipant.channelParticipantBanned
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

    const chat: Chat.chat = appChatsManager.getChat(options.chatId);
    const defaultBannedRights = chat.default_banned_rights;
    const rights = options.participant ? appChatsManager.combineParticipantBannedRights(options.chatId, options.participant.banned_rights) : defaultBannedRights;
    
    for(const info of this.v) {
      const mainFlag = info.flags[0];
      info.checkboxField = new CheckboxField({
        text: info.text,
        checked: appChatsManager.hasRights(options.chatId, mainFlag, rights),
        restriction: true,
        withRipple: true
      });

      // @ts-ignore
      if(options.participant && defaultBannedRights.pFlags[mainFlag]) {
        info.checkboxField.input.disabled = true;
        
        /* options.listenerSetter.add(info.checkboxField.input, 'change', (e) => {
          if(!e.isTrusted) {
            return;
          }

          cancelEvent(e);
          toast('This option is disabled for all members in Group Permissions.');
          info.checkboxField.checked = false;
        }); */

        attachClickEvent(info.checkboxField.label, (e) => {
          toast('This option is disabled for all members in Group Permissions.');
        }, {listenerSetter: options.listenerSetter});
      }

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

export default class AppGroupPermissionsTab extends SliderSuperTabEventable {
  public chatId: number;

  protected async init() {
    this.container.classList.add('edit-peer-container', 'group-permissions-container');
    this.title.innerHTML = 'Permissions';

    let chatPermissions: ChatPermissions;
    {
      const section = new SettingSection({
        name: 'What can members of this group do?',
      });

      chatPermissions = new ChatPermissions({
        chatId: this.chatId,
        listenerSetter: this.listenerSetter,
        appendTo: section.content,
      });

      this.eventListener.addEventListener('destroy', () => {
        appChatsManager.editChatDefaultBannedRights(this.chatId, chatPermissions.takeOut());
      });

      this.scrollable.append(section.container);
    }
    
    {
      const section = new SettingSection({
        name: 'Exceptions'
      });

      const addExceptionRow = new Row({
        title: 'Add Exception',
        subtitle: 'Loading...',
        icon: 'adduser',
        clickable: () => {
          new PopupPickUser({
            peerTypes: ['channelParticipants'],
            onSelect: (peerId) => {
              setTimeout(() => {
                openPermissions(peerId);
              }, 0);
            },
            placeholder: 'Add Exception...',
            peerId: -this.chatId,
          });
        }
      });

      const openPermissions = async(peerId: number) => {
        let participant: AppUserPermissionsTab['participant'];
        try {
          participant = await appProfileManager.getChannelParticipant(this.chatId, peerId) as any;
        } catch(err) {
          toast('User is no longer participant');
          return;
        }

        const tab = new AppUserPermissionsTab(this.slider);
        tab.participant = participant;
        tab.chatId = this.chatId;
        tab.userId = peerId;
        tab.open();
      };

      const removedUsersRow = new Row({
        title: 'Removed Users',
        subtitle: 'No removed users',
        icon: 'deleteuser',
        clickable: true
      });

      section.content.append(addExceptionRow.container, removedUsersRow.container);

      const c = section.generateContentElement();
      c.classList.add('chatlist-container');
      
      const list = appDialogsManager.createChatList();
      c.append(list);

      attachClickEvent(list, (e) => {
        const target = findUpTag(e.target, 'LI');
        if(!target) return;

        const peerId = +target.dataset.peerId;
        openPermissions(peerId);
      }, {listenerSetter: this.listenerSetter});

      const setSubtitle = (li: Element, participant: ChannelParticipant.channelParticipantBanned) => {
        const bannedRights = participant.banned_rights;//appChatsManager.combineParticipantBannedRights(this.chatId, participant.banned_rights);
        const defaultBannedRights = (appChatsManager.getChat(this.chatId) as Chat.channel).default_banned_rights;
        const combinedRights = appChatsManager.combineParticipantBannedRights(this.chatId, bannedRights);

        const cantWhat: string[] = [], canWhat: string[] = [];
        chatPermissions.v.forEach(info => {
          const mainFlag = info.flags[0];
          // @ts-ignore
          if(bannedRights.pFlags[mainFlag] && !defaultBannedRights.pFlags[mainFlag]) {
            cantWhat.push(info.text);
          // @ts-ignore
          } else if(!combinedRights.pFlags[mainFlag]) {
            canWhat.push(info.text);
          }
        });

        const el = li.querySelector('.user-last-message');
        let str: string;
        if(cantWhat.length) {
          str = 'Can\'t ' + cantWhat.join(cantWhat.length === 2 ? ' and ' : ', ');
        } else if(canWhat.length) {
          str = 'Can ' + canWhat.join(canWhat.length === 2 ? ' and ' : ', ');
        }
  
        //const user = appUsersManager.getUser(participant.user_id);
        if(str) {
          el.innerHTML = str;
        }

        el.classList.toggle('hide', !str);
      };

      const add = (participant: ChannelParticipant.channelParticipantBanned, append: boolean) => {
        const {dom} = appDialogsManager.addDialogNew({
          dialog: participant.user_id,
          container: list,
          drawStatus: false,
          rippleEnabled: true,
          avatarSize: 48,
          append
        });

        setSubtitle(dom.listEl, participant);

        //dom.titleSpan.innerHTML = 'Chinaza Akachi';
        //dom.lastMessageSpan.innerHTML = 'Can Add Users and Pin Messages';
      };

      this.listenerSetter.add(rootScope, 'apiUpdate', (update: Update) => {
        if(update._ === 'updateChannelParticipant') {
          const needAdd = update.new_participant?._ === 'channelParticipantBanned' && !update.new_participant.banned_rights.pFlags.view_messages;
          const li = list.querySelector(`[data-peer-id="${update.user_id}"]`);
          if(needAdd) {
            if(!li) {
              add(update.new_participant as ChannelParticipant.channelParticipantBanned, false);
            } else {
              setSubtitle(li, update.new_participant as ChannelParticipant.channelParticipantBanned);
            }

            if(update.prev_participant?._ !== 'channelParticipantBanned') {
              ++exceptionsCount;
            }
          } else {
            if(li) {
              li.remove();
            }

            if(update.prev_participant?._ === 'channelParticipantBanned') {
              --exceptionsCount;
            }
          }

          setLength();
        }
      });

      const setLength = () => {
        addExceptionRow.subtitle.innerHTML = exceptionsCount ? exceptionsCount + ' exceptions' : 'None';
      };

      let exceptionsCount = 0;
      const LOAD_COUNT = 50;
      const loader = new ScrollableLoader({
        scrollable: this.scrollable,
        getPromise: () => {
          return appProfileManager.getChannelParticipants(this.chatId, {_: 'channelParticipantsBanned', q: ''}, LOAD_COUNT, list.childElementCount).then(res => {
            for(const participant of res.participants) {
              add(participant as ChannelParticipant.channelParticipantBanned, true);
            }

            exceptionsCount = res.count;
            setLength();

            return res.participants.length < LOAD_COUNT || res.count === list.childElementCount;
          });
        }
      });

      this.scrollable.append(section.container);

      await loader.load();
    }
  }

  onOpenAfterTimeout() {
    this.scrollable.onScroll();
  }
}
