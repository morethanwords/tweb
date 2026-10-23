import {Accessor, createEffect, createMemo, createSignal, For, JSX, on, onCleanup, onMount, Show, untrack} from 'solid-js';
import {insert} from 'solid-js/web';
import PopupElement, {createPopup} from '@components/popups/indexTsx';
import {ChipTab, ChipTabs} from '@components/chipTabs';
import InputSearch from '@components/inputSearch';
import Scrollable from '@components/scrollable';
import ButtonMenuToggle from '@components/buttonMenuToggle';
import {ButtonMenuItemOptionsVerifiable} from '@components/buttonMenu';
import {DialogElement} from '@components/dialogElement';
import {processDialogElementForReaction} from '@components/popups/reactedList';
import {wrapStoryMedia} from '@components/stories/preview';
import {IconTsx} from '@components/iconTsx';
import ButtonTsx from '@components/buttonTsx';
import A11yButton from '@components/a11yButton';
import {toastNew} from '@components/toast';
import wrapPeerTitle from '@components/wrappers/peerTitle';
import blockUserWithConfirmation, {unblockUser} from '@components/blockUser';
import confirmDeleteContacts from '@components/popups/deleteContacts';
import createContextMenu from '@helpers/dom/createContextMenu';
import findUpClassName from '@helpers/dom/findUpClassName';
import {handleTabKeyDown} from '@helpers/dom/tabList';
import formatNumber from '@helpers/number/formatNumber';
import {attachClickEvent} from '@helpers/dom/clickEvent';
import ensureButtonSemantics from '@helpers/dom/ensureButtonSemantics';
import createMiddleware from '@helpers/solid/createMiddleware';
import classNames from '@helpers/string/classNames';
import tsNow from '@helpers/tsNow';
import {StoryItem} from '@layer';
import type {StoryInteraction, StoryInteractionsList} from '@appManagers/appStoriesManager';
import apiManagerProxy from '@lib/apiManagerProxy';
import rootScope from '@lib/rootScope';
import I18n, {i18n, LangPackKey} from '@lib/langPack';
import {AppManagers} from '@lib/managers';
import {bindManagersToSession} from '@lib/accounts/bindManagersToAccount';
import {hotReloadGuard} from '@lib/solidjs/hotReloadGuardProvider';
import Modes from '@config/modes';
import usePremium from '@stores/premium';
import usePremiumFeaturesHidden from '@stores/premiumFeaturesHidden';
import styles from '@components/popups/storyViewers.module.scss';

type ListMode = 'all' | 'contacts';
type SortMode = 'reactions' | 'reposts' | 'recent';

const LOAD_COUNT = 50;
// * the tabs and the search come with this many views, and the order with as many again and half as many
// * reactions, or reposts of a channel's story (iOS)
const MIN_VIEWS_TO_FILTER = 20;
const MIN_TO_SORT = 10;
// * how long after a story expires its viewers are kept for an account without Premium (Android, Web A)
const VIEWERS_EXPIRE_PERIOD = 86400;

const SORT_ICONS: {[key in SortMode]: Icon} = {
  reactions: 'reactions',
  reposts: 'storyrepost',
  recent: 'recent'
};

const SORT_TEXTS: {[key in SortMode]: LangPackKey} = {
  reactions: 'SortByReactions',
  reposts: 'SortByReposts',
  recent: 'SortByTime'
};

export type StoryViewersPopupOptions = {
  peerId: PeerId,
  storyId: number,
  // * the stories beside it, which the list goes through with the viewer behind it (Android's strip of them,
  // * iOS's swipe across the story above the list)
  stories?: Accessor<StoryItem[]>,
  onStoryChange?: (storyId: number) => void,
  onOpenPeer: (peerId: PeerId) => void,
  onOpenStory: (peerId: PeerId, storyId: number) => void,
  onOpenMessage: (peerId: PeerId, mid: number) => void,
  onClose?: () => void
};

/**
 * Who saw one's own story, with what they reacted, and who reposted or forwarded it — or, for a channel's
 * or a group's story, who reacted to it and shared it, which the admins who edit its stories see (iOS
 * StoryItemSetViewListComponent, Android SelfStoryViewsPage)
 */
export default async function showStoryViewersPopup(options: StoryViewersPopupOptions) {
  const {peerId, storyId} = options;
  // * of the account the story is watched on: one switched to meanwhile is asked nothing
  const managers = bindManagersToSession(rootScope.managers);
  const isUser = peerId.isUser();
  const [story, appConfig] = await Promise.all([
    managers.appStoriesManager.getStoryById(peerId, storyId),
    apiManagerProxy.getAppConfig()
  ]).catch((): [undefined, undefined] => [undefined, undefined]);
  if(!story) {
    // * no popup: what waited for it to close goes on
    options.onClose?.();
    return;
  }

  const expirePeriod = appConfig?.story_viewers_expire_period ?? VIEWERS_EXPIRE_PERIOD;
  createPopup(() => (
    <StoryViewers
      {...options}
      managers={managers}
      isUser={isUser}
      story={story}
      expirePeriod={expirePeriod}
    />
  ));
}

function StoryViewers(props: StoryViewersPopupOptions & {
  managers: AppManagers,
  isUser: boolean,
  story: StoryItem.storyItem,
  expirePeriod: number
}) {
  const {managers, isUser, peerId} = props;
  const premium = usePremium();
  const premiumFeaturesHidden = usePremiumFeaturesHidden();
  const [show, setShow] = createSignal(false);
  const [story, setStory] = createSignal(props.story, {equals: false});
  const [chosenListMode, setListMode] = createSignal<ListMode>('all');
  // * a person's story is ordered by reactions, a channel's by reposts, first (iOS)
  const defaultSortMode: SortMode = isUser ? 'reactions' : 'reposts';
  const [chosenSortMode, setSortMode] = createSignal<SortMode>(defaultSortMode);
  const [typedQuery, setQuery] = createSignal('');
  const [list, setList] = createSignal<StoryInteractionsList>();
  const [items, setItems] = createSignal<StoryInteraction[]>([]);
  const [isEnd, setIsEnd] = createSignal(false);
  // * the views and the hiding a viewer's menu changed: the list keeps what the server said then
  const [overrides, setOverrides] = createSignal<Map<PeerId, {blocked?: boolean, blockedMyStoriesFrom?: boolean}>>(new Map());

  // * the story the list is of: the list is made anew for another one, not for its counts updated
  const storyId = createMemo(() => story().id);
  const listener = (event: {peerId: PeerId, story: StoryItem}) => {
    if(event.peerId === peerId && event.story.id === untrack(storyId) && event.story._ === 'storyItem') {
      setStory(event.story);
    }
  };
  rootScope.addEventListener('story_update', listener);
  onCleanup(() => rootScope.removeEventListener('story_update', listener));

  const views = () => story().views;
  // * an account without Premium has the viewers of its stories for a day past their end, and then the
  // * reactions alone (Android)
  const viewsExpired = createMemo(() => isUser && !premium() && tsNow(true) > story().expire_date + props.expirePeriod);
  const reactionsOnly = () => viewsExpired() && !!views()?.reactions_count;
  const canFilter = () => isUser && !viewsExpired() && (views()?.views_count ?? 0) >= MIN_VIEWS_TO_FILTER;
  // * contacts are told apart in a story everyone sees: another one is seen by contacts at most
  const showTabs = () => canFilter() && !!story().pFlags.public;
  const showSearch = canFilter;
  const showSort = () => {
    if(viewsExpired()) {
      return false;
    }

    if(isUser) {
      return (views()?.views_count ?? 0) >= MIN_VIEWS_TO_FILTER && (views()?.reactions_count ?? 0) >= MIN_TO_SORT;
    }

    return (list()?.count ?? 0) >= MIN_VIEWS_TO_FILTER && (views()?.forwards_count ?? 0) >= MIN_TO_SORT;
  };

  // * what is chosen counts while its control is there: a story another one is gone to without them, or one
  // * whose views have not reached them, is listed as it comes
  const listMode = createMemo(() => showTabs() ? chosenListMode() : 'all');
  const sortMode = createMemo(() => showSort() ? chosenSortMode() : defaultSortMode);
  const query = createMemo(() => showSearch() ? typedQuery() : '');

  // * shown once, with its first page: a page that comes later never brings back a list dismissed meanwhile
  let opened = false;
  const open = () => {
    if(!opened) {
      opened = true;
      setShow(true);
    }
  };

  // * a new list for every tab, order and search, which takes the place of the one shown once it comes
  let generation = 0, loading = false, nextOffset: string;
  const load = async(reset?: boolean) => {
    if(reset) {
      ++generation;
      loading = false;
      nextOffset = undefined;
    } else if(loading || untrack(isEnd)) {
      return;
    }

    const _generation = generation;
    if(viewsExpired() && !reactionsOnly()) {
      setItems([]);
      setIsEnd(true);
      open();
      return;
    }

    loading = true;
    let result: StoryInteractionsList;
    try {
      result = await (isUser ?
        managers.appStoriesManager.getStoryViewsList(peerId, untrack(storyId), {
          limit: LOAD_COUNT,
          offset: nextOffset,
          q: untrack(query),
          justContacts: untrack(listMode) === 'contacts',
          reactionsFirst: untrack(sortMode) === 'reactions'
        }) :
        managers.appStoriesManager.getStoryReactionsList(peerId, untrack(storyId), {
          limit: LOAD_COUNT,
          offset: nextOffset,
          forwardsFirst: untrack(sortMode) === 'reposts'
        }));
    } catch(err) {
      result = undefined;
    }

    if(_generation !== generation) {
      return;
    }

    loading = false;
    nextOffset = result?.nextOffset;
    setList(result);
    setItems((items) => [...(reset ? [] : items), ...(result?.items || [])]);
    setIsEnd(!nextOffset);
    open();
    queueMicrotask(() => scrollable.checkForTriggers());
  };

  const scrollable = new Scrollable(undefined);
  scrollable.container.classList.add(styles.scrollable);
  scrollable.onScrolledBottom = () => load();
  onCleanup(() => scrollable.destroy());

  const chatlist = hotReloadGuard.appDialogsManager.createChatList({dialogSize: 72});
  chatlist.classList.add(styles.list);

  // * Premium bought while it is open lists the viewers it had no list of
  createEffect(on([storyId, listMode, sortMode, query, viewsExpired], () => {
    scrollable.scrollPosition = 0;
    load(true);
  }));

  const viewItems = () => items().filter((item) => item._ === 'view');
  // * a list that ends short of the views counted: the others were not kept (Android)
  const notAllRecorded = () => isUser &&
    isEnd() &&
    !query() &&
    listMode() === 'all' &&
    !reactionsOnly() &&
    !!viewItems().length &&
    viewItems().length < (list()?.viewsCount ?? views()?.views_count ?? 0);

  const openPremium = () => hotReloadGuard.showPremiumPopup({feature: 'stories'});

  // * another story of the strip: the viewer behind goes to it too, and the list follows once it is known
  let selecting = 0, requestedStoryId: number;
  const selectStory = async(id: number) => {
    if(id === (requestedStoryId ?? storyId())) {
      return;
    }

    requestedStoryId = id;
    const _selecting = ++selecting;
    props.onStoryChange?.(id);
    // * back to the one shown before another one came: that one is dropped
    if(id === storyId()) {
      return;
    }

    const item = await managers.appStoriesManager.getStoryById(peerId, id);
    if(_selecting === selecting && item?._ === 'storyItem') {
      setStory(item);
    }
  };

  const stripStories = createMemo(() => (props.stories?.() || []).filter((item) => item._ === 'storyItem') as StoryItem.storyItem[]);
  const Strip = () => (
    <div
      class={styles.strip}
      role="tablist"
      onKeyDown={handleTabKeyDown}
    >
      <For each={stripStories()}>
        {(item, index) => {
          const selected = () => item.id === storyId();
          const {container} = wrapStoryMedia({
            peerId,
            storyItem: item,
            forPreview: true,
            noInfo: true,
            noAspecter: true,
            withPreloader: false,
            containerProps: {class: styles.stripMedia}
          });

          let element: HTMLDivElement;
          // * the chosen one stays in sight
          createEffect(() => {
            if(selected()) {
              element.scrollIntoView({block: 'nearest', inline: 'nearest'});
            }
          });

          return (
            <div
              ref={element}
              role="tab"
              aria-selected={selected()}
              aria-label={I18n.format('Of', true, [index() + 1, stripStories().length])}
              tabIndex={Modes.a11y ? (selected() ? 0 : -1) : undefined}
              class={classNames(styles.stripItem, selected() && styles.active)}
              onClick={() => selectStory(item.id)}
            >
              {container}
              {item.views?.views_count > 0 && (
                <span class={styles.stripViews} aria-hidden="true">
                  <IconTsx icon="eye1_filled" />
                  {formatNumber(item.views.views_count, 1)}
                </span>
              )}
            </div>
          );
        }}
      </For>
    </div>
  );

  const emptyStub = createMemo<{title?: LangPackKey, text: JSX.Element, premium?: boolean}>(() => {
    if(!isEnd() || items().length) {
      return;
    }

    if(query()) {
      return {text: i18n('NoResult')};
    }

    if(viewsExpired()) {
      return {
        text: [
          i18n('ExpiredViewsStub'),
          !premiumFeaturesHidden() && [document.createElement('br'), document.createElement('br'), i18n('ExpiredViewsStubPremiumDescription')]
        ].flat().filter(Boolean) as JSX.Element,
        premium: !premiumFeaturesHidden()
      };
    }

    if(listMode() === 'contacts') {
      return {text: i18n('NoContactsViewed')};
    }

    if(isUser && views()?.views_count) {
      return {title: 'ServerErrorViewersTitle', text: i18n('ServerErrorViewers')};
    }

    return isUser ?
      {title: 'NoViews', text: i18n('NoViewsStub')} :
      {title: 'NoReactions', text: i18n('NoReactionsStub')};
  });

  // * the menu of a person who saw one's own story: hide one's stories from them or show them again, block
  // * them, or delete them from the contacts (iOS, Android)
  const itemsByElement = new WeakMap<HTMLElement, StoryInteraction>();
  const getState = (item: Extract<StoryInteraction, {_: 'view'}>) => {
    const override = overrides().get(item.peerId);
    return {
      blocked: override?.blocked ?? item.blocked,
      blockedMyStoriesFrom: override?.blockedMyStoriesFrom ?? item.blockedMyStoriesFrom
    };
  };

  const setOverride = (peerId: PeerId, value: {blocked?: boolean, blockedMyStoriesFrom?: boolean}) => {
    const map = new Map(overrides());
    map.set(peerId, {...map.get(peerId), ...value});
    setOverrides(map);
  };

  const getViewerMenuButtons = async(item: Extract<StoryInteraction, {_: 'view'}>): Promise<ButtonMenuItemOptionsVerifiable[]> => {
    const {peerId} = item;
    const isContact = !!apiManagerProxy.getUser(peerId.toUserId())?.pFlags.contact;
    const {blocked, blockedMyStoriesFrom} = getState(item);
    const name = await wrapPeerTitle({peerId, onlyFirstName: true});
    // * an action called off at its confirmation changes nothing; one the server refused says so
    const act = (callback: () => Promise<any>) => () => callback().catch((err: ApiError) => {
      if(err?.type) toastNew({langPackKey: 'Error.AnError'});
    });
    const toggleStoriesHidden = async(hidden: boolean) => {
      await managers.appUsersManager.toggleBlock(peerId, hidden, true);
      setOverride(peerId, {blockedMyStoriesFrom: hidden});
      toastNew({
        langPackKey: hidden ? 'StoryHidFromToast' : 'StoryShownBackToToast',
        langPackArguments: [await wrapPeerTitle({peerId, onlyFirstName: true})]
      });
    };

    return [{
      icon: 'eyecross',
      text: 'StoryHideFrom',
      textArgs: [name],
      onClick: act(() => toggleStoriesHidden(true)),
      verify: () => !blocked && !blockedMyStoriesFrom
    }, {
      icon: 'stories',
      text: 'StoryShowBackTo',
      textArgs: [name.cloneNode(true)],
      onClick: act(() => toggleStoriesHidden(false)),
      verify: () => !blocked && blockedMyStoriesFrom
    }, {
      icon: 'lock',
      text: 'BlockUser',
      onClick: act(async() => {
        await blockUserWithConfirmation({peerId});
        setOverride(peerId, {blocked: true});
      }),
      verify: () => !isContact && !blocked,
      danger: true
    }, {
      icon: 'lockoff',
      text: 'Unblock',
      onClick: act(async() => {
        await unblockUser(peerId);
        setOverride(peerId, {blocked: false});
      }),
      verify: () => !isContact && blocked
    }, {
      icon: 'deleteuser',
      text: 'StoryDeleteContact',
      onClick: act(async() => {
        await confirmDeleteContacts([peerId]);
        await managers.appUsersManager.deleteContacts([peerId.toUserId()]);
        toastNew({
          langPackKey: 'DeletedFromYourContacts',
          langPackArguments: [await wrapPeerTitle({peerId, onlyFirstName: true})]
        });
      }),
      verify: () => isContact,
      danger: true
    }];
  };

  let menuItem: StoryInteraction;
  if(isUser) {
    const contextMenu = createContextMenu({
      listenTo: chatlist,
      findElement: (e) => findUpClassName(e.target, 'chatlist-chat'),
      onOpen: (e, target) => {
        menuItem = itemsByElement.get(target);
        // * one's own row has nothing to do with, and a repost or a forward is no person's view
        return menuItem?._ === 'view' && menuItem.peerId !== rootScope.myId;
      },
      cancelOnOpenFalse: true,
      buttons: [],
      filterButtons: async() => {
        const buttons = await getViewerMenuButtons(menuItem as Extract<StoryInteraction, {_: 'view'}>);
        return buttons.filter((button) => (button.verify as () => boolean)());
      }
    });
    onCleanup(() => contextMenu.destroy());
  }

  const onItemClick = (item: StoryInteraction) => {
    // * one's own reaction leads nowhere (iOS)
    if(item.peerId === rootScope.myId) {
      return;
    }

    // * the list goes before what it leads to, as the viewer behind it does, and loads nothing more
    ++generation;
    setShow(false);
    if(item._ === 'repost') {
      props.onOpenStory(item.peerId, item.story.id);
    } else if(item._ === 'forward') {
      props.onOpenMessage(item.peerId, item.message.mid);
    } else {
      props.onOpenPeer(item.peerId);
    }
  };

  // * a row gone with its list (another tab, order or story) stops what it was loading
  const ignoreGone = (err: ApiError) => {
    if(err?.type !== 'MIDDLEWARE') throw err;
  };

  const Row = (rowProps: {item: StoryInteraction}) => {
    const {item} = rowProps;
    const middleware = createMiddleware().get();
    const dialogElement = new DialogElement({
      peerId: item.peerId,
      autonomous: true,
      avatarSize: 'abitbigger',
      rippleEnabled: false,
      meAsSaved: false,
      wrapOptions: {middleware}
    });
    const {container, dom} = dialogElement;
    container.classList.add(styles.row);
    itemsByElement.set(container, item);
    // * a row with no link to follow: a button, which the keyboard reaches with the a11y layer
    ensureButtonSemantics(container);
    attachClickEvent(container, () => onItemClick(item));

    if(item._ === 'view') {
      processDialogElementForReaction({
        dialogElement,
        peerId: item.peerId,
        date: item.date,
        reaction: item.reaction,
        isMine: true,
        middleware
      }).catch(ignoreGone);

      createEffect(() => {
        const {blocked, blockedMyStoriesFrom} = getState(item);
        // * one who no longer sees the stories is dimmed (Android)
        container.classList.toggle(styles.hidden, !!(blocked || blockedMyStoriesFrom));
      });
    } else {
      // * a repost shows the story it is, a forward the story it carries; both are said with their date
      // * and, a repost with words of its own, that it was commented (Android)
      const isRepost = item._ === 'repost';
      processDialogElementForReaction({
        dialogElement,
        peerId: item.peerId,
        date: item.date,
        isMine: true,
        middleware,
        icon: isRepost ? 'storyrepost' : 'forward',
        after: isRepost && item.story.caption ? [' • ', i18n('StoryRepostCommented')] : undefined
      }).catch(ignoreGone);

      const shownStory = isRepost ? item.story : story();
      const {container: preview} = wrapStoryMedia({
        peerId: isRepost ? item.peerId : peerId,
        storyItem: shownStory,
        forPreview: true,
        noInfo: true,
        noAspecter: true,
        withPreloader: false,
        containerProps: {class: styles.preview}
      });
      dom.listEl.append(preview as HTMLElement);
      container.classList.add(styles.withPreview);
    }

    return container;
  };

  const Stub = (stubProps: {stub: {title?: LangPackKey, text: JSX.Element, premium?: boolean}}) => (
    <div class={styles.stub}>
      {stubProps.stub.title && <div class={styles.stubTitle}>{i18n(stubProps.stub.title)}</div>}
      <div class={styles.stubText}>{stubProps.stub.text}</div>
      {stubProps.stub.premium && (
        <ButtonTsx class={classNames('btn-primary btn-color-primary', styles.stubButton)} text="LearnMore" onClick={openPremium} />
      )}
    </div>
  );

  // * what the list says past its end: why there is no more of it
  const footer = () => {
    if(emptyStub()) {
      return <Stub stub={emptyStub()} />;
    }

    if(reactionsOnly() && isEnd() && !premiumFeaturesHidden()) {
      return (
        <A11yButton class={classNames(styles.hint, styles.hintClickable)} onClick={openPremium}>
          {i18n('StoryViewsPremiumHint')}
        </A11yButton>
      );
    }

    if(notAllRecorded()) {
      return <div class={styles.hint}>{i18n('ServerErrorViewersFull')}</div>;
    }
  };

  // * rows of the list stay where they are as more come and as what follows them changes: only the new ones
  // * are made
  insert(chatlist, <For each={items()}>{(item) => <Row item={item} />}</For>);
  const listFooter = document.createElement('div');
  insert(listFooter, footer);
  scrollable.append(chatlist, listFooter);

  const SortButton = () => {
    let element: HTMLButtonElement;
    const buttons: ButtonMenuItemOptionsVerifiable[] = [
      ...(isUser ? ['reactions', 'recent'] as const : ['reposts', 'recent'] as const).map((mode): ButtonMenuItemOptionsVerifiable => {
        const button: ButtonMenuItemOptionsVerifiable = {
          emptyIcon: true,
          text: SORT_TEXTS[mode],
          onClick: () => setSortMode(mode),
          verify: () => {
            button.icon = sortMode() === mode ? 'check' : undefined;
            return true;
          }
        };
        return button;
      }),
      {
        text: isUser ? 'StoryViewsSortDescription' : 'StoryReactionsSortDescription',
        secondary: true,
        separator: true,
        onClick: undefined
      }
    ];

    // * once the button has its classes: set before, they would go with the menu's own
    onMount(() => {
      ButtonMenuToggle({
        container: element,
        direction: 'bottom-left',
        buttons,
        onOpen: (_, menu) => {
          menu.classList.add('checkable-button-menu');
          menu.querySelectorAll('.btn-menu-item:not(.is-secondary)').forEach((item, index) => {
            item.setAttribute('role', 'menuitemradio');
            item.setAttribute('aria-checked', '' + (buttons[index].icon === 'check'));
          });
        }
      });
    });

    return (
      <button
        ref={element}
        class={classNames('btn-icon', styles.sort)}
        aria-label={I18n.format(SORT_TEXTS[sortMode()], true)}
      >
        <IconTsx icon={SORT_ICONS[sortMode()]} />
        <IconTsx icon="down" class={styles.sortArrow} />
      </button>
    );
  };

  const search = new InputSearch({
    placeholder: 'Search',
    onChange: (value) => setQuery(value.trim())
  });
  search.container.classList.add(styles.search);
  onCleanup(() => search.remove());

  return (
    <PopupElement
      class={styles.popup}
      containerClass={styles.container}
      managers={managers}
      closable
      show={show()}
      onClose={props.onClose}
      containerProps={{'aria-label': I18n.format(isUser ? 'StoryViewers' : 'Reactions', true)}}
    >
      <PopupElement.Header class={styles.header}>
        <PopupElement.CloseButton />
        <Show
          when={showTabs()}
          fallback={<PopupElement.Title class={styles.title} title={isUser ? 'StoryViewers' : 'Reactions'} />}
        >
          <ChipTabs
            class={styles.tabs}
            view="secondary"
            center
            value={chosenListMode()}
            onChange={(value) => void setListMode(value as ListMode)}
          >
            <ChipTab value="all">{i18n('AllViewers')}</ChipTab>
            <ChipTab value="contacts">{i18n('Contacts')}</ChipTab>
          </ChipTabs>
        </Show>
        <Show when={showSort()}>
          <SortButton />
        </Show>
      </PopupElement.Header>
      <Show when={stripStories().length > 1}>
        <Strip />
      </Show>
      <Show when={showSearch()}>
        {search.container}
      </Show>
      <PopupElement.Body class={styles.body}>
        {scrollable.container}
      </PopupElement.Body>
    </PopupElement>
  );
}
