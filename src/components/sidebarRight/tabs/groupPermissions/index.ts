/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import type {ChatRights} from '../../../../lib/appManagers/appChatsManager';
import {attachClickEvent} from '../../../../helpers/dom/clickEvent';
import findUpTag from '../../../../helpers/dom/findUpTag';
import replaceContent from '../../../../helpers/dom/replaceContent';
import ListenerSetter from '../../../../helpers/listenerSetter';
import ScrollableLoader from '../../../../helpers/scrollableLoader';
import {ChannelParticipant, Chat, ChatAdminRights, ChatBannedRights} from '../../../../layer';
import appDialogsManager, {DialogDom, DIALOG_LIST_ELEMENT_TAG} from '../../../../lib/appManagers/appDialogsManager';
import {AppManagers} from '../../../../lib/appManagers/managers';
import combineParticipantBannedRights from '../../../../lib/appManagers/utils/chats/combineParticipantBannedRights';
import hasRights from '../../../../lib/appManagers/utils/chats/hasRights';
import getPeerActiveUsernames from '../../../../lib/appManagers/utils/peers/getPeerActiveUsernames';
import getPeerId from '../../../../lib/appManagers/utils/peers/getPeerId';
import {i18n, join, LangPackKey} from '../../../../lib/langPack';
import rootScope from '../../../../lib/rootScope';
import PopupPickUser from '../../../popups/pickUser';
import Row from '../../../row';
import SettingSection from '../../../settingSection';
import {SliderSuperTabEventable} from '../../../sliderTab';
import {toast} from '../../../toast';
import AppUserPermissionsTab from '../userPermissions';
import CheckboxFields, {CheckboxFieldsField} from '../../../checkboxFields';
import PopupElement from '../../../popups';
import wrapPeerTitle from '../../../wrappers/peerTitle';
import apiManagerProxy from '../../../../lib/mtproto/mtprotoworker';
import RangeStepsSelector from '../../../rangeStepsSelector';
import formatDuration from '../../../../helpers/formatDuration';
import {wrapFormattedDuration} from '../../../wrappers/wrapDuration';
import SolidJSHotReloadGuardProvider from '../../../../lib/solidjs/hotReloadGuardProvider';
import {createEffect, createRoot, createSignal} from 'solid-js';
import {createStore, unwrap} from 'solid-js/store';
import deepEqual from '../../../../helpers/object/deepEqual';
import ButtonIcon from '../../../buttonIcon';
import throttle from '../../../../helpers/schedulers/throttle';
import {NoneToVoidFunction} from '../../../../types';
import {PopupPeerOptions} from '../../../popups/peer';
import confirmationPopup, {ConfirmationPopupRejectReason} from '../../../confirmationPopup';

type PermissionsCheckboxFieldsField = CheckboxFieldsField & {
  flags: ChatRights[],
  exceptionText: LangPackKey
};

type AdministratorRightsCheckboxFieldsField = CheckboxFieldsField & {
  flags: ChatRights[]
};

export class ChatPermissions extends CheckboxFields<PermissionsCheckboxFieldsField> {
  protected chat: Chat.chat | Chat.channel;
  protected rights: ChatBannedRights.chatBannedRights;
  protected defaultBannedRights: ChatBannedRights.chatBannedRights;

  constructor(private options: {
    chatId: ChatId,
    listenerSetter: ListenerSetter,
    appendTo: HTMLElement,
    participant?: ChannelParticipant.channelParticipantBanned,
    forChat?: boolean,
    onSomethingChanged?: () => void
  }, private managers: AppManagers) {
    super({
      listenerSetter: options.listenerSetter,
      fields: [],
      asRestrictions: true
    });

    this.construct();
  }

  public async construct() {
    const options = this.options;
    const peerId = options.chatId.toPeerId(true);
    const chat = this.chat = apiManagerProxy.getChat(options.chatId) as Chat.chat | Chat.channel;
    const isForum = apiManagerProxy.isForum(peerId);
    const defaultBannedRights = this.defaultBannedRights = chat.default_banned_rights;
    const rights = this.rights = options.participant ? combineParticipantBannedRights(chat as Chat.channel, options.participant.banned_rights) : defaultBannedRights;

    const mediaNested: PermissionsCheckboxFieldsField[] = [
      {flags: ['send_photos'], text: 'UserRestrictionsSendPhotos', exceptionText: 'UserRestrictionsNoSendPhotos'},
      {flags: ['send_videos'], text: 'UserRestrictionsSendVideos', exceptionText: 'UserRestrictionsNoSendVideos'},
      {flags: ['send_stickers', 'send_gifs'], text: 'UserRestrictionsSendStickers', exceptionText: 'UserRestrictionsNoSendStickers'},
      {flags: ['send_audios'], text: 'UserRestrictionsSendMusic', exceptionText: 'UserRestrictionsNoSendMusic'},
      {flags: ['send_docs'], text: 'UserRestrictionsSendFiles', exceptionText: 'UserRestrictionsNoSendDocs'},
      {flags: ['send_voices'], text: 'UserRestrictionsSendVoices', exceptionText: 'UserRestrictionsNoSendVoice'},
      {flags: ['send_roundvideos'], text: 'UserRestrictionsSendRound', exceptionText: 'UserRestrictionsNoSendRound'},
      {flags: ['embed_links'], text: 'UserRestrictionsEmbedLinks', exceptionText: 'UserRestrictionsNoEmbedLinks'},
      {flags: ['send_polls'], text: 'UserRestrictionsSendPolls', exceptionText: 'UserRestrictionsNoSendPolls'}
    ];

    let v: PermissionsCheckboxFieldsField[] = [
      {flags: ['send_plain'], text: 'UserRestrictionsSend', exceptionText: 'UserRestrictionsNoSend'},
      {flags: ['send_media'], text: 'UserRestrictionsSendMedia', exceptionText: 'UserRestrictionsNoSendMedia', nested: mediaNested},
      {flags: ['invite_users'], text: 'UserRestrictionsInviteUsers', exceptionText: 'UserRestrictionsNoInviteUsers'},
      {flags: ['pin_messages'], text: 'UserRestrictionsPinMessages', exceptionText: 'UserRestrictionsNoPinMessages'},
      isForum && {flags: ['manage_topics'], text: 'CreateTopicsPermission', exceptionText: 'UserRestrictionsNoChangeInfo'},
      {flags: ['change_info'], text: 'UserRestrictionsChangeInfo', exceptionText: 'UserRestrictionsNoChangeInfo'}
    ];
    v = v.filter(Boolean);


    const map: {[action in ChatRights]?: PermissionsCheckboxFieldsField} = {};
    v.push(...mediaNested);
    v.forEach((info) => {
      const mainFlag = info.flags[0];
      map[mainFlag] = info;
      info.checked = hasRights(chat, mainFlag, rights);
    });

    mediaNested.forEach((info) => info.nestedTo = map.send_media);
    map.send_media.toggleWith = {unchecked: mediaNested, checked: mediaNested};
    map.embed_links.toggleWith = {checked: [map.send_plain]};
    map.send_plain.toggleWith = {unchecked: [map.embed_links]};

    this.fields = v;

    for(const info of this.fields) {
      if(!options.forChat && defaultBannedRights.pFlags[info.flags[0] as keyof typeof defaultBannedRights['pFlags']]) {
        info.restrictionText = 'UserRestrictionsDisabled';
      } else if(getPeerActiveUsernames(chat as Chat.channel)[0] && (info.flags.includes('pin_messages') || info.flags.includes('change_info'))) {
        info.restrictionText = options.participant ? 'UserRestrictionsDisabled' : 'EditCantEditPermissionsPublic';
      }
    }

    for(const info of this.fields) {
      if(info.nestedTo) {
        continue;
      }

      const {nodes} = this.createField(info);
      options.appendTo.append(...nodes);
    }

    this.fields.forEach(field => {
      field.checkboxField.listenerSetter.add(field.checkboxField.input)('change', () => {
        this.options?.onSomethingChanged?.();
      });
    });
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
    for(const info of this.fields) {
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

export class ChatAdministratorRights extends CheckboxFields<AdministratorRightsCheckboxFieldsField> {
  protected rights: ChatAdminRights;
  protected defaultBannedRights: ChatAdminRights;
  protected restrictionText: LangPackKey;

  constructor(private options: {
    chatId: ChatId,
    listenerSetter: ListenerSetter,
    appendTo: HTMLElement,
    participant?: ChannelParticipant.channelParticipantAdmin | ChannelParticipant.channelParticipantCreator,
    chat: Chat,
    canEdit?: boolean
  }) {
    super({
      listenerSetter: options.listenerSetter,
      fields: [],
      asRestrictions: true
    });

    this.construct();
  }

  public construct() {
    const options = this.options;
    const chat = options.chat as Chat.chat | Chat.channel;
    const isBroadcast = !!(chat as Chat.channel).pFlags.broadcast;
    const isForum = !!(chat as Chat.channel).pFlags.forum;
    const rights = this.rights = options.participant ? options.participant.admin_rights : undefined;

    const manageMessagesNested: AdministratorRightsCheckboxFieldsField[] = isBroadcast && [
      {flags: ['post_messages'], text: 'EditAdminPostMessages'},
      {flags: ['edit_messages'], text: 'EditAdminEditMessages'},
      {flags: ['delete_messages'], text: 'EditAdminDeleteMessages'}
    ];

    const manageStoriesNested: AdministratorRightsCheckboxFieldsField[] = isBroadcast && [
      {flags: ['post_stories'], text: 'AdminRights.PostStories'},
      {flags: ['edit_stories'], text: 'AdminRights.EditStories'},
      {flags: ['delete_stories'], text: 'AdminRights.DeleteStories'}
    ];

    const manageMessagesNestedKey: ChatRights = 'post_messages_nested' as any;
    const manageStoriesNestedKey: ChatRights = 'post_stories_nested' as any;
    let v: AdministratorRightsCheckboxFieldsField[] = [
      {flags: ['change_info'], text: isBroadcast ? 'EditAdminChangeChannelInfo' : 'EditAdminChangeGroupInfo'},
      isBroadcast && {flags: [manageMessagesNestedKey], text: 'AdminRights.ManageMessages', nested: manageMessagesNested},
      isBroadcast && {flags: [manageStoriesNestedKey], text: 'AdminRights.ManageStories', nested: manageStoriesNested},
      !isBroadcast && {flags: ['delete_messages'], text: isBroadcast ? 'EditAdminDeleteMessages' : 'EditAdminGroupDeleteMessages'},
      !isBroadcast && {flags: ['ban_users'], text: 'EditAdminBanUsers'},
      !isBroadcast && {flags: ['invite_users'], text: 'EditAdminAddUsersViaLink'},
      !isBroadcast && {flags: ['pin_messages'], text: 'EditAdminPinMessages'},
      isForum && {flags: ['manage_topics'], text: 'ManageTopicsPermission'},
      {flags: ['manage_call'], text: isBroadcast ? 'StartVoipChatPermission' : 'Channel.EditAdmin.ManageCalls'},
      isBroadcast && {flags: ['invite_users'], text: 'Channel.EditAdmin.PermissionInviteSubscribers'},
      !isBroadcast && {flags: ['anonymous'], text: 'EditAdminSendAnonymously', checked: rights ? undefined : false},
      {flags: ['add_admins'], text: 'EditAdminAddAdmins', checked: rights ? undefined : false}
    ];

    const map: {[action in ChatRights]?: AdministratorRightsCheckboxFieldsField} = {};
    v = v.filter(Boolean);
    if(manageMessagesNested) v.push(...manageMessagesNested);
    if(manageStoriesNested) v.push(...manageStoriesNested);
    v.forEach((info) => {
      const mainFlag = info.flags[0];
      map[mainFlag] = info;
      info.checked ??= hasRights(chat, mainFlag, rights);
    });

    if(manageMessagesNested) {
      manageMessagesNested.forEach((info) => info.nestedTo = map[manageMessagesNestedKey]);
      map[manageMessagesNestedKey].toggleWith = {unchecked: manageMessagesNested, checked: manageMessagesNested};
    }

    if(manageStoriesNested) {
      manageStoriesNested.forEach((info) => info.nestedTo = map[manageStoriesNestedKey]);
      map[manageStoriesNestedKey].toggleWith = {unchecked: manageStoriesNested, checked: manageStoriesNested};
    }

    this.fields = v;

    const CREATOR_EXCEPTIONS: Set<ChatRights> = new Set([
      'anonymous'
    ]);

    const isCreator = options.participant?._ === 'channelParticipantCreator';
    for(const info of this.fields) {
      const mainFlag = info.flags[0];
      if(!options.canEdit) {
        info.restrictionText = 'EditAdminCantEdit';
      } else if((isCreator && !CREATOR_EXCEPTIONS.has(mainFlag as ChatRights)) || !hasRights(chat, mainFlag)) {
        info.restrictionText = 'EditCantEditPermissions';
      }
    }

    for(const info of this.fields) {
      if(info.nestedTo) {
        continue;
      }

      const {nodes} = this.createField(info);
      options.appendTo.append(...nodes);
    }
  }

  public takeOut() {
    const rights: ChatAdminRights = {
      _: 'chatAdminRights',
      pFlags: {}
    };

    for(const info of this.fields) {
      if(!info.checkboxField.checked) {
        continue;
      }

      info.flags.forEach((flag) => {
        // @ts-ignore
        rights.pFlags[flag] = true;
      });
    }

    return rights;
  }
}

export default class AppGroupPermissionsTab extends SliderSuperTabEventable {
  public chatId: ChatId;
  private participants: Map<PeerId, ChannelParticipant.channelParticipantBanned>;

  private saveCallbacks: Array<NoneToVoidFunction> = [];

  private solidState = createRoot(dispose => {
    this.middlewareHelper.get().onDestroy(() => void dispose());

    type StateStore = {
      rights?: ChatBannedRights.chatBannedRights;
      stars?: number;
      slowModeSeconds?: number;
    };

    const initialState: StateStore = {};

    const [store, set] = createStore<StateStore>({});
    const [saveIcon, setSaveIcon] = createSignal<HTMLElement>();

    const [hasChanges, setHasChanges] = createSignal(false);
    const throttledSetHasChanges = throttle(setHasChanges, 200, true);

    createEffect(() => {
      throttledSetHasChanges(!deepEqual(store, initialState));
    });

    createEffect(() => {
      if(!saveIcon()) return;

      saveIcon().classList.toggle('appear-zoom--active', hasChanges());
    });

    // createEffect(() => {
    //   ({...store});
    //   console.log('{...store} :>> ', {...unwrap(store)});
    // });

    return {
      setInitial: (state: Partial<StateStore>) => {
        Object.assign(initialState, state);
        set(state);
      },

      store,
      set,
      saveIcon,
      setSaveIcon,

      hasChanges
    };
  });

  public async init() {
    this.container.classList.add('edit-peer-container', 'group-permissions-container');
    this.setTitle('ChannelPermissions');

    this.header.append(this.solidState.setSaveIcon(ButtonIcon('check primary appear-zoom')));

    this.solidState.saveIcon().addEventListener('click', () => {
      this.saveChanges();
      this.close();
    });

    this.participants = new Map();

    let chatPermissions: ChatPermissions;
    {
      const section = new SettingSection({
        name: 'ChannelPermissionsHeader'
      });

      chatPermissions = new ChatPermissions({
        chatId: this.chatId,
        listenerSetter: this.listenerSetter,
        appendTo: section.content,
        forChat: true,
        onSomethingChanged: () => {
          this.solidState.set({rights: chatPermissions.takeOut()})
        }
      }, this.managers);

      this.solidState.setInitial({rights: chatPermissions.takeOut()})

      this.saveCallbacks.push(() => {
        this.managers.appChatsManager.editChatDefaultBannedRights(this.chatId, chatPermissions.takeOut());
      });

      this.scrollable.append(section.container);
    }

    const chat = apiManagerProxy.getChat(this.chatId);
    if(chat._ === 'channel') {
      const {default: createChargeForMessasgesSection} = await import('./chargeForMessasgesSection');

      const initialStars = +chat?.send_paid_messages_stars || 0;
      this.solidState.setInitial({stars: initialStars});

      const {element, dispose, promise} = createChargeForMessasgesSection(
        {
          initialStars,
          onStarsChange: (stars) => void this.solidState.set({stars})
        },
        SolidJSHotReloadGuardProvider
      );

      await promise;

      this.scrollable.append(element);

      this.middlewareHelper.get().onDestroy(() => void dispose());

      this.saveCallbacks.push(() => {
        const {stars} = this.solidState.store;

        if(initialStars === stars) return;
        this.managers.appChatsManager.updateChannelPaidMessagesPrice(chat.id.toChatId(), stars);
      });
    }

    {
      const section = new SettingSection({
        name: 'Slowmode',
        caption: true
      });

      const chatFull = await this.managers.appProfileManager.getChannelFull(this.chatId);

      let lastValue: number;
      const range: RangeStepsSelector<number> = new RangeStepsSelector({
        generateStep: (value) => {
          let t: HTMLElement;
          if(!value) {
            t = i18n('SlowmodeOff');
          } else {
            const hours = Math.floor(value / 3600);
            const minutes = Math.floor(value / 60) % 60;
            const seconds = value % 60;
            if(hours) {
              t = i18n('SlowmodeHours', [hours]);
            } else if(minutes) {
              t = i18n('SlowmodeMinutes', [minutes]);
            } else {
              t = i18n('SlowmodeSeconds', [seconds]);
            }
          }

          return [t, value];
        },
        onValue: (value) => {
          if(lastValue === value) {
            return;
          }

          this.solidState.set({slowModeSeconds: value});

          lastValue = value;
          if(value) {
            section.caption.replaceChildren(i18n('SlowmodeInfoSelected', [wrapFormattedDuration(formatDuration(value, 1))]));
          } else {
            section.caption.replaceChildren(i18n('SlowmodeInfoOff'));
          }
        },
        middleware: this.middlewareHelper.get()
      });

      const values = [0, 10, 30, 60, 300, 900, 3600];
      const steps = range.generateSteps(values);
      const initialValue = chatFull.slowmode_seconds || 0;

      this.solidState.setInitial({slowModeSeconds: initialValue});
      range.setSteps(steps, values.indexOf(initialValue));


      section.content.append(range.container);

      this.saveCallbacks.push(() => {
        const {value} = range;
        if(value !== initialValue) {
          this.managers.appChatsManager.toggleSlowMode(this.chatId, range.value);
        }
      });

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
          PopupElement.createPopup(PopupPickUser, {
            peerType: ['channelParticipants'],
            onSelect: (peerId) => {
              setTimeout(() => {
                openPermissions(peerId);
              }, 0);
            },
            placeholder: 'ExceptionModal.Search.Placeholder',
            peerId: -this.chatId,
            exceptSelf: true
          });
        },
        listenerSetter: this.listenerSetter
      });

      const openPermissions = async(peerId: PeerId) => {
        let participant = this.participants.get(peerId);
        if(!participant) {
          try {
            participant = await this.managers.appProfileManager.getParticipant(this.chatId, peerId) as typeof participant;
          } catch(err) {
            toast('User is no longer participant');
            return;
          }
        }

        const tab = this.slider.createTab(AppUserPermissionsTab);
        tab.participant = participant;
        tab.chatId = this.chatId;
        tab.userId = peerId;
        tab.open();
      };

      section.content.append(addExceptionRow.container);

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
        chatPermissions.fields.forEach((info) => {
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
          el.classList.toggle('hide', !cantWhat.length);
        } else {
          el.replaceChildren(i18n('UserRestrictionsBy', [await wrapPeerTitle({peerId: participant.kicked_by.toPeerId(false)})]));
          el.classList.remove('hide');
        }/*  else if(canWhat.length) {
          str = 'Can ' + canWhat.join(canWhat.length === 2 ? ' and ' : ', ');
        } */
      };

      const add = (participant: ChannelParticipant.channelParticipantBanned, append: boolean) => {
        const peerId = getPeerId(participant.peer);
        const dialogElement = appDialogsManager.addDialogNew({
          peerId,
          container: list,
          rippleEnabled: true,
          avatarSize: 'abitbigger',
          append,
          wrapOptions: {
            middleware: this.middlewareHelper.get()
          }
        });

        this.participants.set(peerId, participant);

        (dialogElement.dom.listEl as any).dialogElement = dialogElement;

        setSubtitle(dialogElement.dom, participant);
      };

      this.listenerSetter.add(rootScope)('chat_participant', (update) => {
        const newParticipant = update.new_participant as ChannelParticipant.channelParticipantBanned;
        const prevParticipant = update.prev_participant;
        const peerId = update.user_id.toPeerId(false);
        const needAdd = newParticipant?._ === 'channelParticipantBanned' &&
          !newParticipant.banned_rights.pFlags.view_messages;

        if(newParticipant) {
          this.participants.set(peerId, newParticipant);
        } else {
          this.participants.delete(peerId);
        }

        const li = list.querySelector(`[data-peer-id="${peerId}"]`);
        if(needAdd) {
          if(!li) {
            add(newParticipant, false);
          } else {
            setSubtitle((li as any).dialogElement.dom, newParticipant);
          }

          if(prevParticipant?._ !== 'channelParticipantBanned') {
            ++exceptionsCount;
          }
        } else {
          if(li) {
            (li as any).dialogElement.remove();
          }

          if(prevParticipant?._ === 'channelParticipantBanned') {
            --exceptionsCount;
          }
        }

        setLength();
      });

      const setLength = () => {
        const el = i18n(exceptionsCount ? 'Permissions.ExceptionsCount' : 'Permissions.NoExceptions', [exceptionsCount]);
        replaceContent(addExceptionRow.subtitle, el);
      };

      let exceptionsCount = 0;
      let loader: ScrollableLoader;
      const setLoader = () => {
        const LOAD_COUNT = 50;
        loader = new ScrollableLoader({
          scrollable: this.scrollable,
          getPromise: () => {
            return this.managers.appProfileManager.getChannelParticipants({
              id: this.chatId,
              filter: {_: 'channelParticipantsBanned', q: ''},
              limit: LOAD_COUNT,
              offset: list.childElementCount
            }).then((res) => {
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

  private saveChanges() {
    this.saveCallbacks.forEach(clb => void clb());
  }

  isConfirmationNeededOnClose = async() => {
    if(!this.solidState.hasChanges()) return;

    const saveButton: PopupPeerOptions['buttons'][number] = {
      langKey: 'Save'
    };

    try {
      await confirmationPopup({
        titleLangKey: 'UnsavedChanges',
        descriptionLangKey: 'UnsavedChangesDescription.Group',
        button: saveButton,
        buttons: [
          saveButton,
          {isCancel: true, langKey: 'Discard'}
        ],
        rejectWithReason: true
      });
      this.saveChanges();
    } catch(_reason: any) {
      const reason: ConfirmationPopupRejectReason = _reason;

      if(reason === 'closed') throw new Error();
    }
  }

  onOpenAfterTimeout() {
    this.scrollable.onScroll();
  }
}
