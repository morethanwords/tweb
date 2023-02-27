/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import type {ChatRights} from '../../../lib/appManagers/appChatsManager';
import flatten from '../../../helpers/array/flatten';
import cancelEvent from '../../../helpers/dom/cancelEvent';
import {attachClickEvent} from '../../../helpers/dom/clickEvent';
import findUpTag from '../../../helpers/dom/findUpTag';
import replaceContent from '../../../helpers/dom/replaceContent';
import ListenerSetter from '../../../helpers/listenerSetter';
import ScrollableLoader from '../../../helpers/scrollableLoader';
import {ChannelParticipant, Chat, ChatBannedRights} from '../../../layer';
import appDialogsManager, {DialogDom, DIALOG_LIST_ELEMENT_TAG} from '../../../lib/appManagers/appDialogsManager';
import {AppManagers} from '../../../lib/appManagers/managers';
import combineParticipantBannedRights from '../../../lib/appManagers/utils/chats/combineParticipantBannedRights';
import hasRights from '../../../lib/appManagers/utils/chats/hasRights';
import getPeerActiveUsernames from '../../../lib/appManagers/utils/peers/getPeerActiveUsernames';
import getPeerId from '../../../lib/appManagers/utils/peers/getPeerId';
import I18n, {i18n, join, LangPackKey} from '../../../lib/langPack';
import rootScope from '../../../lib/rootScope';
import CheckboxField from '../../checkboxField';
import PopupPickUser from '../../popups/pickUser';
import Row from '../../row';
import SettingSection from '../../settingSection';
import {SliderSuperTabEventable} from '../../sliderTab';
import {toast} from '../../toast';
import AppUserPermissionsTab from './userPermissions';
import findUpAsChild from '../../../helpers/dom/findUpAsChild';

type T = {
  flags: ChatRights[],
  text: LangPackKey,
  exceptionText: LangPackKey,
  checkboxField?: CheckboxField,
  nested?: T[],
  nestedTo?: T,
  nestedCounter?: HTMLElement,
  setNestedCounter?: (count: number) => void,
  toggleWith?: {checked?: ChatRights[], unchecked?: ChatRights[]}
};

export class ChatPermissions {
  public v: Array<T>;

  protected chat: Chat.chat | Chat.channel;
  protected rights: ChatBannedRights.chatBannedRights;
  protected defaultBannedRights: ChatBannedRights.chatBannedRights;
  protected restrictionText: LangPackKey;

  constructor(private options: {
    chatId: ChatId,
    listenerSetter: ListenerSetter,
    appendTo: HTMLElement,
    participant?: ChannelParticipant.channelParticipantBanned
  }, private managers: AppManagers) {
    this.construct();
  }

  public async construct() {
    const mediaNested: T[] = [
      {flags: ['send_photos'], text: 'UserRestrictionsSendPhotos', exceptionText: 'UserRestrictionsNoSendPhotos'},
      {flags: ['send_videos'], text: 'UserRestrictionsSendVideos', exceptionText: 'UserRestrictionsNoSendVideos'},
      {flags: ['send_stickers', 'send_gifs'], text: 'UserRestrictionsSendStickers', exceptionText: 'UserRestrictionsNoSendStickers'},
      {flags: ['send_audios'], text: 'UserRestrictionsSendMusic', exceptionText: 'UserRestrictionsNoSendMusic'},
      {flags: ['send_docs'], text: 'UserRestrictionsSendFiles', exceptionText: 'UserRestrictionsNoSendDocs'},
      {flags: ['send_voices'], text: 'UserRestrictionsSendVoices', exceptionText: 'UserRestrictionsNoSendVoice'},
      {flags: ['send_roundvideos'], text: 'UserRestrictionsSendRound', exceptionText: 'UserRestrictionsNoSendRound'},
      {flags: ['embed_links'], text: 'UserRestrictionsEmbedLinks', exceptionText: 'UserRestrictionsNoEmbedLinks', toggleWith: {checked: ['send_plain']}},
      {flags: ['send_polls'], text: 'UserRestrictionsSendPolls', exceptionText: 'UserRestrictionsNoSendPolls'}
    ];

    const mediaToggleWith = flatten(mediaNested.map(({flags}) => flags));
    const media: T = {flags: ['send_media'], text: 'UserRestrictionsSendMedia', exceptionText: 'UserRestrictionsNoSendMedia', nested: mediaNested, toggleWith: {unchecked: mediaToggleWith, checked: mediaToggleWith}};

    this.v = [
      {flags: ['send_plain'], text: 'UserRestrictionsSend', exceptionText: 'UserRestrictionsNoSend', toggleWith: {unchecked: ['embed_links']}},
      media,
      {flags: ['invite_users'], text: 'UserRestrictionsInviteUsers', exceptionText: 'UserRestrictionsNoInviteUsers'},
      {flags: ['pin_messages'], text: 'UserRestrictionsPinMessages', exceptionText: 'UserRestrictionsNoPinMessages'},
      {flags: ['change_info'], text: 'UserRestrictionsChangeInfo', exceptionText: 'UserRestrictionsNoChangeInfo'}
    ];

    mediaNested.forEach((info) => info.nestedTo = media);

    const options = this.options;
    const chat = this.chat = await this.managers.appChatsManager.getChat(options.chatId) as Chat.chat | Chat.channel;
    const defaultBannedRights = this.defaultBannedRights = chat.default_banned_rights;
    const rights = this.rights = options.participant ? combineParticipantBannedRights(chat as Chat.channel, options.participant.banned_rights) : defaultBannedRights;

    for(const info of this.v) {
      const {nodes} = this.createRow(info);
      options.appendTo.append(...nodes);
    }

    this.v.push(...mediaNested);
  }

  protected createRow(info: T, isNested?: boolean) {
    const {defaultBannedRights, chat, rights, restrictionText} = this;

    const mainFlag = info.flags[0];
    const row = new Row({
      titleLangKey: isNested ? undefined : info.text,
      checkboxField: info.checkboxField = new CheckboxField({
        text: isNested ? info.text : undefined,
        checked: info.nested ? false : hasRights(chat, mainFlag, rights),
        toggle: !isNested,
        listenerSetter: this.options.listenerSetter,
        restriction: !isNested
      }),
      listenerSetter: this.options.listenerSetter,
      clickable: info.nested ? (e) => {
        if(findUpAsChild(e.target as HTMLElement, row.checkboxField.label)) {
          return;
        }

        cancelEvent(e);
        row.container.classList.toggle('accordion-toggler-expanded');
        accordion.classList.toggle('is-expanded');
      } : undefined
    });

    if((
      this.options.participant &&
        defaultBannedRights.pFlags[mainFlag as keyof typeof defaultBannedRights['pFlags']]
    ) || (
      getPeerActiveUsernames(chat as Chat.channel)[0] &&
        (
          info.flags.includes('pin_messages') ||
          info.flags.includes('change_info')
        )
    )
    ) {
      info.checkboxField.input.disabled = true;

      attachClickEvent(info.checkboxField.label, (e) => {
        toast(I18n.format(restrictionText, true));
      }, {listenerSetter: this.options.listenerSetter});
    }

    if(info.toggleWith || info.nestedTo) {
      const processToggleWith = info.toggleWith ? (info: T) => {
        const {toggleWith, nested} = info;
        const value = info.checkboxField.checked;
        const arr = value ? toggleWith.checked : toggleWith.unchecked;
        if(!arr) {
          return;
        }

        const other = this.v.filter((i) => arr.includes(i.flags[0]));
        other.forEach((info) => {
          info.checkboxField.setValueSilently(value);
          if(info.nestedTo && !nested) {
            this.setNestedCounter(info.nestedTo);
          }

          if(info.toggleWith) {
            processToggleWith(info);
          }
        });

        if(info.nested) {
          this.setNestedCounter(info);
        }
      } : undefined;

      const processNestedTo = info.nestedTo ? () => {
        const length = this.getNestedCheckedLength(info.nestedTo);
        info.nestedTo.checkboxField.setValueSilently(length === info.nestedTo.nested.length);
        this.setNestedCounter(info.nestedTo, length);
      } : undefined;

      this.options.listenerSetter.add(info.checkboxField.input)('change', () => {
        processToggleWith?.(info);
        processNestedTo?.();
      });
    }

    const nodes: HTMLElement[] = [row.container];
    let accordion: HTMLElement, nestedCounter: HTMLElement;
    if(info.nested) {
      const container = accordion = document.createElement('div');
      container.classList.add('accordion');
      container.style.setProperty('--max-height', info.nested.length * 48 + 'px');
      info.nested.forEach((info) => {
        container.append(...this.createRow(info, true).nodes);
      });
      nodes.push(container);

      const span = document.createElement('span');
      span.classList.add('tgico-down', 'accordion-icon');

      nestedCounter = info.nestedCounter = document.createElement('b');
      this.setNestedCounter(info);
      row.title.append(' ', nestedCounter, ' ', span);

      row.container.classList.add('accordion-toggler');
      row.titleRow.classList.add('with-delimiter');

      row.checkboxField.setValueSilently(this.getNestedCheckedLength(info) === info.nested.length);
    }

    return {row, nodes};
  }

  protected getNestedCheckedLength(info: T) {
    return info.nested.reduce((acc, v) => acc + +v.checkboxField.checked, 0);
  }

  protected setNestedCounter(info: T, count = this.getNestedCheckedLength(info)) {
    info.nestedCounter.textContent = `${count}/${info.nested.length}`;
  }

  public takeOut() {
    const rights: ChatBannedRights = {
      _: 'chatBannedRights',
      until_date: 0x7FFFFFFF,
      pFlags: {}
    };

    const IGNORE_FLAGS: Set<ChatRights> = new Set([
      'send_media'
    ]);
    for(const info of this.v) {
      const banned = !info.checkboxField.checked;
      if(!banned) {
        continue;
      }

      info.flags.forEach((flag) => {
        if(IGNORE_FLAGS.has(flag)) {
          return;
        }

        // @ts-ignore
        rights.pFlags[flag] = true;
      });
    }

    return rights;
  }
}

export default class AppGroupPermissionsTab extends SliderSuperTabEventable {
  public chatId: ChatId;

  public async init() {
    this.container.classList.add('edit-peer-container', 'group-permissions-container');
    this.setTitle('ChannelPermissions');

    let chatPermissions: ChatPermissions;
    {
      const section = new SettingSection({
        name: 'ChannelPermissionsHeader'
      });

      chatPermissions = new ChatPermissions({
        chatId: this.chatId,
        listenerSetter: this.listenerSetter,
        appendTo: section.content
      }, this.managers);

      this.eventListener.addEventListener('destroy', () => {
        this.managers.appChatsManager.editChatDefaultBannedRights(this.chatId, chatPermissions.takeOut());
      }, {once: true});

      this.scrollable.append(section.container);
    }

    {
      const section = new SettingSection({
        name: 'PrivacyExceptions'
      });

      const addExceptionRow = new Row({
        titleLangKey: 'ChannelAddException',
        subtitleLangKey: 'Loading',
        icon: 'adduser',
        clickable: () => {
          new PopupPickUser({
            peerTypes: ['channelParticipants'],
            onSelect: (peerId) => {
              setTimeout(() => {
                openPermissions(peerId);
              }, 0);
            },
            placeholder: 'ExceptionModal.Search.Placeholder',
            peerId: -this.chatId
          });
        },
        listenerSetter: this.listenerSetter
      });

      const openPermissions = async(peerId: PeerId) => {
        let participant: AppUserPermissionsTab['participant'];
        try {
          participant = await this.managers.appProfileManager.getParticipant(this.chatId, peerId);
        } catch(err) {
          toast('User is no longer participant');
          return;
        }

        const tab = this.slider.createTab(AppUserPermissionsTab);
        tab.participant = participant;
        tab.chatId = this.chatId;
        tab.userId = peerId;
        tab.open();
      };

      section.content.append(addExceptionRow.container);

      /* const removedUsersRow = new Row({
        titleLangKey: 'ChannelBlockedUsers',
        subtitleLangKey: 'NoBlockedUsers',
        icon: 'deleteuser',
        clickable: true
      });

      section.content.append(removedUsersRow.container); */

      const c = section.generateContentElement();
      c.classList.add('chatlist-container');

      const list = appDialogsManager.createChatList({new: true});
      c.append(list);

      attachClickEvent(list, (e) => {
        const target = findUpTag(e.target, DIALOG_LIST_ELEMENT_TAG);
        if(!target) return;

        const peerId = target.dataset.peerId.toPeerId();
        openPermissions(peerId);
      }, {listenerSetter: this.listenerSetter});

      const setSubtitle = async(dom: DialogDom, participant: ChannelParticipant.channelParticipantBanned) => {
        const bannedRights = participant.banned_rights;// appChatsManager.combineParticipantBannedRights(this.chatId, participant.banned_rights);
        const defaultBannedRights = ((await this.managers.appChatsManager.getChat(this.chatId)) as Chat.channel).default_banned_rights;
        // const combinedRights = appChatsManager.combineParticipantBannedRights(this.chatId, bannedRights);

        const cantWhat: LangPackKey[] = []/* , canWhat: LangPackKey[] = [] */;
        chatPermissions.v.forEach((info) => {
          const mainFlag = info.flags[0];
          // @ts-ignore
          if(bannedRights.pFlags[mainFlag] && !defaultBannedRights.pFlags[mainFlag]) {
            cantWhat.push(info.exceptionText);
          // @ts-ignore
          }/*  else if(!combinedRights.pFlags[mainFlag]) {
            canWhat.push(info.exceptionText);
          } */
        });

        const el = dom.lastMessageSpan as HTMLElement;

        if(cantWhat.length) {
          el.replaceChildren(...join(cantWhat.map((t) => i18n(t)), false));
        }/*  else if(canWhat.length) {
          str = 'Can ' + canWhat.join(canWhat.length === 2 ? ' and ' : ', ');
        } */

        el.classList.toggle('hide', !cantWhat.length);
      };

      const add = (participant: ChannelParticipant.channelParticipantBanned, append: boolean) => {
        const {dom} = appDialogsManager.addDialogNew({
          peerId: getPeerId(participant.peer),
          container: list,
          rippleEnabled: true,
          avatarSize: 'abitbigger',
          append
        });

        (dom.listEl as any).dialogDom = dom;

        setSubtitle(dom, participant);
      };

      this.listenerSetter.add(rootScope)('chat_participant', (update) => {
        const needAdd = update.new_participant?._ === 'channelParticipantBanned' &&
          !update.new_participant.banned_rights.pFlags.view_messages;
        const li = list.querySelector(`[data-peer-id="${update.user_id}"]`);
        if(needAdd) {
          if(!li) {
            add(update.new_participant as ChannelParticipant.channelParticipantBanned, false);
          } else {
            setSubtitle((li as any).dialogDom, update.new_participant as ChannelParticipant.channelParticipantBanned);
          }

          if(update.prev_participant?._ !== 'channelParticipantBanned') {
            ++exceptionsCount;
          }
        } else {
          li?.remove();

          if(update.prev_participant?._ === 'channelParticipantBanned') {
            --exceptionsCount;
          }
        }

        setLength();
      });

      const setLength = () => {
        replaceContent(addExceptionRow.subtitle, i18n(exceptionsCount ? 'Permissions.ExceptionsCount' : 'Permissions.NoExceptions', [exceptionsCount]));
      };

      let exceptionsCount = 0;
      let loader: ScrollableLoader;
      const setLoader = () => {
        const LOAD_COUNT = 50;
        loader = new ScrollableLoader({
          scrollable: this.scrollable,
          getPromise: () => {
            return this.managers.appProfileManager.getChannelParticipants(this.chatId, {_: 'channelParticipantsBanned', q: ''}, LOAD_COUNT, list.childElementCount).then((res) => {
              for(const participant of res.participants) {
                add(participant as ChannelParticipant.channelParticipantBanned, true);
              }

              exceptionsCount = res.count;
              setLength();

              return res.participants.length < LOAD_COUNT || res.count === list.childElementCount;
            });
          }
        });

        return loader.load();
      };

      this.scrollable.append(section.container);

      if(await this.managers.appChatsManager.isChannel(this.chatId)) {
        await setLoader();
      } else {
        setLength();

        this.listenerSetter.add(rootScope)('dialog_migrate', ({migrateFrom, migrateTo}) => {
          if(this.chatId === migrateFrom) {
            this.chatId = migrateTo;
            setLoader();
          }
        });
      }
    }
  }

  onOpenAfterTimeout() {
    this.scrollable.onScroll();
  }
}
