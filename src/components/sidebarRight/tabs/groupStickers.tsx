import {Component, For, JSX, Show, createEffect, createResource, createSignal, on, onCleanup} from 'solid-js';
import anchorCallback from '@helpers/dom/anchorCallback';
import cancelEvent from '@helpers/dom/cancelEvent';
import {subscribeOn} from '@helpers/solid/subscribeOn';
import {Chat, MessagesAllStickers, StickerSet} from '@layer';
import rootScope from '@lib/rootScope';
import getGroupStickerSet from '@appManagers/utils/chats/getGroupStickerSet';
import {getStickerSetInputByStickerSet} from '@lib/appManagers/utils/stickers/getStickerSetInput';
import Button from '@components/buttonTsx';
import LazyLoadQueue from '@components/lazyLoadQueue';
import openBoosts from '@components/openBoosts';
import showStickersPopup from '@components/popups/stickers';
import RadioFieldTsx from '@components/radioFieldTsx';
import Section from '@components/section';
import {SearchEmpty, SearchLoading} from '@components/searchStatus';
import wrapStickerSetThumb from '@components/wrappers/stickerSetThumb';
import {usePromiseCollector} from '@components/solidJsTabs/promiseCollector';
import {useSuperTab} from '@components/solidJsTabs/superTabProvider';
import {useHotReloadGuard} from '@lib/solidjs/hotReloadGuard';
import type {AppGroupStickersTab} from '@components/solidJsTabs/tabs';
import styles from '@components/sidebarRight/tabs/groupStickers.module.scss';

type AppGroupStickersTabType = typeof AppGroupStickersTab;

const SEARCH_DEBOUNCE = 300;
const THUMB_SIZE = 36;
const STICKERS_BOT_USERNAME = 'stickers';

/**
 * Accepts what a user is likely to paste: a full `t.me/addstickers/name` link,
 * a bare short name or a `@name`.
 */
export function extractStickerSetShortName(value: string) {
  const trimmed = value.trim();
  const match = /(?:^|\/)(?:addstickers|addemoji)\/([a-zA-Z0-9_]+)/.exec(trimmed);
  if(match) {
    return match[1];
  }

  return /^@?[a-zA-Z0-9_]+$/.test(trimmed) ? trimmed.replace(/^@/, '') : '';
}

async function loadGroupStickersData(tab: InstanceType<AppGroupStickersTabType>) {
  const {chatId} = tab.payload;
  // the payload leaves it out for the sticker set variant, and it is compared against
  // a set's own flag further down, so it must be a boolean rather than undefined
  const isEmoji = !!tab.payload.isEmoji;
  const [chatFull, chat, appConfig, allStickers] = await Promise.all([
    tab.managers.appProfileManager.getChatFull(chatId),
    tab.managers.appChatsManager.getChat(chatId),
    tab.managers.apiManager.getAppConfig(),
    isEmoji ?
      tab.managers.appStickersManager.getEmojiStickers() :
      tab.managers.appStickersManager.getAllStickers()
  ]);

  return {
    chatId,
    isEmoji,
    appConfig,
    chat: chat as Chat.channel,
    currentSet: getGroupStickerSet(chatFull, isEmoji),
    sets: (allStickers as MessagesAllStickers.messagesAllStickers).sets
  };
}

type GroupStickersData = Awaited<ReturnType<typeof loadGroupStickersData>>;

function StickerSetRow(props: {
  set: StickerSet.stickerSet,
  isEmoji: boolean,
  lazyLoadQueue: LazyLoadQueue,
  action?: () => JSX.Element,
  radioChecked?: boolean,
  radioName?: string,
  radioValue?: string,
  onRadioChange?: (checked: boolean) => void,
  onClick?: () => void
}) {
  const [tab] = useSuperTab<AppGroupStickersTabType>();
  const {Row, i18n, wrapEmojiText} = useHotReloadGuard();

  const thumb = document.createElement('div');
  wrapStickerSetThumb({
    set: props.set,
    container: thumb,
    group: 'GENERAL-SETTINGS',
    lazyLoadQueue: props.lazyLoadQueue,
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    autoplay: true,
    middleware: tab.middlewareHelper.get()
  });

  return (
    <Row
      class={styles.setRow}
      clickable={props.radioName ? undefined : props.onClick}
    >
      <Show when={props.radioName}>
        <Row.RadioField>
          <RadioFieldTsx
            alignRight
            class="disable-hover"
            checked={props.radioChecked}
            name={props.radioName}
            value={props.radioValue}
            onChange={props.onRadioChange}
          />
        </Row.RadioField>
      </Show>
      <Row.Media>{thumb}</Row.Media>
      <Row.Title>{wrapEmojiText(props.set.title)}</Row.Title>
      <Row.Subtitle>{i18n(props.isEmoji ? 'EmojiCount' : 'Stickers', [props.set.count])}</Row.Subtitle>
      <Show when={props.action}>
        <Row.RightContent
          class={styles.setAction}
          onClick={(event) => event.stopPropagation()}
        >
          {props.action()}
        </Row.RightContent>
      </Show>
    </Row>
  );
}

function GroupStickersForm(props: {data: GroupStickersData}) {
  const [tab] = useSuperTab<AppGroupStickersTabType>();
  const {
    I18n,
    InputFieldTsx,
    appImManager,
    hideToast,
    i18n,
    toastNew
  } = useHotReloadGuard();
  const {chatId, isEmoji} = props.data;

  const lazyLoadQueue = new LazyLoadQueue();
  const [chat, setChat] = createSignal(props.data.chat);
  const [currentSet, setCurrentSet] = createSignal(props.data.currentSet);
  const [query, setQuery] = createSignal(props.data.currentSet?.short_name || '');
  const [searching, setSearching] = createSignal(false);
  const [searchFinished, setSearchFinished] = createSignal(false);
  const [foundSet, setFoundSet] = createSignal<StickerSet.stickerSet>();

  let searchTimer: number;
  let searchRequestId = 0;
  let applyRevision = 0;
  let pendingApplyCount = 0;
  let applyQueue = Promise.resolve();
  let confirmedSet = props.data.currentSet;
  let disposed = false;

  onCleanup(() => {
    disposed = true;
    ++applyRevision;
    ++searchRequestId;
    window.clearTimeout(searchTimer);
    lazyLoadQueue.clear();
  });

  createEffect(on(query, (value) => {
    ++searchRequestId;
    window.clearTimeout(searchTimer);
    setFoundSet(undefined);
    setSearchFinished(false);

    const shortName = extractStickerSetShortName(value);
    if(!shortName) {
      setSearching(false);
      return;
    }

    const requestId = searchRequestId;
    setSearching(true);
    searchTimer = window.setTimeout(async() => {
      const stickerSet = await tab.managers.appStickersManager.getStickerSet(shortName);
      if(requestId !== searchRequestId) return;

      const set = stickerSet?.set;
      setFoundSet(set && !!set.pFlags?.emojis === isEmoji ? set : undefined);
      setSearching(false);
      setSearchFinished(true);
    }, SEARCH_DEBOUNCE);
  }, {defer: true}));

  // another admin (or another session) may replace the pack while the tab is open
  subscribeOn(rootScope)('chat_full_update', async(updatedChatId) => {
    if(updatedChatId !== chatId) return;

    const chatFull = await tab.managers.appProfileManager.getChatFull(chatId);
    confirmedSet = getGroupStickerSet(chatFull, isEmoji);
    if(!pendingApplyCount) {
      setCurrentSet(confirmedSet);
    }
  });

  // the level is what gates applying a pack, and boosting the group raises it from under
  // the open tab — the gate has to follow it rather than the level the tab opened on
  subscribeOn(rootScope)('chat_update', async(updatedChatId) => {
    if(updatedChatId !== chatId) return;

    setChat(await tab.managers.appChatsManager.getChat(chatId) as Chat.channel);
  });

  const isSearching = () => searching() || searchFinished();
  // the row under the search field doubles as the currently set pack when nothing is being searched
  const displayedSet = () => isSearching() ? foundSet() : currentSet();
  const isCurrent = (set: StickerSet.stickerSet) => currentSet()?.id === set.id;

  const requiredLevel = () => props.data.appConfig.group_emoji_stickers_level_min ?? 0;
  const hasRequiredLevel = () => (chat()?.level ?? 0) >= requiredLevel();
  const showLevelToast = () => {
    toastNew({
      langPackKey: 'GroupEmojiPack.LevelMin',
      langPackArguments: [
        requiredLevel(),
        anchorCallback(() => {
          hideToast();
          openBoosts({
            peerId: chatId.toPeerId(true),
            slider: tab.slider,
            reason: {
              titleLangKey: 'GroupEmojiPack.BoostTitle',
              descriptionLangKey: 'GroupEmojiPack.BoostDescription',
              descriptionArgs: [requiredLevel()]
            }
          });
        })
      ]
    });
  };

  const applySet = async(set?: StickerSet.stickerSet) => {
    const previousSet = currentSet();
    const revision = ++applyRevision;
    setCurrentSet(set);

    if(set && isEmoji && !hasRequiredLevel()) {
      showLevelToast();
      setCurrentSet(previousSet);
      --applyRevision;
      return;
    }

    ++pendingApplyCount;
    const request: Promise<unknown> = applyQueue.then(() => (
      tab.managers.appChatsManager.setGroupStickerSet(chatId, set, isEmoji)
    ));
    applyQueue = request.then((): void => undefined, (): void => undefined);

    try {
      await request;
    } catch(err) {
      if(!disposed && revision === applyRevision) {
        setCurrentSet(confirmedSet);
        toastNew({langPackKey: 'Error.AnError'});
      }
      return;
    } finally {
      --pendingApplyCount;
    }

    confirmedSet = set;
    if(disposed || revision !== applyRevision) {
      return;
    }

    // keep whatever the user typed when it already points at this set, so applying doesn't re-search
    if(extractStickerSetShortName(query()) !== set?.short_name) {
      setQuery(set?.short_name || '');
    }
    toastNew({
      langPackKey: set ?
        (isEmoji ? 'GroupEmojiPack.Updated' : 'GroupStickers.Updated') :
        (isEmoji ? 'GroupEmojiPack.Removed' : 'GroupStickers.Removed')
    });
  };

  const renderSearchedSetAction = (set: StickerSet.stickerSet) => {
    if(isCurrent(set)) {
      return (
        <Button
          class="btn-icon danger"
          icon="delete"
          aria-label={I18n.format(isEmoji ? 'GroupEmojiPack.Remove' : 'GroupStickers.Remove', true)}
          onClick={(event) => {
            cancelEvent(event);
            return applySet();
          }}
        />
      );
    }

    return (
      <Button
        class="btn-primary btn-color-primary btn-control-small"
        text="Stickers.SearchAdd"
        onClick={(event) => {
          cancelEvent(event);
          return applySet(set);
        }}
      />
    );
  };

  return (
    <>
      <Section
        caption={isEmoji ? 'GroupEmojiPack.LinkInfo' : 'GroupStickers.LinkInfo'}
        data-group-stickers-section="search"
      >
        <div class="input-wrapper">
          <InputFieldTsx
            label={isEmoji ? 'GroupEmojiPack.LinkPlaceholder' : 'GroupStickers.LinkPlaceholder'}
            value={query()}
            onRawInput={setQuery}
            plainText
            instanceRef={(field) => {
              field.input.setAttribute('autocapitalize', 'none');
              field.input.setAttribute('autocorrect', 'off');
              field.input.spellcheck = false;
            }}
          />
        </div>
        <Show when={searching()}>
          <SearchLoading aria-label={I18n.format('Loading', true)} />
        </Show>
        {/* keyed: the row renders its thumb once, so a different set needs a new row */}
        <Show when={displayedSet()} keyed>
          {(set) => (
            <StickerSetRow
              set={set}
              isEmoji={isEmoji}
              lazyLoadQueue={lazyLoadQueue}
              action={() => renderSearchedSetAction(set)}
              onClick={() => showStickersPopup(getStickerSetInputByStickerSet(set), isEmoji)}
            />
          )}
        </Show>
        <Show when={searchFinished() && !foundSet()}>
          <SearchEmpty>{i18n(isEmoji ? 'AddEmojiNotFound' : 'GroupStickers.NotFound')}</SearchEmpty>
        </Show>
      </Section>

      <Section
        name={isEmoji ? 'GroupEmojiPack.MyPacks' : 'GroupStickers.MySets'}
        caption={i18n(
          isEmoji ? 'GroupEmojiPack.CreateInfo' : 'GroupStickers.CreateInfo',
          [anchorCallback(() => appImManager.openUsername({userName: STICKERS_BOT_USERNAME}))]
        )}
        data-group-stickers-section="own"
      >
        <For each={props.data.sets}>
          {(set) => (
            <StickerSetRow
              set={set}
              isEmoji={isEmoji}
              lazyLoadQueue={lazyLoadQueue}
              radioChecked={isCurrent(set)}
              radioName={`group-${isEmoji ? 'emoji' : 'sticker'}-${chatId}`}
              radioValue={String(set.id)}
              onRadioChange={(checked) => checked && !isCurrent(set) && applySet(set)}
            />
          )}
        </For>
      </Section>
    </>
  );
}

const GroupStickersTab: Component = () => {
  const [tab] = useSuperTab<AppGroupStickersTabType>();
  const promiseCollector = usePromiseCollector();
  const initialPromise = loadGroupStickersData(tab);
  promiseCollector.collect(initialPromise);

  const [data] = createResource(() => initialPromise);

  return (
    <Show when={data()} keyed>
      {(loaded) => <GroupStickersForm data={loaded} />}
    </Show>
  );
};

export default GroupStickersTab;
