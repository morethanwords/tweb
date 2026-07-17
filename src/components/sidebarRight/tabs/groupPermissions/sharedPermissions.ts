import type {ChatRights} from '@appManagers/appChatsManager';
import {attachClickEvent} from '@helpers/dom/clickEvent';
import ListenerSetter from '@helpers/listenerSetter';
import {ChannelParticipant, Chat, ChatAdminRights, ChatBannedRights} from '@layer';
import {AppManagers} from '@lib/managers';
import combineParticipantBannedRights from '@appManagers/utils/chats/combineParticipantBannedRights';
import hasRights from '@appManagers/utils/chats/hasRights';
import getPeerActiveUsernames from '@appManagers/utils/peers/getPeerActiveUsernames';
import {LangPackKey} from '@lib/langPack';
import SliderSuperTab from '@components/sliderTab';
import CheckboxFields, {CheckboxFieldsField} from '@components/checkboxFields';
import apiManagerProxy from '@lib/apiManagerProxy';
import {createEffect, createRoot, createSignal, onCleanup} from 'solid-js';
import {createStore} from 'solid-js/store';
import deepEqual from '@helpers/object/deepEqual';
import ButtonIcon from '@components/buttonIcon';
import throttle from '@helpers/schedulers/throttle';
import {PopupPeerOptions} from '@components/popups/peer';
import confirmationPopup, {ConfirmationPopupRejectReason} from '@components/confirmationPopup';
import toggleDisability from '@helpers/dom/toggleDisability';
import {isParticipantCreator} from '@lib/appManagers/utils/chats/isParticipantAdmin';
import {CHAT_LEGACY_ADMIN_RIGHTS} from '@lib/appManagers/utils/chats/constants';
import {BANNED_RIGHTS_UNTIL_FOREVER} from '@lib/appManagers/constants';

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
    rights?: ChatAdminRights,
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
    const rights = this.rights = options.rights ?? (options.participant ? options.participant.admin_rights : undefined);

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
  alwaysShowSave?: boolean,
  unsavedConfirmationProps?: Partial<Pick<Parameters<typeof confirmationPopup>[0], 'titleLangKey' | 'descriptionLangKey' | 'button'>>
};

export const createSolidTabState = <StateStore extends object>({tab, save, alwaysShowSave, unsavedConfirmationProps = {}}: CreateSolidTabStateProps) => createRoot((dispose) => {
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

    saveIcon().classList.toggle('appear-zoom--active', hasChanges() || alwaysShowSave);
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
