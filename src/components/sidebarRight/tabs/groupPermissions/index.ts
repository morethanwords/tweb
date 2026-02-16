/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import type {ChatRights} from '@appManagers/appChatsManager';
import {attachClickEvent} from '@helpers/dom/clickEvent';
import findUpTag from '@helpers/dom/findUpTag';
import replaceContent from '@helpers/dom/replaceContent';
import ListenerSetter from '@helpers/listenerSetter';
import ScrollableLoader from '@helpers/scrollableLoader';
import {ChannelParticipant, Chat, ChatAdminRights, ChatBannedRights, ChatFull} from '@layer';
import appDialogsManager, {DialogDom, DIALOG_LIST_ELEMENT_TAG} from '@lib/appDialogsManager';
import {AppManagers} from '@lib/managers';
import combineParticipantBannedRights from '@appManagers/utils/chats/combineParticipantBannedRights';
import hasRights from '@appManagers/utils/chats/hasRights';
import getPeerActiveUsernames from '@appManagers/utils/peers/getPeerActiveUsernames';
import getPeerId from '@appManagers/utils/peers/getPeerId';
import {i18n, join, LangPackKey} from '@lib/langPack';
import rootScope from '@lib/rootScope';
import PopupPickUser from '@components/popups/pickUser';
import Row from '@components/row';
import SettingSection from '@components/settingSection';
import SliderSuperTab, {SliderSuperTabEventable} from '@components/sliderTab';
import AppUserPermissionsTab from '@components/sidebarRight/tabs/userPermissions';
import CheckboxFields, {CheckboxFieldsField} from '@components/checkboxFields';
import PopupElement from '@components/popups';
import wrapPeerTitle from '@components/wrappers/peerTitle';
import apiManagerProxy from '@lib/apiManagerProxy';
import RangeStepsSelector from '@components/rangeStepsSelector';
import formatDuration from '@helpers/formatDuration';
import {wrapFormattedDuration} from '@components/wrappers/wrapDuration';
import SolidJSHotReloadGuardProvider from '@lib/solidjs/hotReloadGuardProvider';
import {createEffect, createRoot, createSignal, onCleanup} from 'solid-js';
import {createStore} from 'solid-js/store';
import deepEqual from '@helpers/object/deepEqual';
import ButtonIcon from '@components/buttonIcon';
import throttle from '@helpers/schedulers/throttle';
import {PopupPeerOptions} from '@components/popups/peer';
import confirmationPopup, {ConfirmationPopupRejectReason} from '@components/confirmationPopup';
import {handleChannelsTooMuch} from '@components/popups/channelsTooMuch';
import toggleDisability from '@helpers/dom/toggleDisability';
import {isParticipantCreator} from '@lib/appManagers/utils/chats/isParticipantAdmin';
import {CHAT_LEGACY_ADMIN_RIGHTS} from '@lib/appManagers/utils/chats/constants';
import {BANNED_RIGHTS_UNTIL_FOREVER} from '@lib/appManagers/constants';
import createDoNotRestrictBoostersSection from '@components/sidebarRight/tabs/groupPermissions/doNotRestrictBoostersSection';

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
  protected untilDate: number;

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
    this.untilDate = rights.until_date || BANNED_RIGHTS_UNTIL_FOREVER;

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

    this.fields.forEach((field) => {
      field.checkboxField.listenerSetter.add(field.checkboxField.input)('change', () => {
        this.options?.onSomethingChanged?.();
      });
    });
  }

  public setUntilDate(untilDate: number) {
    this.untilDate = untilDate;
    this.options.onSomethingChanged?.();
  }

  public takeOut() {
    const rights: ChatBannedRights = {
      _: 'chatBannedRights',
      until_date: this.untilDate,
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

  protected static CHAT_LEGACY_ADMIN_RIGHTS: ChatAdminRights = {
    _: 'chatAdminRights',
    pFlags: {
      change_info: true,
      delete_messages: true,
      ban_users: true,
      invite_users: true,
      pin_messages: true,
      manage_call: true
    }
  };

  constructor(private options: {
    chatId: ChatId,
    listenerSetter: ListenerSetter,
    appendTo: HTMLElement,
    participant?: ChannelParticipant.channelParticipantAdmin | ChannelParticipant.channelParticipantCreator,
    chat: Chat,
    canEdit?: boolean,
    onSomethingChanged?: () => void
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

    const isCreator = isParticipantCreator(options.participant);
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
      isBroadcast && {flags: ['manage_direct_messages'], text: 'Channel.EditAdmin.ManageDirectMessages'},
      !isBroadcast && {flags: ['anonymous'], text: 'EditAdminSendAnonymously', checked: rights ? undefined : false},
      {flags: ['add_admins'], text: 'EditAdminAddAdmins', checked: rights ? undefined : isCreator}
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

    this.fields.forEach((field) => {
      field.checkboxField.listenerSetter.add(field.checkboxField.input)('change', () => {
        this.options?.onSomethingChanged?.();
      });
    });
  }

  public takeOut() {
    let rights: ChatAdminRights = {
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

    // * fix missing flags
    if(
      this.options.chat._ === 'chat' &&
      deepEqual(rights, ChatAdministratorRights.CHAT_LEGACY_ADMIN_RIGHTS)
    ) {
      rights = CHAT_LEGACY_ADMIN_RIGHTS;
    }

    return rights;
  }
}

type CreateSolidTabStateProps = {
  tab: SliderSuperTab,
  save: () => Promise<any>,
  unsavedConfirmationProps?: Partial<Pick<Parameters<typeof confirmationPopup>[0], 'titleLangKey' | 'descriptionLangKey' | 'button'>>
};

export const createSolidTabState = <StateStore extends object>({tab, save, unsavedConfirmationProps = {}}: CreateSolidTabStateProps) => createRoot((dispose) => {
  tab.middlewareHelper.get().onDestroy(dispose);

  const initialState: StateStore = {} as any;

  const [store, set] = createStore<StateStore>({} as StateStore);
  const [saveIcon, setSaveIcon] = createSignal<HTMLElement>(ButtonIcon('check primary appear-zoom'));
  const [saving, setSaving] = createSignal(false);
  const [valid, setValid] = createSignal(true);

  const [hasChanges, setHasChanges] = createSignal(false);
  const throttledSetHasChanges = throttle(setHasChanges, 200, true);

  createEffect(() => {
    throttledSetHasChanges(!deepEqual(store, initialState));
  });

  createEffect(() => {
    if(!saveIcon()) return;

    saveIcon().classList.toggle('appear-zoom--active', hasChanges());
  });

  createEffect(() => {
    toggleDisability(saveIcon(), !valid() || saving());
  });

  // createEffect(() => {
  //   ({...store});
  //   console.log('{...store} :>> ', {...unwrap(store)});
  // });

  const initiateSaving = async() => {
    setSaving(true);
    try {
      await save();
      dispose();
      tab.close();
    } catch(err) {
      setSaving(false);
      throw err;
    }
  };

  const detach = attachClickEvent(saveIcon(), initiateSaving);
  onCleanup(detach);

  tab.isConfirmationNeededOnClose = async() => {
    if(!hasChanges() || saving()) return;

    const saveButton: PopupPeerOptions['buttons'][number] = unsavedConfirmationProps.button || {
      langKey: 'Save'
    };

    try {
      await confirmationPopup({
        button: saveButton,
        buttons: [
          saveButton,
          {isCancel: true, langKey: 'Discard'}
        ],
        titleLangKey: 'UnsavedChanges',
        descriptionLangKey: 'UnsavedChangesDescription',
        ...unsavedConfirmationProps,
        rejectWithReason: true
      });

      await initiateSaving();
    } catch(_reason: any) {
      const reason: ConfirmationPopupRejectReason = _reason;

      if(reason !== 'canceled') {
        throw new Error();
      }
    }
  };

  onCleanup(() => {
    tab.isConfirmationNeededOnClose = undefined;
  });

  return {
    setInitial: (state: Partial<StateStore>) => {
      Object.assign(initialState, state);
      set(state as any);
    },

    store,
    set,
    saveIcon,
    // setSaveIcon,

    saving,

    valid,
    setValid,

    hasChanges,

    dispose,

    save: initiateSaving
  };
});

export default class AppGroupPermissionsTab extends SliderSuperTabEventable {
  public chatId: ChatId;
  private participants: Map<PeerId, ChannelParticipant.channelParticipantBanned>;

  private saveCallbacks: Array<() => any> = [];
  private solidState = createSolidTabState<{
    rights?: ChatBannedRights.chatBannedRights,
    stars?: number,
    slowModeSeconds?: number,
    boostsUnrestrict?: number
  }>({
    tab: this,
    save: async() => {
      for(const callback of this.saveCallbacks) {
        await callback();
      }
    },
    unsavedConfirmationProps: {
      descriptionLangKey: 'UnsavedChangesDescription.Group'
    }
  });

  public async init() {
    this.container.classList.add('edit-peer-container', 'group-permissions-container');
    this.setTitle('ChannelPermissions');

    this.header.append(this.solidState.saveIcon());

    const chat = apiManagerProxy.getChat(this.chatId);
    const isChannel = chat._ === 'channel';

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
          this.solidState.set({rights: chatPermissions.takeOut()});
        }
      }, this.managers);

      this.solidState.setInitial({rights: chatPermissions.takeOut()});

      this.saveCallbacks.push(() => {
        return this.managers.appChatsManager.editChatDefaultBannedRights(this.chatId, chatPermissions.takeOut());
      });

      this.scrollable.append(section.container);
    }

    if(isChannel) {
      const {default: createChargeForMessagesSection} = await import('./chargeForMessasgesSection');

      const initialStars = +chat.send_paid_messages_stars || 0;
      this.solidState.setInitial({stars: initialStars});

      const {element, dispose, promise} = createChargeForMessagesSection(
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
        return this.managers.appChatsManager.updateChannelPaidMessagesPrice(chat.id, stars);
      });
    }

    const chatFull = await this.managers.appProfileManager.getChatFull(this.chatId);

    {
      const section = new SettingSection({
        name: 'Slowmode',
        caption: true
      });

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

      const values = [0, 5, 10, 30, 60, 300, 900, 3600];
      const steps = range.generateSteps(values);
      const initialValue = (chatFull as ChatFull.channelFull).slowmode_seconds || 0;

      this.solidState.setInitial({slowModeSeconds: initialValue});
      range.setSteps(steps, values.indexOf(initialValue));


      section.content.append(range.container);

      this.saveCallbacks.push(() => {
        const {value} = range;
        if(value !== initialValue) {
          return handleChannelsTooMuch(() => {
            return this.managers.appChatsManager.toggleSlowMode(this.chatId, value);
          });
        }
      });

      this.scrollable.append(section.container);
    }

    if(isChannel) {
      const initialBoosts = (chatFull as ChatFull.channelFull).boosts_unrestrict;
      const {element, dispose} = createDoNotRestrictBoostersSection({
        initialBoosts,
        onChange: (value) => {
          this.solidState.set({boostsUnrestrict: value});
        },
        show: () => !!this.solidState.store.slowModeSeconds
      });
      this.solidState.setInitial({boostsUnrestrict: initialBoosts});
      this.middlewareHelper.get().onDestroy(dispose);
      this.scrollable.append(element);

      this.saveCallbacks.push(() => {
        const {boostsUnrestrict} = this.solidState.store;
        if(initialBoosts === boostsUnrestrict) {
          return;
        }

        return this.managers.appChatsManager.setBoostsToUnblockRestrictions(
          this.chatId,
          boostsUnrestrict
        );
      });
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

  onOpenAfterTimeout() {
    this.scrollable.onScroll();
  }
}
