/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {createEffect, createSignal, onCleanup, JSX, createMemo, onMount, splitProps, on} from 'solid-js';
import InputSearch from '../inputSearch';
import {ButtonIconTsx, createListTransition, createMiddleware} from '../stories/viewer';
import classNames from '../../helpers/string/classNames';
import PopupElement from '../popups';
import PopupDatePicker from '../popups/datePicker';
import rootScope from '../../lib/rootScope';
import apiManagerProxy from '../../lib/mtproto/mtprotoworker';
import appDialogsManager from '../../lib/appManagers/appDialogsManager';
import {Message} from '../../layer';
import getPeerId from '../../lib/appManagers/utils/peers/getPeerId';
import Scrollable from '../scrollable';
import {resolveElements} from '@solid-primitives/refs';
import liteMode from '../../helpers/liteMode';
import placeCaretAtEnd from '../../helpers/dom/placeCaretAtEnd';
import {createLoadableList} from '../sidebarRight/tabs/statistics';
import {Middleware} from '../../helpers/middleware';
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

export function AnimationList(props: {
  children: JSX.Element
  animationOptions: KeyframeAnimationOptions,
  keyframes: Keyframe[],
  animateOnlyReplacement?: boolean
}) {
  const transitionList = createListTransition(resolveElements(() => props.children).toArray, {
    exitMethod: 'keep-index',
    onChange: ({added, removed, finishRemoved}) => {
      const options = props.animationOptions;
      if(!liteMode.isAvailable('animations')) {
        options.duration = 0;
      }

      const keyframes = props.keyframes;
      queueMicrotask(() => {
        if(!props.animateOnlyReplacement || removed.length) {
          for(const element of added) {
            element.animate(keyframes, options);
          }
        }

        if(props.animateOnlyReplacement && !added.length) {
          finishRemoved(removed);
          return;
        }

        const reversedKeyframes = keyframes.slice().reverse();
        const promises: Promise<any>[] = [];
        for(const element of removed) {
          const animation = element.animate(reversedKeyframes, options);
          promises.push(animation.finished);
        }

        Promise.all(promises).then(() => finishRemoved(removed));
      });
    }
  }) as unknown as JSX.Element;

  return transitionList;
}

const renderHistoryResult = ({middleware, peerId, fromSavedDialog, messages, query}: {middleware: Middleware, peerId: PeerId, fromSavedDialog: boolean, messages: (Message.message | Message.messageService)[], query: string}) => {
  const promises = messages.map(async(message) => {
    const loadPromises: Promise<any>[] = [];
    const {dom} = appDialogsManager.addDialogAndSetLastMessage({
      peerId: fromSavedDialog ? rootScope.myId : peerId,
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

export default function TopbarSearch(props: {
  peerId: PeerId,
  threadId?: number,
  canFilterSender?: boolean,
  query?: string,
  onClose?: () => void,
  onDatePick?: (timestamp: number) => void
}) {
  const query = props.query || 'pizza';

  const [isInputFocused, setIsInputFocused] = createSignal(false);
  const [value, setValue] = createSignal(query);
  const [count, setCount] = createSignal<number>();
  const [list, setList] = createSignal<HTMLElement>();
  const [messages, setMessages] = createSignal<(Message.message | Message.messageService)[]>();
  const [loadMore, setLoadMore] = createSignal<() => Promise<void>>();
  const [target, setTarget] = createSignal<HTMLElement>();
  const [filteringSender, setFilteringSender] = createSignal<boolean>(false);
  const [filterPeerId, setFilterPeerId] = createSignal<PeerId>();
  const isActive = createMemo(() => /* true ||  */isInputFocused());
  const shouldHaveListNavigation = createMemo(() => (isInputFocused() && count() && list()) || undefined);

  onMount(() => {
    placeCaretAtEnd(inputSearch.input);
  });

  let detachListNavigation: () => void;
  createEffect(() => {
    if(shouldHaveListNavigation()) {
      const {detach} = attachListNavigation({
        list: shouldHaveListNavigation().firstElementChild as HTMLElement,
        type: 'y',
        onSelect: (target) => {
          setTarget(target as HTMLElement);
          blurActiveElement();
        },
        activeClassName: 'menu-open',
        cancelMouseDown: true
      });

      detachListNavigation = detach;
    } else {
      detachListNavigation?.();
      detachListNavigation = undefined;
    }
  });

  const navigationItem: NavigationItem = {
    type: 'topbar-search',
    onPop: () => {
      if(isActive()) {
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

  const inputSearch = new InputSearch({
    placeholder: 'Search',
    onChange: (value) => {
      setValue(value);
    },
    onClear: () => {
      if(filteringSender()) {
        setFilteringSender(false);
        return;
      }

      props.onClose?.();
    },
    onFocusChange: setIsInputFocused,
    alwaysShowClear: true,
    noBorder: true
  });
  inputSearch.container.classList.add('topbar-search-input-container');
  inputSearch.input.classList.add('topbar-search-input');
  onCleanup(() => {
    inputSearch.remove();
  });
  inputSearch.value = query;

  const fromText = I18n.format('Search.From', true);
  const fromWidth = getTextWidth(fromText, FontFull);
  createEffect(() => {
    inputSearch.container.style.setProperty('--padding-placeholder', (filteringSender() ? fromWidth : 0) + 'px');
  });

  const inputSearchTools = document.createElement('div');
  inputSearchTools.classList.add('topbar-search-input-tools');
  inputSearch.clearBtn.replaceWith(inputSearchTools);

  const arrowButton = (direction: 'up' | 'down') => {
    return (
      <ButtonIconTsx
        icon={direction}
        class={classNames('input-search-part', 'topbar-search-input-arrow', !count() && 'hide')}
        noRipple
        onClick={() => {
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

          setTarget(_target);
        }}
      />
    );
  };

  const inputUpButton = arrowButton('up');
  const inputDownButton = arrowButton('down');

  inputSearchTools.append(inputUpButton as HTMLElement, inputDownButton as HTMLElement, inputSearch.clearBtn);

  createEffect(() => {
    const {peerId, threadId} = props;
    const fromSavedDialog = !!(peerId === rootScope.myId && threadId);
    const query = value();
    const middleware = createMiddleware().get();

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
        limit: 30
      });
      if(!middleware()) {
        return;
      }

      const messages = result.history.map((mid) => apiManagerProxy.getMessageByPeer(peerId, mid));
      const rendered = await renderHistoryResult({middleware, peerId, fromSavedDialog, messages, query});
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

    let ref: HTMLDivElement;
    const list = (
      <div
        ref={ref}
        class="topbar-search-left-chatlist chatlist"
      >
        {count() === 0 ? (
          <div class="topbar-search-left-results-empty">
            {i18n('Search.Empty', [wrapEmojiText(stringMiddleOverflow(query, 18))])}
          </div>
        ) : (
          <>
            <div>
              {f().rendered}
            </div>
            {f().rendered && <div class="topbar-search-left-results-padding" />}
          </>
        )}
      </div>
    );

    setLoadMore(() => undefined);
    setMessages();

    let first = true;
    createEffect(
      on(
        () => f(),
        ({rendered, values, loadMore}) => {
          setCount(rendered.length);
          setLoadMore(() => loadMore);
          setMessages(values);
          if(first) {
            setList(ref);
            scrollableDiv.scrollTop = 0;
            first = false;
          }
        },
        {defer: true}
      )
    );

    loadMore();
  });

  createEffect(
    on(
      target,
      (target) => {
        const idx = whichChild(target);
        if(idx === -1) {
          return;
        }

        const previousActive = target.parentElement.querySelector('.active');
        if(previousActive) {
          previousActive.classList.remove('active');
        }

        target.classList.add('active');

        const message = messages()[idx];
        appImManager.chat.setMessageId(message.mid);
      },
      {defer: true}
    )
  );

  const calculateHeight = createMemo(() => {
    if(!isActive()) {
      return;
    }

    const length = count();
    if(length === undefined) {
      return;
    }

    const delimiter = 2;
    if(length === 0) {
      return delimiter + 41;
    }

    const paddingVertical = 8 * 2;
    return Math.min(271, delimiter + paddingVertical + length * 56);
    // return 42 + 1 + 8 * 2 + length * 56;
  });

  let scrollableDiv: HTMLDivElement;
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
        <ScrollableYTsx
          ref={scrollableDiv}
          class="topbar-search-left-results"
          style={calculateHeight() ? {height: calculateHeight() + 'px'} : undefined}
          onScrolledBottom={() => {
            loadMore()?.();
          }}
        >
          <div class="topbar-search-left-delimiter"></div>
          <AnimationList
            animationOptions={{duration: 200, easing: 'ease-in-out'}}
            keyframes={[{opacity: 0}, {opacity: 1}]}
            animateOnlyReplacement
          >
            {list()}
          </AnimationList>
        </ScrollableYTsx>
      </div>
      <div class="topbar-search-right-container">
        {props.canFilterSender && !filteringSender() && (
          <ButtonIconTsx
            icon="newprivate"
            onClick={() => {
              setFilteringSender(true);
            }}
          />
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
