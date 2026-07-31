import Button from '@components/buttonTsx';
import createButton from '@components/button';
import CheckboxFields, {CheckboxFieldsField} from '@components/checkboxFields';
import confirmationPopup from '@components/confirmationPopup';
import {IconTsx} from '@components/iconTsx';
import {InputFieldTsx} from '@components/inputFieldTsx';
import MediaHeader from '@components/mediaHeader';
import PeerTitle from '@components/peerTitle';
import {PreloaderTsx} from '@components/putPreloader';
import Row from '@components/rowTsx';
import SaveButton from '@components/saveButton';
import Section from '@components/section';
import {AppAddMembersTab, AppChatAutomationTab, type AppAddMembersExtraCategory} from '@components/solidJsTabs/tabs';
import {useSuperTab} from '@components/solidJsTabs/superTabProvider';
import StaticRadio from '@components/staticRadio';
import {toastNew} from '@components/toast';
import {FontFamily, FontWeightBold} from '@config/font';
import cancelEvent from '@helpers/dom/cancelEvent';
import {attachClickEvent} from '@helpers/dom/clickEvent';
import getTextWidth from '@helpers/canvas/getTextWidth';
import deepEqual from '@helpers/object/deepEqual';
import isSameUserId from '@helpers/isSameUserId';
import useIsConfirmationNeededOnClose from '@hooks/useIsConfirmationNeededOnClose';
import {BusinessBotRecipients, BusinessBotRights, ConnectedBot} from '@layer';
import appDialogsManager from '@lib/appDialogsManager';
import appImManager from '@lib/appImManager';
import I18n, {i18n, join, LangPackKey} from '@lib/langPack';
import {createEffect, createMemo, createSignal, For, on, onCleanup, Show} from 'solid-js';
import {createStore} from 'solid-js/store';
import {Portal} from 'solid-js/web';
import styles from '@components/sidebarLeft/tabs/chatAutomation.module.scss';
import {normalizeBusinessBotUsername} from '@appManagers/appBusinessManager';
import getPeerActiveUsernames from '@appManagers/utils/peers/getPeerActiveUsernames';
import {
  ChatAutomationCategoryKey,
  ChatAutomationRecipientSectionKind,
  ChatAutomationRecipientsDraft,
  changeChatAutomationRecipientMode,
  excludeChatAutomationUserIds,
  getChatAutomationRecipientCategoryKeys,
  getChatAutomationRecipientSectionKinds,
  makeChatAutomationRecipientsDraft,
  toBusinessBotRecipients
} from '@components/sidebarLeft/tabs/chatAutomationRecipients';

type AppChatAutomationTabType = typeof AppChatAutomationTab;
type RightKey = keyof BusinessBotRights.businessBotRights['pFlags'];

type ChatAutomationState = ChatAutomationRecipientsDraft & {
  botId?: UserId,
  rights: Record<RightKey, boolean>
};

const RIGHT_KEYS: RightKey[] = [
  'reply',
  'read_messages',
  'delete_sent_messages',
  'delete_received_messages',
  'edit_name',
  'edit_bio',
  'edit_profile_photo',
  'edit_username',
  'view_gifts',
  'sell_gifts',
  'change_gift_settings',
  'transfer_and_upgrade_gifts',
  'transfer_stars',
  'manage_stories'
];

const DEFAULT_RIGHTS = new Set<RightKey>([
  'reply',
  'read_messages',
  'delete_sent_messages',
  'delete_received_messages'
]);

type RightGroup = {
  id: string,
  title: LangPackKey,
  rights: Array<{key: RightKey, title: LangPackKey}>,
  fixedRights?: LangPackKey[],
  standalone?: boolean,
  warning?: LangPackKey
};

type BotPermissionField = CheckboxFieldsField & {
  fixed?: boolean,
  group?: RightGroup,
  rightKey?: RightKey
};

const RIGHT_GROUPS: RightGroup[] = [{
  id: 'messages',
  title: 'ChatAutomation.ManageMessages',
  fixedRights: ['ChatAutomation.ReadMessages'],
  rights: [
    {key: 'reply', title: 'ChatAutomation.Reply'},
    {key: 'read_messages', title: 'ChatAutomation.MarkRead'},
    {key: 'delete_sent_messages', title: 'ChatAutomation.DeleteSent'},
    {key: 'delete_received_messages', title: 'ChatAutomation.DeleteReceived'}
  ]
}, {
  id: 'profile',
  title: 'ChatAutomation.ManageProfile',
  warning: 'ChatAutomation.UsernameWarning',
  rights: [
    {key: 'edit_name', title: 'ChatAutomation.EditName'},
    {key: 'edit_bio', title: 'ChatAutomation.EditBio'},
    {key: 'edit_profile_photo', title: 'ChatAutomation.EditPhoto'},
    {key: 'edit_username', title: 'ChatAutomation.EditUsername'}
  ]
}, {
  id: 'gifts',
  title: 'ChatAutomation.ManageGifts',
  warning: 'ChatAutomation.GiftsAndStarsWarning',
  rights: [
    {key: 'view_gifts', title: 'ChatAutomation.ViewGifts'},
    {key: 'sell_gifts', title: 'ChatAutomation.SellGifts'},
    {key: 'change_gift_settings', title: 'ChatAutomation.ChangeGiftSettings'},
    {key: 'transfer_and_upgrade_gifts', title: 'ChatAutomation.TransferGifts'},
    {key: 'transfer_stars', title: 'ChatAutomation.TransferStars'}
  ]
}, {
  id: 'stories',
  title: 'ChatAutomation.ManageStories',
  standalone: true,
  rights: [
    {key: 'manage_stories', title: 'ChatAutomation.ManageStories'}
  ]
}];

const RECIPIENT_CATEGORIES: ReadonlyArray<AppAddMembersExtraCategory & {key: ChatAutomationCategoryKey}> = [{
  key: 'existingChats',
  icon: 'recent',
  text: 'ChatAutomation.ExistingChats'
}, {
  key: 'newChats',
  icon: 'adduser',
  text: 'ChatAutomation.NewChats'
}, {
  key: 'contacts',
  icon: 'user',
  text: 'ChatAutomation.Contacts'
}, {
  key: 'nonContacts',
  icon: 'noncontacts',
  text: 'ChatAutomation.NonContacts'
}];

function getWarningKey(key: RightKey): LangPackKey | undefined {
  if(key === 'edit_username') return 'ChatAutomation.UsernameWarning';
  if(key === 'transfer_stars') return 'ChatAutomation.StarsWarning';
  if(key === 'transfer_and_upgrade_gifts') return 'ChatAutomation.GiftsWarning';
}

function makeRights(connectedBot?: ConnectedBot.connectedBot) {
  return Object.fromEntries(RIGHT_KEYS.map((key) => [
    key,
    connectedBot ? !!connectedBot.rights?.pFlags?.[key] : DEFAULT_RIGHTS.has(key)
  ])) as Record<RightKey, boolean>;
}

function makeInitialState(connectedBot?: ConnectedBot.connectedBot): ChatAutomationState {
  return {
    ...makeChatAutomationRecipientsDraft(connectedBot?.recipients),
    botId: connectedBot?.bot_id as UserId,
    rights: makeRights(connectedBot)
  };
}

function BotDialog(props: {userId: UserId, onAdd?: () => void}) {
  const [tab] = useSuperTab<AppChatAutomationTabType>();
  const onAdd = props.onAdd;
  const peerId = props.userId.toPeerId(false);
  const dialogElement = appDialogsManager.addDialogNew({
    peerId,
    rippleEnabled: true,
    avatarSize: 'abitbigger',
    meAsSaved: false,
    autonomous: true,
    dontSetActive: true,
    wrapOptions: {
      middleware: tab.middlewareHelper.get()
    }
  });
  const removeDialogClickListener = attachClickEvent(dialogElement.container, () => {
    appImManager.setInnerPeer({peerId});
  });
  let active = true;
  const removeAddClickListener = onAdd && (() => {
    const button = createButton(
      'btn-primary btn-color-primary btn-control-small',
      {text: 'Add'}
    );
    button.style.insetInlineEnd = '1rem';
    button.style.pointerEvents = 'all';
    button.style.position = 'absolute';
    button.style.top = '50%';
    button.style.transform = 'translateY(-50%)';

    dialogElement.container.append(button);

    const buttonTextWidth = getTextWidth(
      button.textContent, `${FontWeightBold} 15px ${FontFamily}`);
    dialogElement.container.style.paddingInlineEnd =
      `${Math.ceil(buttonTextWidth + 24 + 16 + 8)}px`;

    const onClick = (event: MouseEvent) => {
      cancelEvent(event);
      onAdd();
    };
    return attachClickEvent(button, onClick);
  })();

  tab.managers.appUsersManager.getUser(props.userId).then((user) => {
    if(!active || user?._ !== 'user') return;

    const username = getPeerActiveUsernames(user)[0];
    dialogElement.dom.lastMessageSpan.replaceChildren(username ? `@${username}` : '');
  });

  onCleanup(() => {
    active = false;
    removeDialogClickListener();
    removeAddClickListener?.();
    dialogElement.remove();
  });

  return dialogElement.container;
}

function BotDialogList(props: {userIds: UserId[], onAdd?: (userId: UserId) => void}) {
  const list = appDialogsManager.createChatList({ignoreClick: true});

  return (
    <div class="chatlist-container">
      {list}
      <Portal mount={list}>
        <For each={props.userIds}>
          {(userId) => <BotDialog userId={userId} onAdd={props.onAdd && (() => props.onAdd(userId))} />}
        </For>
      </Portal>
    </div>
  );
}

function AccessRadio(props: {checked: boolean, onChange: () => void}) {
  const [focusVisible, setFocusVisible] = createSignal(false);

  return (
    <>
      <input
        type="radio"
        name="chat-automation-access"
        checked={props.checked}
        onChange={props.onChange}
        onFocus={(event) => setFocusVisible(event.currentTarget.matches(':focus-visible'))}
        onBlur={() => setFocusVisible(false)}
      />
      <StaticRadio
        classList={{[styles.accessRadioFocused]: focusVisible()}}
        floating
        checked={props.checked}
      />
    </>
  );
}

function BotPermissions(props: {
  rights: Record<RightKey, boolean>,
  confirmPermissionWarning: (warningKey?: LangPackKey) => Promise<boolean>,
  onRightsChange: (rights: Record<RightKey, boolean>) => void
}) {
  const [tab] = useSuperTab<AppChatAutomationTabType>();
  const fields: BotPermissionField[] = [];
  const rootFields: BotPermissionField[] = [];
  const rightFields = new Map<RightKey, BotPermissionField>();

  RIGHT_GROUPS.forEach((group) => {
    if(group.standalone) {
      const {key, title} = group.rights[0];
      const field: BotPermissionField = {
        text: title,
        checked: props.rights[key],
        group,
        rightKey: key
      };
      rootFields.push(field);
      fields.push(field);
      rightFields.set(key, field);
      return;
    }

    const nested: BotPermissionField[] = [
      ...(group.fixedRights || []).map((text): BotPermissionField => ({
        text,
        checked: true,
        fixed: true,
        group
      })),
      ...group.rights.map(({key, title}): BotPermissionField => {
        const field = {
          text: title,
          checked: props.rights[key],
          group,
          rightKey: key
        };
        rightFields.set(key, field);
        return field;
      })
    ];
    const mutableNested = nested.filter(({rightKey}) => !!rightKey);
    const field: BotPermissionField = {
      text: group.title,
      group,
      nested,
      toggleWith: {
        checked: mutableNested,
        unchecked: mutableNested
      }
    };
    rootFields.push(field);
    fields.push(field, ...nested);
  });

  let nodes: HTMLElement[] = [];
  let confirmationPending = false;
  let changeScheduled = false;
  let disposed = false;

  onCleanup(() => disposed = true);

  const readRights = () => {
    const rights = {} as Record<RightKey, boolean>;
    RIGHT_KEYS.forEach((key) => rights[key] = rightFields.get(key).checkboxField.checked);
    return rights;
  };

  const syncRights = (rights: Record<RightKey, boolean>) => {
    RIGHT_KEYS.forEach((key) => {
      rightFields.get(key).checkboxField.setValueSilently(rights[key]);
    });
    fields.forEach((field) => {
      if(field.fixed) field.checkboxField.setValueSilently(true);
    });
    rootFields.forEach((field) => {
      if(!field.nested) return;

      const count = field.nested.filter(({checkboxField}) => checkboxField.checked).length;
      field.checkboxField.setValueSilently(count === field.nested.length);
      checkboxFields.setNestedCounter(field, count);
    });
  };

  const setInert = (inert: boolean) => {
    nodes.forEach((node) => node.toggleAttribute('inert', inert));
  };

  const flushRightsChange = () => {
    changeScheduled = false;
    if(disposed) return;

    if(confirmationPending) {
      syncRights(props.rights);
      return;
    }

    const previousRights = {...props.rights};
    fields.forEach((field) => {
      if(field.fixed) field.checkboxField.setValueSilently(true);
    });
    const nextRights = readRights();
    syncRights(nextRights);

    const enabledFields = [...rightFields.values()].filter(({rightKey}) => (
      !previousRights[rightKey] && nextRights[rightKey]
    ));
    const enabledGroups = new Set(enabledFields.map(({group}) => group));
    const warningKey = enabledFields.length > 1 && enabledGroups.size === 1 ?
      enabledFields[0].group.warning :
      enabledFields.map(({rightKey}) => getWarningKey(rightKey)).find(Boolean);

    if(!warningKey) {
      props.onRightsChange(nextRights);
      return;
    }

    confirmationPending = true;
    setInert(true);
    props.confirmPermissionWarning(warningKey).then((confirmed) => {
      if(disposed) return;

      if(confirmed) {
        props.onRightsChange(nextRights);
      } else {
        syncRights(previousRights);
      }
    }).finally(() => {
      if(disposed) return;

      confirmationPending = false;
      setInert(false);
    });
  };

  const checkboxFields = new CheckboxFields<BotPermissionField>({
    fields,
    listenerSetter: tab.listenerSetter,
    onRowCreation: (row, info) => {
      row.title?.classList.add('pre-wrap');

      if(!info.fixed) return;

      info.checkboxField.input.disabled = true;
      row.container.classList.add('is-disabled');
      row.container.setAttribute('aria-disabled', 'true');
    },
    onAnyChange: () => {
      if(changeScheduled) return;

      changeScheduled = true;
      queueMicrotask(flushRightsChange);
    }
  });

  nodes = rootFields.flatMap((field) => checkboxFields.createField(field)?.nodes || []);
  return nodes;
}

export default function ChatAutomationTab() {
  const [tab] = useSuperTab<AppChatAutomationTabType>();

  const originalConnectedBot = tab.payload.connectedBot;
  const initialState = makeInitialState(originalConnectedBot);
  const [persistedState, setPersistedState] = createSignal(initialState);
  const [store, setStore] = createStore(makeInitialState(originalConnectedBot));
  const [query, setQuery] = createSignal('');
  const [searching, setSearching] = createSignal(false);
  const [searchFinished, setSearchFinished] = createSignal(false);
  const [searchResults, setSearchResults] = createSignal<UserId[]>([]);
  const [unsupportedUserId, setUnsupportedUserId] = createSignal<UserId>();
  const [searchFailed, setSearchFailed] = createSignal(false);
  const [editingBotQuery, setEditingBotQuery] = createSignal(false);
  const [saving, setSaving] = createSignal(false);
  let searchTimer: number;
  let searchRequestId = 0;
  let cleanedUp = false;

  const primaryRecipientsCount = createMemo(() => {
    return store.userIds.length + Object.values(store.categories).filter(Boolean).length;
  });

  createEffect(on([query, editingBotQuery], ([value, editing]) => {
    ++searchRequestId;
    window.clearTimeout(searchTimer);
    setSearchResults([]);
    setUnsupportedUserId(undefined);
    setSearchFailed(false);
    setSearchFinished(false);

    if(!editing || !value.trim()) {
      setSearching(false);
      return;
    }

    const requestId = searchRequestId;
    setSearching(true);
    searchTimer = window.setTimeout(async() => {
      try {
        const result = await tab.managers.appBusinessManager.searchBusinessBots(value);
        if(requestId !== searchRequestId) return;

        setSearchResults(result.userIds);
        setUnsupportedUserId(result.unsupportedUserId);
      } catch(err) {
        if(requestId !== searchRequestId) return;
        setSearchFailed(true);
      } finally {
        if(requestId === searchRequestId) {
          setSearching(false);
          setSearchFinished(true);
        }
      }
    }, 400);
  }, {defer: true}));

  onCleanup(() => {
    cleanedUp = true;
    ++searchRequestId;
    window.clearTimeout(searchTimer);
  });

  if(initialState.botId) {
    tab.managers.appUsersManager.getUser(initialState.botId).then((user) => {
      if(
        !cleanedUp &&
        isSameUserId(store.botId, initialState.botId) &&
        !query() &&
        user?._ === 'user'
      ) {
        setQuery(user.username || '');
      }
    });
  }

  const selectBot = (userId: UserId) => {
    const normalizedQuery = normalizeBusinessBotUsername(query());
    if(normalizedQuery) setQuery(normalizedQuery);

    if(!isSameUserId(store.botId, userId)) {
      const persisted = persistedState();
      setStore('rights', isSameUserId(persisted.botId, userId) ?
        {...persisted.rights} :
        makeRights());
    }

    setStore('botId', userId);
    setEditingBotQuery(false);
    setSearchResults([]);
    setSearchFinished(false);
    tab.managers.appUsersManager.getUser(userId).then((user) => {
      if(
        isSameUserId(store.botId, userId) &&
        !editingBotQuery() &&
        user?._ === 'user' &&
        user.username
      ) {
        setQuery(user.username);
      }
    });
  };

  const updateBotQuery = (value: string) => {
    if(value === query()) return;

    setEditingBotQuery(true);
    setQuery(value);
  };

  const removeBot = () => {
    setStore('botId', undefined);
    setEditingBotQuery(false);
    setQuery('');
    setSearchResults([]);
    setSearchFinished(false);
  };

  const openRecipientsPicker = (excludeUsersOnly = false) => {
    const editIncluded = !store.excludeSelected;
    const selectedUserIds = excludeUsersOnly ?
      store.excludedUserIds :
      store.userIds;
    const selectedExtras = new Set<string>();
    const categoryKeys = getChatAutomationRecipientCategoryKeys(editIncluded, excludeUsersOnly);
    if(!excludeUsersOnly) {
      categoryKeys.forEach((key) => store.categories[key] && selectedExtras.add(key));
    }

    tab.slider.createTab(AppAddMembersTab).open({
      title: excludeUsersOnly ? 'ChatAutomation.ExcludedChats' :
        (store.excludeSelected ? 'ChatAutomation.ExcludeChats' : 'ChatAutomation.SelectChats'),
      placeholder: 'SearchPlaceholder',
      type: 'privacy',
      takeOut: (peerIds, extras) => {
        const userIds = peerIds.map((peerId) => peerId.toUserId());
        if(excludeUsersOnly) {
          setStore('userIds', (primaryUserIds) => (
            excludeChatAutomationUserIds(primaryUserIds, userIds)
          ));
          setStore('excludedUserIds', userIds);
          return;
        }

        const categoryValue = {
          existingChats: extras.has('existingChats'),
          newChats: extras.has('newChats'),
          contacts: extras.has('contacts'),
          nonContacts: extras.has('nonContacts')
        };
        setStore('userIds', userIds);
        setStore('categories', categoryValue);
        setStore('excludedUserIds', (excludedUserIds) => (
          excludeChatAutomationUserIds(excludedUserIds, userIds)
        ));
      },
      skippable: true,
      selectedPeerIds: selectedUserIds.map((userId) => userId.toPeerId(false)),
      selectedExtras,
      extraCategories: excludeUsersOnly ? undefined : RECIPIENT_CATEGORIES.filter(({key}) => (
        categoryKeys.includes(key)
      )),
      extraCategoriesSectionLangKey: excludeUsersOnly ? undefined : 'ChatAutomation.RecipientCategories',
      peerType: ['dialogs', 'contacts'],
      exceptSelf: true,
      filterPeerTypeBy: ['isRegularUser'],
      limit: 100,
      limitCallback: () => toastNew({langPackKey: 'ChatAutomation.RecipientLimit'})
    });
  };

  const setRecipientMode = (excludeSelected: boolean) => {
    if(store.excludeSelected === excludeSelected) return;
    setStore(changeChatAutomationRecipientMode(store, excludeSelected));
  };

  const confirmPermissionWarning = async(warningKey?: LangPackKey) => {
    if(warningKey) {
      const botUsername = new PeerTitle({
        peerId: store.botId.toPeerId(false),
        username: true
      });
      try {
        await confirmationPopup({
          titleLangKey: 'ChatAutomation.PermissionWarningTitle',
          descriptionLangKey: warningKey,
          descriptionLangArgs: [botUsername.element],
          button: {langKey: 'ChatAutomation.PermissionWarningProceed'}
        });
      } catch(err) {
        return false;
      }
    }

    return true;
  };

  const getRecipients = (state: ChatAutomationState = store): BusinessBotRecipients.businessBotRecipients => {
    return toBusinessBotRecipients(state);
  };

  const getRights = (state: ChatAutomationState = store): BusinessBotRights.businessBotRights => {
    const pFlags: BusinessBotRights.businessBotRights['pFlags'] = {};
    RIGHT_KEYS.forEach((key) => {
      if(state.rights[key]) pFlags[key] = true;
    });

    return {_: 'businessBotRights', pFlags};
  };

  const getStateSnapshot = (): ChatAutomationState => ({
    botId: store.botId,
    excludeSelected: store.excludeSelected,
    categories: {...store.categories},
    userIds: [...store.userIds],
    excludedUserIds: [...store.excludedUserIds],
    rights: {...store.rights}
  });

  const hasChanges = createMemo(() => {
    const persisted = persistedState();
    const botChanged = !isSameUserId(store.botId, persisted.botId);
    if(!store.botId) return botChanged;

    return botChanged ||
      !deepEqual(getRecipients(), getRecipients(persisted)) ||
      !deepEqual(getRights(), getRights(persisted));
  });

  const getRecipientSummary = (kind: ChatAutomationRecipientSectionKind) => {
    const usesPrimarySelection = kind === 'included' || store.excludeSelected;
    const userIds = usesPrimarySelection ? store.userIds : store.excludedUserIds;
    const categoryKeys = usesPrimarySelection ?
      getChatAutomationRecipientCategoryKeys(!store.excludeSelected) :
      [];
    const categories = categoryKeys
    .filter((key) => store.categories[key])
    .map((key) => i18n(RECIPIENT_CATEGORIES.find((category) => category.key === key).text));
    const parts = [
      userIds.length ? i18n('Users', [userIds.length]) : null,
      ...categories
    ].filter(Boolean);

    return parts.length ?
      join(parts, false) :
      i18n('ChatAutomation.RecipientSummaryEmpty');
  };

  const openRecipientSection = (kind: ChatAutomationRecipientSectionKind) => {
    openRecipientsPicker(kind === 'excluded' && !store.excludeSelected);
  };

  let savePromise: Promise<boolean>;
  let navigationCloseRequested = false;
  let closeAttemptPending = false;
  const save = () => {
    if(savePromise) return savePromise;
    if(!hasChanges()) return Promise.resolve(true);
    if(store.botId && !store.excludeSelected && !primaryRecipientsCount()) {
      toastNew({langPackKey: 'ChatAutomation.RecipientsEmpty'});
      openRecipientsPicker();
      return Promise.reject(new Error('BUSINESS_RECIPIENTS_EMPTY'));
    }

    setSaving(true);
    const snapshot = getStateSnapshot();
    const previousBotId = persistedState().botId;
    const promise = tab.managers.appBusinessManager.updateConnectedBot({
      botId: snapshot.botId,
      previousBotId,
      recipients: getRecipients(snapshot),
      rights: getRights(snapshot)
    })
    .then(() => {
      setPersistedState(snapshot);
      const isCurrent = !hasChanges();
      if(isCurrent) tab.isConfirmationNeededOnClose = undefined;
      toastNew({langPackKey: 'ChatAutomation.SaveSuccess'});
      return isCurrent;
    })
    .catch((err) => {
      const errorType = (err as {type?: string}).type;
      if(errorType === 'BUSINESS_RECIPIENTS_EMPTY') {
        toastNew({langPackKey: 'ChatAutomation.RecipientsEmpty'});
      } else if(errorType === 'BOT_BUSINESS_MISSING') {
        toastNew({langPackKey: 'ChatAutomation.BotUnsupported'});
      } else {
        toastNew({langPackKey: 'Error.AnError'});
      }
      throw err;
    })
    .finally(() => {
      setSaving(false);
      if(savePromise === promise) savePromise = undefined;
    });
    return savePromise = promise;
  };

  const confirmClose = useIsConfirmationNeededOnClose({
    hasChanges,
    saveAllSettings: async() => {
      if(!await save()) {
        throw new Error('CHAT_AUTOMATION_CHANGED_DURING_SAVE');
      }
    },
    descriptionLangKey: 'UnsavedChangesDescription.ChatAutomation',
    waitForSave: true
  });
  const hasPendingBotCandidate = () => {
    return editingBotQuery() &&
      (!!unsupportedUserId() ||
        searchResults().some((userId) => !isSameUserId(userId, store.botId)));
  };
  tab.isConfirmationNeededOnClose = () => {
    if(closeAttemptPending) {
      return Promise.reject(new Error('CLOSE_ATTEMPT_PENDING'));
    }

    closeAttemptPending = true;
    navigationCloseRequested = true;
    const pendingBotConfirmation = hasPendingBotCandidate() ?
      confirmationPopup({
        titleLangKey: 'ChatAutomation.SetupNotCompletedTitle',
        descriptionLangKey: 'ChatAutomation.SetupNotCompletedText',
        button: {langKey: 'ChatAutomation.SetupNotCompletedLeave'}
      }) :
      Promise.resolve();
    return pendingBotConfirmation.then(async() => {
      const pendingSave = savePromise;
      if(pendingSave) {
        if(!await pendingSave) {
          throw new Error('CHAT_AUTOMATION_CHANGED_DURING_SAVE');
        }
      } else {
        await confirmClose();
      }
    }).then(
      () => {
        closeAttemptPending = false;
      },
      (err) => {
        closeAttemptPending = false;
        navigationCloseRequested = false;
        throw err;
      }
    );
  };

  const saveAndClose = () => {
    if(saving()) return;

    navigationCloseRequested = false;
    save().then((isCurrent) => {
      if(isCurrent && !navigationCloseRequested) tab.close();
    }, () => {});
  };

  const learnMoreAnchor = document.createElement('a');
  learnMoreAnchor.href = 'https://telegram.org';
  learnMoreAnchor.target = '_blank';
  learnMoreAnchor.rel = 'noopener noreferrer';

  return (
    <>
      <Portal mount={tab.header}>
        <SaveButton hasChanges={hasChanges() && !saving()} onClick={saveAndClose} />
      </Portal>

      <MediaHeader class={styles.heroHeader}>
        <MediaHeader.Sticker name="ChatAutomation" size={140} restartOnClick={false} />
        <MediaHeader.Title>{i18n('ChatAutomation.HeroTitle')}</MediaHeader.Title>
        <MediaHeader.Subtitle>
          {i18n('ChatAutomation.HeroDescription', [learnMoreAnchor])}
        </MediaHeader.Subtitle>
      </MediaHeader>

      <Section
        caption="ChatAutomation.BotDescription"
        data-chat-automation-section="bot"
      >
        <Show when={store.botId}>
          {(botId) => <BotDialogList userIds={[botId() as UserId]} />}
        </Show>
        <Show when={!store.botId}>
          <div class="input-wrapper">
            <InputFieldTsx
              label="ChatAutomation.BotPlaceholder"
              value={query()}
              onRawInput={updateBotQuery}
              plainText
              instanceRef={(field) => {
                field.input.setAttribute('autocapitalize', 'none');
                field.input.setAttribute('autocorrect', 'off');
                field.input.setAttribute('aria-label', I18n.format('ChatAutomation.BotPlaceholder', true));
                field.input.spellcheck = false;
              }}
            />
          </div>
          <Show when={searching()}>
            <div
              class={styles.searchLoading}
              role="status"
              aria-live="polite"
              aria-label={I18n.format('ChatAutomation.Searching', true)}
            >
              <PreloaderTsx class={styles.searchPreloader} />
            </div>
          </Show>
          <BotDialogList userIds={searchResults()} onAdd={selectBot} />
          <Show when={!searching() && searchFinished() && !searchResults().length}>
            <div class={styles.searchEmpty} role="status" aria-live="polite">
              {i18n(searchFailed() ?
                'ChatAutomation.SearchFailed' :
                (unsupportedUserId() ? 'ChatAutomation.BotUnsupported' : 'ChatAutomation.BotNotFound'))}
            </div>
          </Show>
        </Show>
      </Section>

      <Section
        name="ChatAutomation.AccessibleChats"
        data-chat-automation-section="access"
        contentProps={{
          'role': 'radiogroup',
          'aria-label': I18n.format('ChatAutomation.AccessibleChats', true)
        }}
      >
        <Row clickable={() => setRecipientMode(true)}>
          <Row.CheckboxField>
            <AccessRadio
              checked={store.excludeSelected}
              onChange={() => setRecipientMode(true)}
            />
          </Row.CheckboxField>
          <Row.Title>{i18n('ChatAutomation.AllExcept')}</Row.Title>
        </Row>
        <Row clickable={() => setRecipientMode(false)}>
          <Row.CheckboxField>
            <AccessRadio
              checked={!store.excludeSelected}
              onChange={() => setRecipientMode(false)}
            />
          </Row.CheckboxField>
          <Row.Title>{i18n('ChatAutomation.OnlySelected')}</Row.Title>
        </Row>
      </Section>

      <For each={getChatAutomationRecipientSectionKinds(store.excludeSelected)}>
        {(kind) => (
          <Section
            caption={kind === 'included' ?
              'ChatAutomation.IncludedDescription' :
              'ChatAutomation.ExcludedDescription'}
            data-chat-automation-section={`${kind}-chats`}
          >
            <Row
              class={styles.recipientRow}
              clickable={() => openRecipientSection(kind)}
              role="button"
              tabIndex={0}
            >
              <Row.Title class={styles.recipientTitle}>{i18n(kind === 'included' ?
                'ChatAutomation.IncludedChats' :
                'ChatAutomation.ExcludedChats')}</Row.Title>
              <Row.RightContent class={styles.recipientSummary}>
                <span class={styles.recipientSummaryText}>{getRecipientSummary(kind)}</span>
                <IconTsx class={styles.recipientSummaryIcon} icon="next" aria-hidden="true" />
              </Row.RightContent>
            </Row>
          </Section>
        )}
      </For>

      <Show when={store.botId}>
        <Section
          name="ChatAutomation.Permissions"
          caption="ChatAutomation.PermissionsDescription"
          data-chat-automation-section="permissions"
        >
          <BotPermissions
            rights={store.rights}
            confirmPermissionWarning={confirmPermissionWarning}
            onRightsChange={(rights) => setStore('rights', rights)}
          />
        </Section>
      </Show>

      <Show when={store.botId}>
        <Section>
          <Button
            class="btn-primary btn-transparent danger"
            icon="delete"
            text="ChatAutomation.RemoveBot"
            onClick={removeBot}
          />
        </Section>
      </Show>
    </>
  );
}
