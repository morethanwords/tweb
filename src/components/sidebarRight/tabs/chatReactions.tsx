import {Component, createEffect, createMemo, createSignal, createUniqueId, For, onCleanup, onMount, Show} from 'solid-js';
import {Portal} from 'solid-js/web';
import clamp from '@helpers/number/clamp';
import {cleanEmoji} from '@lib/richTextProcessor/fixEmoji';
import debounce from '@helpers/schedulers/debounce';
import {AvailableReaction, ChatFull, ChatReactions, Reaction} from '@layer';
import {i18n, LangPackKey} from '@lib/langPack';
import rootScope from '@lib/rootScope';
import CheckboxFieldTsx from '@components/checkboxFieldTsx';
import RadioFieldTsx from '@components/radioFieldTsx';
import Row from '@components/rowTsx';
import Section from '@components/section';
import SaveButton from '@components/saveButton';
import RangeSettingSelector from '@components/rangeSettingSelector';
import ReactionStickerPreview from '@components/reactionStickerPreview';
import {toast, toastNew} from '@components/toast';
import {EmoticonsDropdown} from '@components/emoticonsDropdown';
import {EMOTICONS_DROPDOWN_HEIGHT} from '@components/emoticonsDropdown/constants';
import EmojiTab from '@components/emoticonsDropdown/tabs/emoji';
import openBoosts, {getCustomReactionsBoostReason} from '@components/openBoosts';
import {useSuperTab} from '@components/solidJsTabs/superTabProvider';
import {usePromiseCollector} from '@components/solidJsTabs/promiseCollector';
import type {AppChatReactionsTab} from '@components/solidJsTabs/tabs';
import ChatReactionsField, {ChatReactionsFieldApi} from '@components/sidebarRight/tabs/chatReactionsField';
import {
  buildChannelPayload,
  buildGroupPayload,
  ChannelReactionsDraft,
  ChatReactionsCatalogItem,
  DEFAULT_REACTIONS_IN_CHAT_MAX,
  editChannelField,
  isReactionTyping,
  getChannelFieldReactions,
  getRequiredBoostLevel,
  GroupReactionsDraft,
  GroupReactionsMode,
  hasReaction,
  initChannelDraft,
  initGroupDraft,
  insertChannelReaction,
  PickedEmoji,
  pickedEmojiToReaction,
  reactionToDocId,
  ReactionsSavePayload,
  removeChannelReactionAt,
  savePayloadsEqual,
  setChannelEnabled,
  setChannelLimit,
  setChannelPaid,
  setGroupMode,
  toggleGroupReaction
} from '@components/sidebarRight/tabs/chatReactionsState';
import useIsConfirmationNeededOnClose from '@hooks/useIsConfirmationNeededOnClose';
import bindDisposablePicker from '@components/emoticonsDropdown/bindDisposablePicker';
import cloneDOMRect from '@helpers/dom/cloneDOMRect';
import anchorCallback from '@helpers/dom/anchorCallback';
import {getAppWindow, getOverlayRoot} from '@helpers/appWindow';
import {DEFAULT_REACTIONS_UNIQ_MAX} from '@appManagers/utils/reactions/filterReactionsAtUniqCap';
import availableReactionToReaction from '@appManagers/utils/reactions/availableReactionToReaction';
import type {MTAppConfig} from '@/appConfig';

const PICKER_GAP = 8;
const NO_REACTIONS: Reaction[] = [];

const ChatReactionsTab: Component = () => {
  const [tab] = useSuperTab<typeof AppChatReactionsTab>();
  const promiseCollector = usePromiseCollector();
  const managers = tab.managers;
  const middleware = tab.middlewareHelper.get();
  // * the tab is gone from the moment it starts closing: its middleware lives on through the close animation
  let closing = false;
  tab.eventListener.addEventListener('close', () => {
    closing = true;
  });
  const isAlive = () => !closing && middleware();
  const {chatId} = tab.payload;
  const peerId = chatId.toPeerId(true);

  const [loaded, setLoaded] = createSignal(false);
  const [isBroadcast, setIsBroadcast] = createSignal(false);
  const [catalog, setCatalog] = createSignal<AvailableReaction[]>([]);
  const [activeCatalog, setActiveCatalog] = createSignal<AvailableReaction[]>([]);
  const [appConfig, setAppConfig] = createSignal<MTAppConfig>();
  const [saving, setSaving] = createSignal(false);

  const activeEmoticons = createMemo(() => activeCatalog().map((reaction) => reaction.reaction));
  const catalogItems = createMemo<ChatReactionsCatalogItem[]>(() => catalog().map((reaction) => ({
    emoticon: reaction.reaction,
    docId: reaction.select_animation?.id
  })));

  const showSelectionLimitError = () => {
    toastNew({langPackKey: 'ReactionMaxCountError', langPackArguments: [getSelectionCeiling()]});
  };

  const showSaveError = (error: ApiError) => {
    // * the account session the save was made in is over: its answer is dropped, and there is nothing to say
    if(error?.type === 'MIDDLEWARE') {
      return;
    }

    console.error('setChatAvailableReactions error', error);
    if(error?.type === 'REACTIONS_TOO_MANY') {
      showSelectionLimitError();
    } else if(error?.type) {
      toast(error.type);
    } else {
      toastNew({langPackKey: 'Error.AnError'});
    }
  };

  // * Groups: All / Some / None, saved by itself a moment after a change and on leaving

  const [groupDraft, setGroupDraft] = createSignal<GroupReactionsDraft>();
  let groupTouched = false;

  const saveGroup = () => {
    saveGroupDebounced.clearTimeout();
    const draft = groupDraft();
    if(!draft) {
      return;
    }

    const {reactions} = buildGroupPayload(draft);
    managers.appChatsManager.setChatAvailableReactions(chatId, reactions).catch(showSaveError);
  };

  const saveGroupDebounced = debounce(saveGroup, 3000, false, true);

  const changeGroupDraft = (draft: GroupReactionsDraft) => {
    if(draft === groupDraft()) {
      return;
    }

    groupTouched = true;
    setGroupDraft(draft);
    saveGroupDebounced();
  };

  // * the cache changes only once the server accepted a save, so the autosave of an editor closed a moment ago
  // * can land after this one opened: a draft nobody touched here follows it
  // * (one that comes while the screen still loads is read again once it has loaded: `fullUpdatedWhileLoading`)
  let fullUpdatedWhileLoading = false;
  tab.listenerSetter.add(rootScope)('chat_full_update', (id) => {
    if(id !== chatId || groupTouched) {
      return;
    }

    if(!groupDraft()) {
      fullUpdatedWhileLoading = true;
      return;
    }

    managers.appProfileManager.getChatFull(chatId).then((chatFull) => {
      if(groupTouched || chatFull._ === 'communityFull') {
        return;
      }

      setGroupDraft(initGroupDraft(chatFull.available_reactions));
    });
  });

  const getGroupCaption = (): LangPackKey => {
    const mode = groupDraft()?.mode;
    return mode === 'all' ? 'EnableAllReactionsInfo' : (mode === 'none' ? 'DisableReactionsInfo' : 'EnableSomeReactionsInfo');
  };

  const groupModes: [GroupReactionsMode, LangPackKey][] = [
    ['all', 'AllReactions'],
    ['some', 'SomeReactions'],
    ['none', 'NoReactions']
  ];
  const radioName = createUniqueId();

  // * Channels: the modern editor, saved by its button

  const [channelDraft, setChannelDraft] = createSignal<ChannelReactionsDraft>();
  const [confirmed, setConfirmed] = createSignal<ReactionsSavePayload>();
  const [paidShown, setPaidShown] = createSignal(false);
  const [boostLevel, setBoostLevel] = createSignal<number>();
  const [pickerOpen, setPickerOpen] = createSignal(false);

  const getSelectionCeiling = () => appConfig()?.reactions_in_chat_max || DEFAULT_REACTIONS_IN_CHAT_MAX;
  const getUniqMax = () => appConfig()?.reactions_uniq_max || DEFAULT_REACTIONS_UNIQ_MAX;

  const channelPayload = createMemo(() => {
    const draft = channelDraft();
    return draft && buildChannelPayload(draft, {activeEmoticons: activeEmoticons(), paidShown: paidShown()});
  });
  const hasChannelChanges = () => {
    const payload = channelPayload();
    return !!payload && !savePayloadsEqual(payload, confirmed());
  };
  const requiredLevel = () => {
    const draft = channelDraft();
    return draft ? getRequiredBoostLevel(draft) : 0;
  };
  const needsBoosts = () => boostLevel() !== undefined && requiredLevel() > boostLevel();

  /** The channel's level as the server has it now (it may have been boosted meanwhile); undefined when not known */
  const refreshBoostLevel = () => {
    return managers.appBoostsManager.getBoostsStatus(peerId).then((status) => {
      const level = status.level ?? 0;
      setBoostLevel(level);
      return level;
    }, (err): number => {
      console.error('chat reactions: boosts status', err);
      return undefined;
    });
  };

  const openReactionsBoosts = (explain?: boolean) => {
    const reason = getCustomReactionsBoostReason(requiredLevel());
    // * the Boosts tab says nothing about why it was opened, unlike the popup the others get
    if(explain) managers.appProfileManager.canViewStatistics(peerId).then((isAdmin) => {
      if(isAdmin && isAlive()) toastNew({langPackKey: reason.descriptionLangKey, langPackArguments: reason.descriptionArgs});
    });

    openBoosts({
      peerId,
      slider: tab.slider,
      managers,
      reason,
      isAlive
    });
  };

  const changeChannelDraft = (draft: ChannelReactionsDraft) => {
    setChannelDraft(draft);
  };

  const fieldReactions = createMemo(() => {
    const draft = channelDraft();
    return draft ? getChannelFieldReactions(draft) : NO_REACTIONS;
  });
  let field: ChatReactionsFieldApi;

  /** An edit of the field's text: what of it is reactions goes in the draft */
  const onFieldEdit = (tokens: PickedEmoji[], caret: number) => {
    const result = editChannelField(channelDraft(), tokens, caret, {
      catalog: catalogItems(),
      activeEmoticons: activeEmoticons(),
      paidShown: paidShown(),
      max: getSelectionCeiling()
    });
    if(result.refused === 'limit') {
      showSelectionLimitError();
    }

    changeChannelDraft(result.draft);
    return result.caret;
  };

  /** Resolves to whether the server took the reactions; the button closes the tab once it has */
  const saveChannel = async(close: boolean) => {
    const payload = channelPayload();
    if(saving() || !payload) {
      return false;
    }

    setSaving(true);
    picker?.dropdown.toggle(false);
    try {
      // * custom emoji past the channel's level, as it is now: boosting first, nothing is sent
      const required = requiredLevel();
      if(required && required > await refreshBoostLevel()) {
        if(isAlive()) openReactionsBoosts(true);
        return false;
      }

      // * the editor was discarded while the level was being read: what it held is not sent
      if(!isAlive()) {
        return false;
      }

      await managers.appChatsManager.setChatAvailableReactions(chatId, payload.reactions, payload.options);
      setConfirmed(payload);
      // * the editor was closed (discarded) while the request was in flight: there is no tab to close
      if(close && isAlive()) tab.close();
      return true;
    } catch(err) {
      if(!isAlive()) {
        return false;
      }

      const error = err as ApiError;
      if(error?.type === 'BOOSTS_REQUIRED') {
        openReactionsBoosts(true);
      } else {
        showSaveError(error);
      }

      return false;
    } finally {
      setSaving(false);
    }
  };

  tab.isConfirmationNeededOnClose = useIsConfirmationNeededOnClose({
    hasChanges: () => isBroadcast() && hasChannelChanges(),
    // a failed save keeps the tab open, changes and all
    saveAllSettings: async() => {
      if(!await saveChannel(false)) throw new Error('CHAT_REACTIONS_NOT_SAVED');
    },
    descriptionLangKey: 'ReactionApplyChangesDialog',
    waitForSave: true
  });

  const togglePaid = (paid: boolean) => {
    changeChannelDraft(setChannelPaid(channelDraft(), paid));
  };

  // * The emoji picker: the active standard reactions first, then every pack and the search — the
  // * channel's boosts decide about custom emoji here, not the admin's own Premium

  let fieldElement: HTMLElement;
  let picker: {dropdown: EmoticonsDropdown, emojiTab: EmojiTab, closing?: boolean};

  const selectedCustomDocIds = () => (channelDraft()?.reactions || []).filter((reaction) => reaction._ === 'reactionCustomEmoji').map((reaction) => reaction.document_id);
  const pickerDocIds = () => (channelDraft()?.reactions || []).map((reaction) => reactionToDocId(reaction, catalogItems())).filter(Boolean);

  createEffect(() => {
    const docIds = pickerDocIds();
    if(pickerOpen()) picker?.emojiTab.setActiveDocIds(docIds);
  });

  const onPick = (emoji: PickedEmoji) => {
    const reaction = pickedEmojiToReaction(emoji, catalogItems());
    const draft = channelDraft();
    if(!reaction || !draft || saving()) {
      return;
    }

    // * the caret among the field's reactions, Stars first when on
    const caret = field.getCaret();
    const paidOffset = +draft.paid;

    // * a picked one taken again is taken off (Android)
    const index = getChannelFieldReactions(draft).findIndex((other) => hasReaction([other], reaction));
    if(index !== -1) {
      field.setNextCaret(index < caret ? caret - 1 : caret);
      changeChannelDraft(reaction._ === 'reactionPaid' ? setChannelPaid(draft, false) : removeChannelReactionAt(draft, index - paidOffset));
      return;
    }

    const freeIndex = Math.max(0, caret - paidOffset);
    const result = insertChannelReaction(draft, reaction, freeIndex, getSelectionCeiling());
    if(result.refused === 'limit') {
      showSelectionLimitError();
      return;
    }

    if(result.refused) {
      return;
    }

    // * Stars come in first, anything else after the caret
    field.setNextCaret(reaction._ === 'reactionPaid' ? caret + 1 : Math.min(freeIndex, draft.reactions.length) + paidOffset + 1);
    changeChannelDraft(result.draft);
  };

  const openPicker = () => {
    if(saving()) {
      return;
    }

    if(picker) {
      // * a click on the field while it closes is the click that closed it
      if(!picker.closing) picker.dropdown.toggle(false);
      return;
    }

    const activeDocIds = activeCatalog().map((reaction) => reaction.select_animation?.id).filter(Boolean);
    // * the channel's custom reactions come right after them, so that each can be taken off from here
    // * (their packs may not be the admin's, and the field has no Backspace on a touch device)
    const getMainDocIds = () => [...activeDocIds, ...selectedCustomDocIds()];
    const emojiTab = new EmojiTab({
      managers,
      noRegularEmoji: true,
      noSearchGroups: true,
      canUsePremiumEmojiAlways: true,
      packsWithoutPremium: true,
      mainSets: () => [Promise.resolve(getMainDocIds())],
      // * a standard emoji found is a reaction only when the catalog has it active (an inactive one cannot be
      // * newly allowed), and then it is its animation
      searchFetcher: async(q) => {
        const emojis = await managers.appEmojiManager.prepareAndSearchEmojis({q, limit: Infinity, minChars: 1, addCustom: true});
        const items = catalogItems();
        const active = new Set(activeEmoticons());
        return {
          emojis: emojis.map((emoji) => {
            if(emoji.docId) return emoji;
            const emoticon = cleanEmoji(emoji.emoji);
            const docId = active.has(emoticon) && items.find((item) => item.emoticon === emoticon)?.docId;
            return docId ? {emoji: emoji.emoji, docId} : undefined;
          }).filter(Boolean)
        };
      },
      onClick: onPick
    });

    const dropdown = new EmoticonsDropdown({
      tabsToRender: [emojiTab],
      customParentElement: getOverlayRoot,
      getOpenPosition: () => {
        const rect = fieldElement.getBoundingClientRect();
        const cloned = cloneDOMRect(rect);
        cloned.top = rect.bottom + PICKER_GAP;
        if(cloned.top + EMOTICONS_DROPDOWN_HEIGHT > getAppWindow().innerHeight) {
          cloned.top = Math.max(PICKER_GAP, rect.top - EMOTICONS_DROPDOWN_HEIGHT - PICKER_GAP);
        }

        return cloned;
      }
    });

    // * with the keyboard layer the picker holds the focus while open and gives it back to the field
    picker = {dropdown, emojiTab};
    emojiTab.setActiveDocIds(pickerDocIds());
    setPickerOpen(true);

    bindDisposablePicker(dropdown, {
      returnFocusTo: fieldElement,
      onClose: () => {
        picker.closing = true;
      },
      onClosed: () => {
        picker = undefined;
        setPickerOpen(false);
      }
    });

    dropdown.onButtonClick();
  };

  onCleanup(() => {
    picker?.dropdown.hideAndDestroy();
    picker = undefined;
  });

  // * Loading

  onMount(() => {
    tab.eventListener.addEventListener('destroy', () => {
      if(saveGroupDebounced.isDebounced()) {
        saveGroup();
      }
    }, {once: true});

    promiseCollector.collect((async() => {
      const [reactions, activeReactions, loadedChatFull, broadcast, config] = await Promise.all([
        managers.appReactionsManager.getAvailableReactions(),
        managers.appReactionsManager.getActiveAvailableReactions(),
        managers.appProfileManager.getChatFull(chatId),
        managers.appChatsManager.isBroadcast(chatId),
        managers.apiManager.getAppConfig()
      ]);

      let chatFull = loadedChatFull;
      // * an update that came meanwhile is in the cache by now
      while(fullUpdatedWhileLoading) {
        fullUpdatedWhileLoading = false;
        chatFull = await managers.appProfileManager.getChatFull(chatId);
      }

      const full = chatFull._ === 'communityFull' ? undefined : chatFull as ChatFull.channelFull | ChatFull.chatFull;
      const available: ChatReactions = full?.available_reactions;
      setCatalog(reactions);
      setActiveCatalog(activeReactions);
      setAppConfig(config);
      setIsBroadcast(broadcast);

      if(!broadcast) {
        setGroupDraft(initGroupDraft(available));
        setLoaded(true);
        return;
      }

      const channelFull = full as ChatFull.channelFull;
      const paid = !!channelFull?.pFlags.paid_reactions_available;
      setPaidShown(!!(channelFull?.pFlags.paid_media_allowed || paid));
      const uniqMax = getUniqMax();
      const draft = initChannelDraft({
        available,
        paid,
        limit: clamp(full?.reactions_limit || uniqMax, 1, uniqMax),
        activeEmoticons: activeEmoticons()
      });
      setChannelDraft(draft);
      setConfirmed(buildChannelPayload(draft, {activeEmoticons: activeEmoticons(), paidShown: paidShown()}));
      setLoaded(true);

      // * the level is only for the hint and the check before sending (asked again then): the server checks it anyway
      refreshBoostLevel();
    })());
  });

  const boostHint = () => {
    const reason = getCustomReactionsBoostReason(requiredLevel());
    const anchor = anchorCallback(() => openReactionsBoosts());
    anchor.append(i18n('BoostChannel'));
    return (
      <>
        {i18n(reason.descriptionLangKey, reason.descriptionArgs)}
        {' '}
        {anchor}
      </>
    );
  };

  const GroupScreen = () => (
    <>
      <Section name="AvailableReactions" caption={getGroupCaption()}>
        <form>
          <For each={groupModes}>{([mode, langPackKey]) => (
            <Row>
              <Row.RadioField>
                <RadioFieldTsx
                  class="disable-hover"
                  checked={groupDraft().mode === mode}
                  name={radioName}
                  value={mode}
                  onChange={(checked) => checked && changeGroupDraft(setGroupMode(groupDraft(), mode, activeEmoticons()))}
                />
              </Row.RadioField>
              <Row.Title>{i18n(langPackKey)}</Row.Title>
            </Row>
          )}</For>
        </form>
      </Section>
      <Show when={groupDraft().mode === 'some'}>
        <Section name="OnlyAllowThisReactions">
          <For each={activeCatalog()}>{(availableReaction) => {
            const reaction = availableReactionToReaction(availableReaction);
            return (
              <Row havePadding>
                <Row.CheckboxFieldToggle>
                  <CheckboxFieldTsx
                    class="disable-hover"
                    checked={hasReaction(groupDraft().reactions, reaction)}
                    toggle
                    onChange={(checked) => changeGroupDraft(toggleGroupReaction(groupDraft(), reaction, checked))}
                  />
                </Row.CheckboxFieldToggle>
                <Row.Title>{availableReaction.title}</Row.Title>
                <ReactionStickerPreview sticker={availableReaction.static_icon} />
              </Row>
            );
          }}</For>
        </Section>
      </Show>
    </>
  );

  const ChannelScreen = () => (
    <>
      <Portal mount={tab.header}>
        <SaveButton hasChanges={hasChannelChanges()} saving={saving()} onClick={() => saveChannel(true)} />
      </Portal>

      <Section caption="ReactionAddEmojiFromAnyPack">
        <Row>
          <Row.CheckboxFieldToggle>
            <CheckboxFieldTsx
              class="disable-hover"
              checked={channelDraft().enabled}
              toggle
              disabled={saving()}
              onChange={(enabled) => changeChannelDraft(setChannelEnabled(channelDraft(), enabled, activeEmoticons()))}
            />
          </Row.CheckboxFieldToggle>
          <Row.Title>{i18n('AllowReactions')}</Row.Title>
        </Row>
      </Section>

      <Show when={channelDraft().enabled}>
        <Section
          name="AvailableReactions"
          caption={(
            <>
              {i18n('ReactionCreateOwnEmojiPacks')}
              <Show when={needsBoosts()}>
                <br />
                {boostHint()}
              </Show>
            </>
          )}
        >
          <div class="input-wrapper">
            <ChatReactionsField
              managers={managers}
              reactions={fieldReactions()}
              catalog={catalogItems()}
              pickerOpen={pickerOpen()}
              disabled={saving()}
              onEdit={onFieldEdit}
              canType={(data) => isReactionTyping(data, {catalog: catalogItems(), activeEmoticons: activeEmoticons(), paidShown: paidShown()})}
              onOpenPicker={openPicker}
              ref={(api) => field = api}
              inputRef={(el) => fieldElement = el}
            />
          </div>
        </Section>

        <Section caption="MaximumReactionsInfo">
          <RangeSettingSelector
            textLeft={i18n('MaximumReactionsHeader')}
            textRight={(value) => <>{value}</>}
            step={1}
            value={channelDraft().limit}
            minValue={1}
            maxValue={getUniqMax()}
            disabled={saving()}
            onChange={(value) => changeChannelDraft(setChannelLimit(channelDraft(), Math.round(value)))}
          />
        </Section>

        <Show when={paidShown()}>
          <Section caption="ChannelEnablePaidReactionsInfo">
            <Row>
              <Row.CheckboxFieldToggle>
                <CheckboxFieldTsx
                  class="disable-hover"
                  checked={channelDraft().paid}
                  toggle
                  disabled={saving()}
                  onChange={togglePaid}
                />
              </Row.CheckboxFieldToggle>
              <Row.Title>{i18n('ChannelEnablePaidReactions')}</Row.Title>
            </Row>
          </Section>
        </Show>
      </Show>
    </>
  );

  return (
    <Show when={loaded()}>
      <Show when={isBroadcast()} fallback={<GroupScreen />}>
        <ChannelScreen />
      </Show>
    </Show>
  );
};

export default ChatReactionsTab;
