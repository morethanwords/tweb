/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import type {ReactionsContext} from '../../lib/appManagers/appReactionsManager';
import type {RequestHistoryOptions} from '../../lib/appManagers/appMessagesManager';
import {createEffect, createSignal, onCleanup, JSX, createMemo, onMount, splitProps, on, untrack, batch, Accessor} from 'solid-js';
import InputSearch from '../inputSearch';
import {ButtonIconTsx} from '../buttonIconTsx';
import classNames from '../../helpers/string/classNames';
import PopupElement from '../popups';
import PopupDatePicker from '../popups/datePicker';
import rootScope, {BroadcastEvents} from '../../lib/rootScope';
import apiManagerProxy from '../../lib/mtproto/mtprotoworker';
import appDialogsManager from '../../lib/appManagers/appDialogsManager';
import {ChannelsChannelParticipants, Message, MessageReactions, Reaction, ReactionCount, SavedReactionTag} from '../../layer';
import getPeerId from '../../lib/appManagers/utils/peers/getPeerId';
import Scrollable from '../scrollable';
import placeCaretAtEnd from '../../helpers/dom/placeCaretAtEnd';
import {createLoadableList} from '../sidebarRight/tabs/statistics';
import {Middleware, getMiddleware} from '../../helpers/middleware';
import {NULL_PEER_ID} from '../../lib/mtproto/mtproto_config';
import whichChild from '../../helpers/dom/whichChild';
import appImManager from '../../lib/appManagers/appImManager';
import attachListNavigation from '../../helpers/dom/attachListNavigation';
import blurActiveElement from '../../helpers/dom/blurActiveElement';
import I18n, {i18n} from '../../lib/langPack';
import wrapEmojiText from '../../lib/richTextProcessor/wrapEmojiText';
import stringMiddleOverflow from '../../helpers/string/stringMiddleOverflow';
import appNavigationController, {NavigationItem} from '../appNavigationController';
import getTextWidth from '../../helpers/canvas/getTextWidth';
import {FontFull} from '../../config/font';
import Row from '../row';
import wrapPeerTitle from '../wrappers/peerTitle';
import getParticipantPeerId from '../../lib/appManagers/utils/chats/getParticipantPeerId';
import {avatarNew} from '../avatarNew';
import getPeerActiveUsernames from '../../lib/appManagers/utils/peers/getPeerActiveUsernames';
import cancelEvent from '../../helpers/dom/cancelEvent';
import {attachClickEvent} from '../../helpers/dom/clickEvent';
import AppSelectPeers from '../appSelectPeers';
import PeerTitle from '../peerTitle';
import ReactionsElement from './reactions';
import ReactionElement, {ReactionLayoutType} from './reaction';
import {ScrollableXTsx} from '../stories/list';
import reactionsEqual from '../../lib/appManagers/utils/reactions/reactionsEqual';
import findUpClassName from '../../helpers/dom/findUpClassName';
import fastSmoothScroll from '../../helpers/fastSmoothScroll';
import Icon from '../icon';
import PopupPremium from '../popups/premium';
import usePremium from '../../stores/premium';
import createMiddleware from '../../helpers/solid/createMiddleware';
import Animated from '../../helpers/solid/animations';
import Chat, {ChatType} from './chat';
import {subscribeOn} from '../../helpers/solid/subscribeOn';
import getHistoryStorageKey, {getHistoryStorageType} from '../../lib/appManagers/utils/messages/getHistoryStorageKey';
import {ScreenSize, useMediaSizes} from '../../helpers/mediaSizes';
import ButtonCorner from '../buttonCorner';

export const ScrollableYTsx = (props: {
  children: JSX.Element,
  onScrolledBottom?: () => void,
  onScrolledTop?: () => void,
} & JSX.HTMLAttributes<HTMLDivElement>) => {
  const [, rest] = splitProps(props, ['onScrolledBottom', 'onScrolledTop']);
  let container: HTMLDivElement;
  const ret = (
    <div ref={container} {...rest}>
      {props.children}
    </div>
  );

  const scrollable = new Scrollable(undefined, undefined, undefined, undefined, container);
  scrollable.onScrolledBottom = props.onScrolledBottom;
  scrollable.onScrolledTop = props.onScrolledTop;

  onCleanup(() => {
    scrollable.destroy();
  });

  return ret;
};

type SearchType = RequestHistoryOptions['hashtagType'];
const SEARCH_TYPES: SearchType[] = ['this', 'my', 'public'];
const DEFAULT_SEARCH_TYPE: SearchType = undefined;

type LoadOptions = {
  middleware: Middleware,
  peerId: PeerId,
  threadId: number,
  monoforumThreadId: PeerId,
  query: string,
  fromPeerId?: PeerId,
  reaction?: Reaction,
  searchType?: SearchType
};

const renderHistoryResult = ({middleware, peerId, fromSavedDialog, messages, query, searchType/* , fromPeerId */}: LoadOptions & {fromSavedDialog: boolean, messages: (Message.message | Message.messageService)[]}) => {
  const promises = messages.map(async(message) => {
    const fromPeerId = message.fromId;
    const loadPromises: Promise<any>[] = [];
    const {dom} = appDialogsManager.addDialogAndSetLastMessage({
      peerId: fromSavedDialog ? rootScope.myId : (fromPeerId || peerId),
      container: false,
      avatarSize: 'abitbigger',
      meAsSaved: searchType === 'my',
      message,
      query,
      // noIcons: this.noIcons,
      wrapOptions: {
        middleware
      },
      loadPromises,
      threadId: fromSavedDialog ? ((message as Message.message).saved_peer_id ? getPeerId((message as Message.message).saved_peer_id) : rootScope.myId) : undefined,
      autonomous: true
    });

    await Promise.all(loadPromises);
    return dom.containerEl;
  });

  return Promise.all(promises);
};

const createSearchLoader = (options: LoadOptions) => {
  const {middleware, peerId, threadId, query, fromPeerId, reaction, searchType, monoforumThreadId} = options;
  const fromSavedDialog = !!(peerId === rootScope.myId && threadId);
  let lastMessage: Message.message | Message.messageService, loading = false, nextRate: number;
  const loadMore = async() => {
    if(loading) {
      return;
    }
    loading = true;

    const offsetId = lastMessage?.mid || 0;
    const offsetPeerId = lastMessage?.peerId || NULL_PEER_ID;
    const requestHistoryOptions: RequestHistoryOptions = {
      peerId: searchType === 'this' || !searchType ? peerId : NULL_PEER_ID,
      threadId: searchType === 'this' || !searchType ? threadId : undefined,
      monoforumThreadId,
      query,
      inputFilter: {_: 'inputMessagesFilterEmpty'},
      offsetId,
      offsetPeerId,
      limit: 30,
      fromPeerId,
      savedReaction: reaction ? [reaction as Reaction.reactionEmoji] : undefined,
      nextRate,
      isPublicHashtag: searchType === 'public',
      isCacheableSearch: !!searchType,
      hashtagType: searchType
    };

    const key = getHistoryStorageKey({type: getHistoryStorageType(requestHistoryOptions), ...requestHistoryOptions});
    rootScope.managers.appMessagesManager.toggleHistoryKeySubscription(key, true);
    onCleanup(() => {
      rootScope.managers.appMessagesManager.toggleHistoryKeySubscription(key, false);
    });

    const result = await rootScope.managers.appMessagesManager.getHistory(requestHistoryOptions);
    if(!middleware()) {
      return;
    }

    let messages: Message.message[];
    if(result.messages) {
      messages = result.messages as Message.message[];
      nextRate = result.nextRate;
    } else {
      messages = result.history.map((mid) => apiManagerProxy.getMessageByPeer(peerId, mid)) as Message.message[];
    }

    const rendered = await renderHistoryResult({...options, fromSavedDialog, messages});
    if(!middleware()) {
      return;
    }

    setF((value) => {
      value.count = result.count;
      value.values.push(...messages);
      lastMessage = messages[messages.length - 1];
      if(result.isEnd.top) {
        value.loadMore = undefined;
      }

      value.rendered.push(...rendered);
      return value;
    });
    loading = false;
  };

  const [f, setF] = createLoadableList<Message.message | Message.messageService>({loadMore});
  return f;
};

const createParticipantsLoader = (options: LoadOptions) => {
  const {middleware, peerId, query} = options;
  let loading = false, offset = 0;
  const loadMore = async() => {
    if(loading) {
      return;
    }
    loading = true;

    const result = await rootScope.managers.appProfileManager.getParticipants({
      id: peerId.toChatId(),
      filter: {_: 'channelParticipantsSearch', q: query},
      limit: 30,
      offset,
      forMessagesSearch: true
    });
    if(!middleware()) {
      return;
    }

    const peerIds = result.participants.map(getParticipantPeerId);
    const promises = peerIds.map(async(peerId) => {
      const title = await wrapPeerTitle({peerId});
      const peer = apiManagerProxy.getPeer(peerId);
      const username = getPeerActiveUsernames(peer)[0];
      const row = new Row({
        title: (
          <span>
            <b>{title}</b> {username && <span class="secondary">{`@${username}`}</span>}
          </span>
        ) as HTMLElement,
        clickable: true
      });

      row.container.classList.add('topbar-search-left-sender');

      const size = 40;
      const avatar = avatarNew({peerId, size, middleware});
      row.createMedia(`${size}`).append(avatar.node);
      await avatar.readyThumbPromise;

      return row.container;
    });

    const rendered = await Promise.all(promises);
    if(!middleware()) {
      return;
    }

    setF((value) => {
      value.count = (result as ChannelsChannelParticipants.channelsChannelParticipants).count ?? peerIds.length;
      const newLength = value.values.push(...peerIds);
      offset = newLength;
      if(newLength >= value.count) {
        value.loadMore = undefined;
      }

      value.rendered.push(...rendered);
      return value;
    });
    loading = false;
  };

  const [f, setF] = createLoadableList<PeerId>({loadMore});
  return f;
};

function SearchFooter(props: {
  index: () => number,
  count: () => number,
  pickUserBtn: JSX.Element,
  pickDateBtn: JSX.Element,
  resultsShown: () => boolean,
  onToggle: () => void,
  choosingSender: () => boolean
}) {
  return (
    <div class={classNames('chat-search-footer', props.choosingSender() && 'hide')}>
      <div class="chat-search-footer-left">
        {props.pickDateBtn}
        {props.pickUserBtn}
        <span class={classNames('chat-search-footer-count', props.count() === undefined && 'hide')}>
          {
            props.count() === 0 ?
              i18n('NoResult') :
              props.resultsShown() ? i18n('messages', [props.count()]) : i18n('Of', [props.index() + 1, props.count()])
          }
        </span>
      </div>
      <div class={classNames('chat-search-footer-right', !props.count() && 'hide')}>
        <span
          class="chat-search-footer-type"
          onClick={() => props.onToggle()}
        >
          {i18n(props.resultsShown() ? 'SearchAsChat' : 'SearchAsList')}
        </span>
      </div>
    </div>
  );
}

function SearchMobileResults(props: {
  scrollable: JSX.Element
}) {
  return (
    <div class="chat-search-results chatlist-container">
      {props.scrollable}
    </div>
  );
}

function SearchMobileTop(props: {
  reactionsScrollable: JSX.Element,
  searchTypesScrollable: JSX.Element,
  hasReactions: () => boolean,
  hasSearchTypes: () => boolean
}) {
  return (
    <div class="chat-search-top">
      {props.hasSearchTypes() ? props.searchTypesScrollable : props.reactionsScrollable}
    </div>
  );
}

function SearchMobileButtons(props: {
  index: () => number,
  count: () => number,
  chat: Chat,
  onArrowButtonClick: (direction: 'up' | 'down') => void
}) {
  const makeButton = (icon: 'up' | 'down', onClick: () => void) => {
    const btn = ButtonCorner({icon, className: 'bubbles-corner-button chat-secondary-button chat-search-go chat-search-go-' + icon});
    const detach = attachClickEvent(btn, onClick);
    onCleanup(detach);

    const isEnd = createMemo(() => {
      if(icon === 'down') {
        return props.index() === 0;
      } else {
        return props.index() === props.count() - 1;
      }
    });

    createEffect(() => {
      btn.classList.toggle('is-end', isEnd());
      btn.classList.toggle('hide', (props.count() || 0) < 2);
    });

    return btn;
  };

  const buttons = [
    makeButton('up', props.onArrowButtonClick.bind(null, 'up')),
    makeButton('down', props.onArrowButtonClick.bind(null, 'down'))
  ];

  props.chat.bubbles.container.after(...buttons);
  onCleanup(() => {
    buttons.forEach((button) => {
      button.remove();
    });
  });
}

export default function TopbarSearch(props: {
  chat: Chat,
  chatType: ChatType,
  peerId: PeerId,
  threadId?: number,
  filterPeerId: Accessor<PeerId>,
  canFilterSender?: boolean,
  query?: Accessor<string>,
  reaction?: Accessor<Reaction>,
  onClose?: () => void,
  onDatePick?: (timestamp: number) => void,
  onActive?: (active: boolean, showingReactions: boolean, isSmallScreen: boolean) => void,
  onSearchTypeChange?: () => void
}) {
  const mediaSizes = useMediaSizes();
  const isSmallScreen = createMemo(() => mediaSizes.activeScreen === ScreenSize.mobile);
  const [isInputFocused, setIsInputFocused] = createSignal(false);
  const [value, setValue] = createSignal<string>('');
  const [count, setCount] = createSignal<number>();
  const [totalCount, setTotalCount] = createSignal<number>();
  const [list, setList] = createSignal<{element: HTMLElement, type: 'messages' | 'senders'}>();
  const [messages, setMessages] = createSignal<(Message.message | Message.messageService)[]>();
  const [sendersPeerIds, setSendersPeerIds] = createSignal<PeerId[]>();
  const [loadMore, setLoadMore] = createSignal<() => Promise<void>>();
  const [target, setTarget] = createSignal<HTMLElement>(undefined, {equals: false});
  const [filteringSender, setFilteringSender] = createSignal<boolean>(false);
  const [filterPeerId, setFilterPeerId] = createSignal<PeerId>();
  const [senderInputEntity, setSenderInputEntity] = createSignal<HTMLElement>();
  const [savedReactionTags, setSavedReactionTags] = createSignal<SavedReactionTag[]>(undefined, {equals: false});
  const [reactionsElement, setReactionsElement] = createSignal<ReactionsElement>();
  const [reaction, setReaction] = createSignal<Reaction>(undefined, {equals: false});
  const [searchType, setSearchType] = createSignal<SearchType>(DEFAULT_SEARCH_TYPE);
  const [showingSmallResults, setShowingSmallResults] = createSignal(false);
  const choosingSender = createMemo(() => filteringSender() && !filterPeerId());
  const shouldShowResults = createMemo(() => isSmallScreen() ? showingSmallResults() : isInputFocused());
  const shouldHaveListNavigation = createMemo(() => (shouldShowResults() && count() && list()) || undefined);
  const lookingHashtag = createMemo(() => {
    if(filteringSender() || reaction()) return;
    const _value = value();
    return _value.startsWith('#') ? _value.slice(1) : undefined;
  });
  const isHashtag = createMemo(() => lookingHashtag() !== undefined);
  const shouldShowReactions = createMemo(() => {
    if(isHashtag()) return false;
    const element = reactionsElement();
    const tags = savedReactionTags();
    return !!(element && tags?.length);
  });
  const shouldShowSearchTypes = createMemo(() => isHashtag());
  const shouldShowFromPlaceholder = createMemo(() => (!isSmallScreen() || !filterPeerId()) && filteringSender());
  const isActive = createMemo(() => isSmallScreen() || shouldShowReactions()/*  || shouldShowSearchTypes() */ || shouldShowResults());
  const isPremium = usePremium();

  if(props.onActive) {
    createEffect(() => {
      props.onActive(isActive(), shouldShowReactions(), isSmallScreen());
    });

    onCleanup(() => {
      props.onActive(false, false, isSmallScreen());
    });
  }

  // * full search replacement
  createEffect(() => {
    inputSearch.onChange(inputSearch.value = props.query());
    setFilteringSender(!!props.filterPeerId());
    setFilterPeerId(props.filterPeerId());
    setReaction(props.reaction());

    onMount(() => {
      placeCaretAtEnd(inputSearch.input);
    });
  });

  // * list navigation
  createEffect(() => {
    const {element} = shouldHaveListNavigation() || {};
    if(!element) {
      return;
    }

    const list = element.firstElementChild as HTMLElement;
    const activeClassName = 'menu-open';
    const el = list.querySelector(`.${activeClassName}`);
    el && el.classList.remove(activeClassName);
    const {detach} = attachListNavigation({
      list,
      type: 'y',
      onSelect: (target) => {
        const shouldBlur = !!(!filteringSender() || filterPeerId());
        setTarget(target as HTMLElement);
        if(shouldBlur) {
          blurActiveElement();
        }
      },
      activeClassName,
      cancelMouseDown: true,
      target: untrack(target)
    });

    onCleanup(() => {
      detach();
    });
  });

  const navigationItem: NavigationItem = {
    type: 'topbar-search',
    onPop: () => {
      if(isInputFocused() && value()) {
        blurActiveElement();
        return false;
      }

      props.onClose?.();
    }
  };
  appNavigationController.pushItem(navigationItem);
  onCleanup(() => {
    appNavigationController.removeItem(navigationItem);
  });

  const onInputClear: (e?: MouseEvent, wasEmpty?: boolean) => void = (e, wasEmpty = inputSearch.inputField.isEmpty()) => {
    if(filterPeerId()) {
      e && cancelEvent(e);
      wasEmpty && setFilterPeerId(undefined);
      return;
    }

    if(filteringSender()) {
      e && cancelEvent(e);
      wasEmpty && setFilteringSender(false);
      return;
    }

    if(wasEmpty) {
      if(isSmallScreen()) {
        return;
      }

      props.onClose?.();
    }
  };

  const inputSearch: InputSearch = new InputSearch({
    placeholder: 'Search',
    onChange: setValue,
    onClear: onInputClear,
    onFocusChange: setIsInputFocused,
    onBack: () => {
      props.onClose?.();
    },
    alwaysShowClear: true,
    noBorder: true,
    verifyDebounce: (value) => {
      return value !== '#' &&
        !inputSearch.container.classList.contains('show-placeholder') &&
        !!value.trim(); // skip debounce for hashtag
    },
    arrowBack: isSmallScreen()
  });
  inputSearch.container.classList.add('topbar-search-input-container');
  inputSearch.input.classList.add('topbar-search-input');
  const onKeyDown = (e: KeyboardEvent) => {
    if(e.key !== 'Backspace') {
      return;
    }

    const isEmpty = inputSearch.inputField.isEmpty();
    if(isEmpty && (filterPeerId() || filteringSender())) {
      onInputClear(undefined, isEmpty);
    }
  };
  subscribeOn(inputSearch.input)('keydown', onKeyDown);
  onCleanup(() => {
    inputSearch.remove();
  });

  const hashWidth = getTextWidth('#', FontFull);
  const fromText = I18n.format('Search.From', true) + ' ';
  const fromWidth = getTextWidth(fromText, FontFull);
  const fromSpan = (<span class={classNames('topbar-search-input-from', shouldShowFromPlaceholder() && 'is-visible')}>{fromText}</span>);
  inputSearch.container.append(fromSpan as HTMLElement);
  createEffect<HTMLElement>((_element) => {
    const filtering = filteringSender();
    const _isHashtag = isHashtag();
    if(_element) {
      _element.classList.remove('scale-in');
      void _element.offsetWidth;
      _element.classList.add('scale-out');
      setTimeout(() => {
        _element.remove();
      }, 200);
    }

    const element = senderInputEntity();
    if(element) {
      element.classList.add('topbar-search-input-entity', 'scale-in');
      const detach = attachClickEvent(element, (e) => {
        cancelEvent(e);
        if(_isHashtag) {
          setSearchType();
        } else {
          setFilterPeerId();
        }
      }, {cancelMouseDown: true});
      onCleanup(detach);
      inputSearch.container.append(element);
    }

    inputSearch.container.style.setProperty('--padding-placeholder', (shouldShowFromPlaceholder() ? fromWidth : 0) + 'px');
    inputSearch.container.style.setProperty('--padding-hashtag', (_isHashtag ? hashWidth : 0) + 'px');
    inputSearch.container.style.setProperty('--padding-sender', (element ? element.offsetWidth + 6 : 0) + 'px');
    inputSearch.setPlaceholder(filtering && !element ? 'Search.Member' : (_isHashtag ? 'Search.Hashtag' : 'Search'));
    return element;
  });

  // * keep placeholder while input is empty
  createEffect(() => {
    inputSearch.container.classList.toggle('show-placeholder', /* !value() ||  */lookingHashtag() === '');
  });

  const PeerEntity = (props: {
    peerId?: PeerId | string,
    fallbackIcon?: Icon,
    title?: HTMLElement,
    active?: Accessor<boolean>,
    onPromises?: (promises: Promise<any>[]) => void,
    onClick?: () => void,
  }) => {
    const middleware = createMiddleware().get();
    const entity = untrack(() => AppSelectPeers.renderEntity({
      key: props.peerId,
      title: props.title,
      fallbackIcon: props.fallbackIcon,
      middleware,
      avatarSize: 30,
      meAsSaved: false
    }));

    if(props.active !== undefined) {
      createEffect(() => {
        entity.element.classList.toggle('active', props.active());
      });
    }

    if(props.onClick) {
      const detach = attachClickEvent(entity.element, (e) => {
        cancelEvent(e);
        props.onClick();
      }, {cancelMouseDown: true});
      onCleanup(detach);
    }

    if(props.onPromises) {
      props.onPromises(entity.promises);
    }

    return entity.element;
  };

  const SearchTypeEntity = (_props: {
    type: SearchType,
    notList?: boolean,
    onPromises?: (promises: Promise<any>[]) => void
  }) => {
    const peerId = _props.type === 'this' ? props.peerId : (_props.type === 'my' ? rootScope.myId : 'public');
    const title = i18n(`Search.Types.${_props.type === 'this' ? 'ThisChat' : _props.type === 'my' ? 'MyMessages' : 'PublicPosts'}`);
    return (
      <PeerEntity
        peerId={peerId}
        title={title}
        {...(!_props.notList && {
          active: () => searchType() === _props.type,
          onClick: () => setSearchType((type) => type === _props.type ? DEFAULT_SEARCH_TYPE : _props.type)
        })}
        fallbackIcon={_props.type === 'public' ? 'newchannel_filled' : undefined}
        onPromises={_props.onPromises}
      />
    );
  };

  // * handle sender or search type entity
  createEffect(async() => {
    const peerId = filterPeerId();
    const _searchType = searchType();
    const middleware = createMiddleware().get();
    let element: HTMLElement;
    if(peerId || _searchType) {
      element = await new Promise((resolve) => {
        let element: HTMLDivElement;
        const onPromises = async(promises: Promise<any>[]) => {
          await Promise.all(promises);
          return resolve(element);
        };

        if(_searchType) {
          element = SearchTypeEntity({
            type: _searchType,
            notList: true,
            onPromises
          }) as HTMLDivElement;
        } else {
          element = PeerEntity({
            peerId,
            onPromises
          });
        }
      });
      if(!middleware()) {
        return;
      }
    }

    setSenderInputEntity(element);
  });

  const MIN_HEIGHT = 43;
  const MAX_HEIGHT = 271;

  const onArrowButtonClick = (direction: 'up' | 'down') => {
    // let _target = scrollableDiv.querySelector<HTMLElement>('.active');
    let _target = target();
    if(!_target) {
      _target = scrollableDiv.querySelector<HTMLElement>('.chatlist-chat');
      setTarget(_target);
      return;
    }

    if(direction === 'down') {
      _target = _target.previousElementSibling as HTMLElement;
    } else {
      _target = _target.nextElementSibling as HTMLElement;
    }

    if(!_target || !_target.classList.contains('chatlist-chat')) {
      return;
    }

    // set scroll position to center
    const top = _target.offsetTop;
    const clientHeight = MAX_HEIGHT;
    scrollableDiv.scrollTop = top - clientHeight / 2 + _target.clientHeight / 2;

    setTarget(_target);
  };

  const ArrowButton = ({direction}: {direction: 'up' | 'down'}) => {
    return (
      <ButtonIconTsx
        icon={direction}
        class={classNames(
          'input-search-part',
          'topbar-search-input-arrow',
          (!count() || (filteringSender() && !filterPeerId())) && 'hide'
        )}
        noRipple
        onClick={() => {
          onArrowButtonClick(direction);
        }}
      />
    );
  };

  const b = inputSearch.clearBtn.previousSibling;
  let inputSearchTools: HTMLDivElement;
  (<div ref={inputSearchTools} class="topbar-search-input-tools">
    {!isSmallScreen() && (
      <>
        <ArrowButton direction="up" />
        <ArrowButton direction="down" />
      </>
    )}
    {inputSearch.clearBtn}
  </div>);
  b.after(inputSearchTools);

  const updateChatSearchContext = (searchType: SearchType, query: string) => {
    appImManager.chat.setMessageId({
      query: searchType && query || undefined,
      isPublicHashtag: searchType === 'public' || undefined,
      isCacheableSearch: !!searchType || undefined,
      inputFilter: query && searchType ? {_: 'inputMessagesFilterEmpty'} : undefined,
      type: query && searchType ? ChatType.Search : props.chatType,
      hashtagType: searchType
    });
  };

  // * search
  createEffect<Partial<{searchType: SearchType, query: string}>>((prev) => {
    prev ||= {};
    const {peerId, threadId} = props;
    const query = value();
    const fromPeerId = filterPeerId();
    const isSender = choosingSender();
    const middleware = createMiddleware().get();
    const isEmptyQuery = !query.trim() || query === '#';
    const _isHashtag = isHashtag();
    const _reaction = !isSender && reaction();
    const _searchType = searchType();

    // * reset search if it's not a hashtag anymore
    if(_searchType && !query) {
      setSearchType();
      updateChatSearchContext(undefined, undefined);
      return;
    }

    setLoadMore(() => undefined as any);
    setMessages();
    setSendersPeerIds();
    setTarget();

    const loader = (isSender ? createParticipantsLoader : createSearchLoader)({
      middleware,
      peerId,
      threadId,
      monoforumThreadId: props.chat.monoforumThreadId,
      query,
      fromPeerId,
      reaction: _reaction,
      searchType: _searchType
    });

    const isEmpty = createMemo(() => count() === 0 || (_isHashtag && count() === undefined));

    let ref: HTMLDivElement;
    const list = (
      <div
        ref={ref}
        class={classNames(!untrack(isSmallScreen) && 'topbar-search-left-chatlist', 'chatlist', isEmpty() && 'is-empty')}
      >
        {isEmpty() ? (
          <div class="topbar-search-left-results-empty">
            {_isHashtag && (count() === undefined ?
              i18n('Search.HelpHashtag') :
              i18n('Search.EmptyHashtag', [wrapEmojiText(stringMiddleOverflow(query, 18))]))}
            {!_isHashtag && (fromPeerId ?
              i18n('Search.EmptyFrom', [(() => {
                const peerTitle = new PeerTitle({peerId: fromPeerId});
                return peerTitle.element;
              })()]) :
              i18n('Search.Empty', [wrapEmojiText(stringMiddleOverflow(query, 18))])
            )}
          </div>
        ) : (
          <>
            <div>
              {loader().rendered}
            </div>
            {loader().rendered && <div class="topbar-search-left-results-padding" />}
          </>
        )}
      </div>
    );

    let first = true;
    const onLoad = (firstElement?: HTMLElement) => {
      if(first) {
        inputSearch.toggleLoading(false);
        setList({element: ref, type: isSender ? 'senders' : 'messages'});
        scrollableDiv.scrollTop = 0;
        first = false;

        // * jump to first target
        if(untrack(isSmallScreen) && !isSender) {
          setTarget(untrack(messages) && firstElement);
        }
      }
    };

    if(_searchType !== prev.searchType || (_searchType && query !== prev.query)) {
      props.onSearchTypeChange?.();
      updateChatSearchContext(_searchType, query);
    }

    const current = {searchType: _searchType, query};

    if(!isSender && !fromPeerId && !_reaction && isEmptyQuery) {
      setCount();
      setTotalCount();
      onLoad();
      return current;
    }

    createEffect(
      on(
        () => loader(),
        ({rendered, values, count, loadMore}) => {
          setCount(rendered.length);
          setTotalCount(count);
          setLoadMore(() => loadMore);
          if(isSender) setSendersPeerIds(values as any);
          else setMessages(values as any);
          onLoad((rendered as HTMLElement[])[0]);
        },
        {defer: true}
      )
    );

    inputSearch.toggleLoading(true);
    untrack(() => loader().loadMore());
    return current;
  });

  // * handle target change to jump to message
  createEffect(
    on(
      target,
      (target) => {
        const idx = whichChild(target);
        if(idx === -1) {
          return;
        }

        if(choosingSender()) {
          const peerId = sendersPeerIds()[idx];
          batch(() => {
            setFilterPeerId(peerId);
            inputSearch.onChange(inputSearch.value = '');
          });
          return;
        }

        const previousActive = target.parentElement.querySelector('.active');
        if(previousActive) {
          previousActive.classList.remove('active');
        }

        target.classList.add('active');

        setShowingSmallResults(false);

        const message = messages()[idx];
        appImManager.chat.setMessageId({lastMsgId: message.mid, lastMsgPeerId: message.peerId});
      },
      {defer: true}
    )
  );

  const tagToReactionCount = (tag: SavedReactionTag): ReactionCount => {
    return {
      _: 'reactionCount',
      count: tag.count,
      reaction: tag.reaction
    };
  };

  const tagsToMessageReactions = (tags: SavedReactionTag[]): MessageReactions => {
    return {
      _: 'messageReactions',
      pFlags: {reactions_as_tags: true},
      results: tags.map(tagToReactionCount)
    };
  };

  const onSavedTags = ({savedPeerId, tags}: BroadcastEvents['saved_tags']) => {
    if(savedPeerId !== props.threadId) {
      return;
    }

    setSavedReactionTags(tags);
  };
  subscribeOn(rootScope)('saved_tags', onSavedTags);

  // * render saved reaction tags
  createEffect<HTMLElement>((previousLock) => {
    const tags = savedReactionTags();
    const element = reactionsElement();
    if(!tags || !element) {
      return previousLock;
    }

    const reactionsContext: ReactionsContext = {
      ...element.getContext(),
      reactions: tagsToMessageReactions(tags)
    };

    // * set active
    const _reaction = reaction();
    let chosenReactionCount: ReactionCount;
    if(_reaction) {
      const reactionCount = reactionsContext.reactions.results.find((reactionCount) => reactionsEqual(reactionCount.reaction, _reaction));
      if(reactionCount) {
        chosenReactionCount = reactionCount;
        reactionCount.chosen_order = 0;
      }
    }

    previousLock?.remove();
    element.update(reactionsContext);

    if(chosenReactionCount) {
      const reactionElement = element.getSorted().find((element) => reactionsEqual(element.reactionCount.reaction, _reaction));
      fastSmoothScroll({
        container: reactionsScrollableDiv,
        element: reactionElement,
        position: 'center',
        axis: 'x'
      });
    }

    const premium = isPremium();
    element.classList.toggle('is-locked', !premium);
    if(!premium) {
      const icon: Icon = 'premium_lock';
      const reaction = new ReactionElement();
      reaction.init(ReactionLayoutType.Tag, createMiddleware().get());
      reaction.reactionCount = {
        _: 'reactionCount',
        count: 1,
        reaction: icon as any
      };
      reaction.setCanRenderAvatars(false);
      reaction.renderCounter(undefined, i18n('Unlock'));
      reaction.classList.add('reaction-tag-lock');

      const allReactionsSticker = document.createElement('div');
      allReactionsSticker.classList.add('reaction-sticker', 'reaction-sticker-icon');
      allReactionsSticker.append(Icon(icon));
      reaction.lastElementChild.before(allReactionsSticker);

      element.prepend(reaction);
      return reaction;
    }
  });

  // * load saved reaction tags
  createEffect(() => {
    if(props.peerId !== rootScope.myId) {
      setReactionsElement();
      setSavedReactionTags();
      return;
    }

    const realMiddleware = createMiddleware().get();
    const middlewareHelper = getMiddleware();
    onCleanup(() => {
      setTimeout(() => {
        middlewareHelper.destroy();
      }, 400);
    });
    const reactionsElement = new ReactionsElement();
    reactionsElement.init({
      context: {peerId: props.peerId, mid: 0, reactions: tagsToMessageReactions([])},
      type: ReactionLayoutType.Block,
      middleware: middlewareHelper.get(),
      forceCounter: true
    });
    reactionsElement.classList.remove('has-no-reactions');
    reactionsElement.classList.add('topbar-search-left-reactions');

    // * reactions listener
    const detach = attachClickEvent(reactionsElement, (e) => {
      const reactionElement = findUpClassName(e.target, 'reaction-tag') as ReactionElement;
      if(!reactionElement) {
        return;
      }

      if(!isPremium()) {
        PopupPremium.show({feature: 'saved_tags'});
        return;
      }

      const {reactionCount} = reactionElement;
      const {reaction} = reactionCount;
      setReaction((prev) => {
        if(reactionsEqual(prev, reaction)) {
          return;
        }

        return reaction;
      });

      placeCaretAtEnd(inputSearch.input);
    }, {cancelMouseDown: true});
    onCleanup(detach);

    const get = () => {
      rootScope.managers.appReactionsManager.getSavedReactionTags(props.threadId).then((tags) => {
        // await pause(1000);
        if(!realMiddleware()) {
          return;
        }

        setReactionsElement(reactionsElement);
        setSavedReactionTags(tags);
      });
    };

    get();
    rootScope.addEventListener('saved_tags_clear', get);
    onCleanup(() => {
      rootScope.removeEventListener('saved_tags_clear', get);
    });
  });

  // * handle reaction changing
  let first = true;
  createEffect(on(
    reaction,
    (reaction) => {
      if(first) {
        first = false;

        if(!reaction) {
          return;
        }
      }

      appImManager.chat.setMessageId({
        savedReaction: reaction ? [reaction as Reaction.reactionCustomEmoji | Reaction.reactionEmoji] : undefined
      });
    }
  ));

  // * reset reaction on close
  onCleanup(() => {
    if(!reaction()) {
      return;
    }

    appImManager.chat.setMessageId({lastMsgId: undefined, lastMsgPeerId: undefined, mediaTimestamp: undefined, savedReaction: undefined});
  });

  // * reset search on close
  onCleanup(() => {
    if(appImManager.chat.type !== ChatType.Search) {
      return;
    }

    updateChatSearchContext(undefined, undefined);
  });

  // * mobile search
  createEffect(() => {
    inputSearch.setArrowBack(isSmallScreen());
    if(!isSmallScreen()) {
      return;
    }

    const index = () => whichChild(target());

    const footerElement = SearchFooter({
      index,
      count: totalCount,
      pickUserBtn,
      pickDateBtn,
      resultsShown: shouldShowResults,
      onToggle: () => {
        setShowingSmallResults((prev) => !prev);
      },
      choosingSender
    }) as HTMLElement;

    const resultsElement = SearchMobileResults({
      scrollable
    }) as HTMLElement;

    const topElement = SearchMobileTop({
      reactionsScrollable,
      searchTypesScrollable,
      hasReactions: () => !!calculateReactionsHeight(),
      hasSearchTypes: () => !!calculateSearchTypesHeight()
    }) as HTMLElement;

    SearchMobileButtons({
      index,
      count: totalCount,
      chat: props.chat,
      onArrowButtonClick
    });

    const onShowingSmallResultsChange = (value = showingSmallResults()) => {
      props.chat.bubbles.container.classList.toggle('search-results-active', value);
      resultsElement.classList.toggle('active', value);
    };

    const onTopActive = (value?: boolean) => {
      value ??= !!(calculateReactionsHeight() || calculateSearchTypesHeight());
      props.chat.topbar.container.classList.toggle('search-top-active', value);
      resultsElement.classList.toggle('search-top-active', value);
      if(value) container.after(topElement);
      else topElement.remove();
    };

    createEffect(() => onShowingSmallResultsChange());
    createEffect(() => onTopActive());

    createEffect(() => {
      if(choosingSender()) {
        setShowingSmallResults(true);
      } else if(!filteringSender()) {
        setShowingSmallResults(false);
      }
    });

    onCleanup(() => {
      footerElement.remove();
      setShowingSmallResults(false);
      onShowingSmallResultsChange();
      onTopActive(false);

      setTimeout(() => {
        resultsElement.remove();
      }, 400);
    });

    props.chat.input.chatInput.before(resultsElement, footerElement);
  });

  const calculateResultsHeight = createMemo(() => {
    if(!shouldShowResults()) {
      return 0;
    }

    const length = count();
    if(length === undefined && !isHashtag()) {
      return 0;
    }

    const paddingVertical = 8 * 2;
    let height: number;
    if(!length) {
      height = MIN_HEIGHT;
    } else if(list().type === 'senders') {
      height = 1 + paddingVertical + length * 48;
    } else {
      height = 1 + paddingVertical + length * 56;
    }

    return Math.min(MAX_HEIGHT, height);
  });

  const calculateReactionsHeight = createMemo(() => {
    if(!isActive()) {
      return 0;
    }

    return shouldShowReactions() ? 61 : 0;
  });

  const calculateSearchTypesHeight = createMemo(() => {
    if(!isActive()) {
      return 0;
    }

    return shouldShowSearchTypes() ? 61 : 0;
  });

  const pickUserBtn = props.canFilterSender && (
    <ButtonIconTsx
      class={classNames(!isSmallScreen() && 'topbar-search-right-filter-button')}
      icon="newprivate"
      ref={(element) => {
        const detach = attachClickEvent(element, (e) => {
          cancelEvent(e);
          inputSearch.onChange(inputSearch.value = '');
          setFilteringSender(true);
          placeCaretAtEnd(inputSearch.input, true);
        }, {cancelMouseDown: true});
        onCleanup(detach);
      }}
    />
  );

  const pickDateBtn = props.onDatePick && (
    <ButtonIconTsx
      icon="calendar"
      onClick={() => {
        PopupElement.createPopup(
          PopupDatePicker,
          new Date(),
          props.onDatePick
        ).show();
      }}
    />
  );

  let scrollableDiv: HTMLDivElement;
  const scrollable = (
    <ScrollableYTsx
      ref={scrollableDiv}
      {...(!isSmallScreen() && {
        class: 'topbar-search-left-results topbar-search-left-collapsable',
        style: calculateResultsHeight() ? {height: calculateResultsHeight() + 'px'} : undefined
      })}
      onScrolledBottom={() => {
        loadMore()?.();
      }}
    >
      {!isSmallScreen() && <div class="topbar-search-left-delimiter"></div>}
      <Animated type="cross-fade">
        {list()?.element}
      </Animated>
    </ScrollableYTsx>
  );

  let reactionsScrollableDiv: HTMLDivElement;
  const reactionsScrollable = (
    <ScrollableXTsx ref={reactionsScrollableDiv} class="topbar-search-left-reactions-scrollable">
      <div class="topbar-search-left-reactions-padding"></div>
      {reactionsElement()}
      <div class="topbar-search-left-reactions-padding"></div>
    </ScrollableXTsx>
  );

  let searchTypesScrollableDiv: HTMLDivElement;
  const searchTypesScrollable = (
    <ScrollableXTsx ref={searchTypesScrollableDiv} class="topbar-search-left-reactions-scrollable">
      <div class="topbar-search-left-reactions-padding"></div>
      <div class="topbar-search-left-search-types">
        {SEARCH_TYPES.map((type) => (<SearchTypeEntity type={type} />))}
      </div>
      <div class="topbar-search-left-reactions-padding"></div>
    </ScrollableXTsx>
  );

  let container: HTMLDivElement;
  return (
    <div ref={container} class="topbar-search-container">
      <div
        class={classNames('topbar-search-left-container', isActive() && 'is-focused')}
        // style={calculateHeight() ? {height: calculateHeight() + 'px'} : undefined}
      >
        <div class="topbar-search-left-background">
          {/* <div class="topbar-search-left-background-shadow"></div> */}
        </div>
        {inputSearch.container}
        {/* shouldShowReactions() &&  */!isSmallScreen() && (
          <div
            class="topbar-search-left-reactions-container topbar-search-left-collapsable"
            style={calculateReactionsHeight() ? {height: calculateReactionsHeight() + 'px'} : undefined}
          >
            <div class="topbar-search-left-delimiter"></div>
            {reactionsScrollable}
          </div>
        )}
        {/* shouldShowReactions() &&  */!isSmallScreen() && (
          <div
            class="topbar-search-left-reactions-container topbar-search-left-collapsable"
            style={calculateSearchTypesHeight() ? {height: calculateSearchTypesHeight() + 'px'} : undefined}
          >
            <div class="topbar-search-left-delimiter"></div>
            {searchTypesScrollable}
          </div>
        )}
        {!isSmallScreen() && scrollable}
      </div>
      {!isSmallScreen() && (
        <div class="topbar-search-right-container">
          {pickUserBtn && (
            <div class={classNames('topbar-search-right-filter', (filteringSender() || isHashtag()) && 'is-hidden')}>
              {pickUserBtn}
            </div>
          )}
          {pickDateBtn && (
            <div class={classNames('topbar-search-right-filter', isHashtag() && 'is-hidden')}>
              {pickDateBtn}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
