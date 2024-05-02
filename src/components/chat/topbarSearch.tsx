/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import type {ReactionsContext} from '../../lib/appManagers/appReactionsManager';
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

type LoadOptions = {
  middleware: Middleware,
  peerId: PeerId,
  threadId: number,
  query: string,
  fromPeerId?: PeerId,
  reaction?: Reaction
};

const renderHistoryResult = ({middleware, peerId, fromSavedDialog, messages, query/* , fromPeerId */}: LoadOptions & {fromSavedDialog: boolean, messages: (Message.message | Message.messageService)[]}) => {
  const promises = messages.map(async(message) => {
    const fromPeerId = message.fromId;
    const loadPromises: Promise<any>[] = [];
    const {dom} = appDialogsManager.addDialogAndSetLastMessage({
      peerId: fromSavedDialog ? rootScope.myId : (fromPeerId || peerId),
      container: false,
      avatarSize: 'abitbigger',
      meAsSaved: false,
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
  const {middleware, peerId, threadId, query, fromPeerId, reaction} = options;
  const fromSavedDialog = !!(peerId === rootScope.myId && threadId);
  let lastMessage: Message.message | Message.messageService, loading = false;
  const loadMore = async() => {
    if(loading) {
      return;
    }
    loading = true;

    const offsetId = lastMessage?.mid || 0;
    const offsetPeerId = lastMessage?.peerId || NULL_PEER_ID;
    const result = await rootScope.managers.appMessagesManager.getHistory({
      peerId,
      threadId,
      query,
      inputFilter: {_: 'inputMessagesFilterEmpty'},
      offsetId,
      offsetPeerId,
      limit: 30,
      fromPeerId,
      savedReaction: reaction ? [reaction as Reaction.reactionEmoji] : undefined
    });
    if(!middleware()) {
      return;
    }

    const messages = result.history.map((mid) => apiManagerProxy.getMessageByPeer(peerId, mid));
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

export default function TopbarSearch(props: {
  peerId: PeerId,
  threadId?: number,
  filterPeerId?: Accessor<PeerId>,
  canFilterSender?: boolean,
  query?: Accessor<string>,
  reaction?: Accessor<Reaction>,
  onClose?: () => void,
  onDatePick?: (timestamp: number) => void,
  onActive?: (active: boolean, showingReactions: boolean) => void
}) {
  const [isInputFocused, setIsInputFocused] = createSignal(false);
  const [value, setValue] = createSignal<string>('');
  const [count, setCount] = createSignal<number>();
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
  const shouldShowResults = isInputFocused;
  const shouldHaveListNavigation = createMemo(() => (shouldShowResults() && count() && list()) || undefined);
  const shouldShowReactions = createMemo(() => {
    const element = reactionsElement();
    const tags = savedReactionTags();
    return !!(element && tags?.length);
  });
  const isActive = createMemo(() => shouldShowReactions() || shouldShowResults());
  const isPremium = usePremium();

  if(props.onActive) {
    createEffect(() => {
      props.onActive(isActive(), shouldShowReactions());
    });

    onCleanup(() => {
      props.onActive(false, false);
    });
  }

  // full search replacement
  createEffect(() => {
    inputSearch.onChange(inputSearch.value = props.query());
    setFilteringSender(!!props.filterPeerId());
    setFilterPeerId(props.filterPeerId());
    setReaction(props.reaction());

    onMount(() => {
      placeCaretAtEnd(inputSearch.input);
    });
  });

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
      props.onClose?.();
    }
  };

  const inputSearch = new InputSearch({
    placeholder: 'Search',
    onChange: (value) => {
      setValue(value);
    },
    onClear: onInputClear,
    onFocusChange: setIsInputFocused,
    alwaysShowClear: true,
    noBorder: true
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
  inputSearch.input.addEventListener('keydown', onKeyDown);
  onCleanup(() => {
    inputSearch.input.removeEventListener('keydown', onKeyDown);
    inputSearch.remove();
  });

  const fromText = I18n.format('Search.From', true) + ' ';
  const fromWidth = getTextWidth(fromText, FontFull);
  const fromSpan = (<span class={classNames('topbar-search-input-from', filteringSender() && 'is-visible')}>{fromText}</span>);
  inputSearch.container.append(fromSpan as HTMLElement);
  createEffect<HTMLElement>((_element) => {
    const filtering = filteringSender();
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
        setFilterPeerId();
      }, {cancelMouseDown: true});
      onCleanup(detach);
      inputSearch.container.append(element);
    }

    inputSearch.container.style.setProperty('--padding-placeholder', (filtering ? fromWidth : 0) + 'px');
    inputSearch.container.style.setProperty('--padding-sender', (element ? element.offsetWidth + 6 : 0) + 'px');
    inputSearch.setPlaceholder(filtering && !element ? 'Search.Member' : 'Search');
    return element;
  });

  createEffect(async() => {
    const peerId = filterPeerId();
    const middleware = createMiddleware().get();
    let element: HTMLElement;
    if(peerId) {
      const entity = untrack(() => AppSelectPeers.renderEntity({
        key: peerId,
        middleware,
        avatarSize: 30,
        meAsSaved: false
      }));
      element = entity.element;
      await Promise.all(entity.promises);
      if(!middleware()) {
        return;
      }
    }

    setSenderInputEntity(element);
  });

  const MAX_HEIGHT = 271;

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
        }}
      />
    );
  };

  const b = inputSearch.clearBtn.previousSibling;
  let inputSearchTools: HTMLDivElement;
  (<div ref={inputSearchTools} class="topbar-search-input-tools">
    <ArrowButton direction="up" />
    <ArrowButton direction="down" />
    {inputSearch.clearBtn}
  </div>);
  b.after(inputSearchTools);

  createEffect(() => {
    const {peerId, threadId} = props;
    const query = value();
    const fromPeerId = filterPeerId();
    const isSender = filteringSender() && !fromPeerId;
    const middleware = createMiddleware().get();
    const isEmptyQuery = !query.trim();
    const _reaction = !isSender && reaction();

    setLoadMore(() => undefined);
    setMessages();
    setSendersPeerIds();
    setTarget();

    const loader = (isSender ? createParticipantsLoader : createSearchLoader)({
      middleware,
      peerId,
      threadId,
      query,
      fromPeerId,
      reaction: _reaction
    });

    let ref: HTMLDivElement;
    const list = (
      <div
        ref={ref}
        class="topbar-search-left-chatlist chatlist"
      >
        {count() === 0 ? (
          <div class="topbar-search-left-results-empty">
            {isEmptyQuery && fromPeerId ?
              i18n('Search.EmptyFrom', [(() => {
                const peerTitle = new PeerTitle({peerId: fromPeerId});
                return peerTitle.element;
              })()]) :
              i18n('Search.Empty', [wrapEmojiText(stringMiddleOverflow(query, 18))])
            }
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
    const onLoad = () => {
      if(first) {
        inputSearch.toggleLoading(false);
        setList({element: ref, type: isSender ? 'senders' : 'messages'});
        scrollableDiv.scrollTop = 0;
        first = false;
      }
    };

    if(!isSender && !fromPeerId && !_reaction && isEmptyQuery) {
      setCount();
      onLoad();
      return;
    }

    createEffect(
      on(
        () => loader(),
        ({rendered, values, loadMore}) => {
          setCount(rendered.length);
          setLoadMore(() => loadMore);
          if(isSender) setSendersPeerIds(values as any);
          else setMessages(values as any);
          onLoad();
        },
        {defer: true}
      )
    );

    inputSearch.toggleLoading(true);
    untrack(() => loader().loadMore());
  });

  createEffect(
    on(
      target,
      (target) => {
        const idx = whichChild(target);
        if(idx === -1) {
          return;
        }

        if(filteringSender() && !filterPeerId()) {
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

        const message = messages()[idx];
        appImManager.chat.setMessageId({lastMsgId: message.mid});
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
  rootScope.addEventListener('saved_tags', onSavedTags);
  onCleanup(() => {
    rootScope.removeEventListener('saved_tags', onSavedTags);
  });

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
        lastMsgId: undefined,
        mediaTimestamp: undefined,
        savedReaction: reaction ? [reaction] : undefined
      });
    }
  ));

  // * reset reaction on close
  onCleanup(() => {
    if(!reaction()) {
      return;
    }

    appImManager.chat.setMessageId({lastMsgId: undefined, mediaTimestamp: undefined, savedReaction: undefined});
  });

  const calculateResultsHeight = createMemo(() => {
    if(!shouldShowResults()) {
      return 0;
    }

    const length = count();
    if(length === undefined) {
      return 0;
    }

    const paddingVertical = 8 * 2;
    let height: number;
    if(length === 0) {
      height = 43;
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

    return shouldShowReactions() ? 62 : 0;
  });

  let scrollableDiv: HTMLDivElement, reactionsScrollableDiv: HTMLDivElement;
  return (
    <div class="topbar-search-container">
      <div
        class={classNames('topbar-search-left-container', isActive() && 'is-focused')}
        // style={calculateHeight() ? {height: calculateHeight() + 'px'} : undefined}
      >
        <div class="topbar-search-left-background">
          {/* <div class="topbar-search-left-background-shadow"></div> */}
        </div>
        {inputSearch.container}
        {/* shouldShowReactions() &&  */(
          <div
            class="topbar-search-left-reactions-container topbar-search-left-collapsable"
            style={calculateReactionsHeight() ? {height: calculateReactionsHeight() + 'px'} : undefined}
          >
            <div class="topbar-search-left-delimiter"></div>
            <ScrollableXTsx ref={reactionsScrollableDiv} class="topbar-search-left-reactions-scrollable">
              <div class="topbar-search-left-reactions-padding"></div>
              {reactionsElement()}
              <div class="topbar-search-left-reactions-padding"></div>
            </ScrollableXTsx>
          </div>
        )}
        <ScrollableYTsx
          ref={scrollableDiv}
          class="topbar-search-left-results topbar-search-left-collapsable"
          style={calculateResultsHeight() ? {height: calculateResultsHeight() + 'px'} : undefined}
          onScrolledBottom={() => {
            loadMore()?.();
          }}
        >
          <div class="topbar-search-left-delimiter"></div>
          <Animated type="cross-fade">
            {list()?.element}
          </Animated>
        </ScrollableYTsx>
      </div>
      <div class="topbar-search-right-container">
        {props.canFilterSender && (
          <div class={classNames('topbar-search-right-filter', filteringSender() && 'is-hidden')}>
            <ButtonIconTsx
              class="topbar-search-right-filter-button"
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
          </div>
        )}
        {props.onDatePick && (
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
        )}
      </div>
    </div>
  );
}
