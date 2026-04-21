/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import IS_TOUCH_SUPPORTED from '@environment/touchSupport';
import AppSelectPeers, {SelectSearchPeerType} from '@components/appSelectPeers';
import PopupElement, {createPopup, PopupContext, PopupContextValue} from '@components/popups/indexTsx';
import {LangPackKey, i18n} from '@lib/langPack';
import {Modify} from '@types';
import {IsPeerType} from '@appManagers/appPeersManager';
import TransitionSlider from '@components/transition';
import appNavigationController, {NavigationItem} from '@components/appNavigationController';
import {ForumTopic} from '@layer';
import Row from '@components/row';
import wrapEmojiText from '@lib/richTextProcessor/wrapEmojiText';
import {avatarNew} from '@components/avatarNew';
import {makeMediaSize} from '@helpers/mediaSize';
import getDialogIndex from '@appManagers/utils/dialogs/getDialogIndex';
import {Middleware} from '@helpers/middleware';
import deferredPromise from '@helpers/cancellablePromise';
import {MOUNT_CLASS_TO} from '@config/debug';
import findUpAttribute from '@helpers/dom/findUpAttribute';
import cancelEvent from '@helpers/dom/cancelEvent';
import rootScope from '@lib/rootScope';
import apiManagerProxy from '@lib/apiManagerProxy';
import createTopPeersList from '@components/topPeersList';
import findAndSplice from '@helpers/array/findAndSplice';
import FoldersTabs from '@components/foldersTabs';
import {observeResize} from '@components/resizeObserver';
import {render} from 'solid-js/web';
import {selectTarget} from '@components/horizontalMenu';
import {ScrollableContextValue} from '@components/scrollable2';
import whichChild from '@helpers/dom/whichChild';
import showLimitPopup from '@components/popups/limit';
import type DialogsStorage from '@lib/storages/dialogs';
import type MonoforumDialogsStorage from '@lib/storages/monoforumDialogs';
import wrapPeerTitle from '@components/wrappers/peerTitle';
import {Accessor, createSignal, JSX, untrack, useContext} from 'solid-js';
import fastSmoothScroll from '@helpers/fastSmoothScroll';
import {AppManagers} from '@lib/managers';

type PopupPickUserSelectedItem = {
  peerId: PeerId,
  threadId?: number,
  monoforumThreadId?: PeerId,
  key: string
};

export type PopupPickUserOptions = Modify<ConstructorParameters<typeof AppSelectPeers>[0], {
  appendTo?: never,
  managers?: never,
  onSelect?: (chosen: PopupPickUserSelectedItem[]) => Promise<void> | void,
  onClose?: () => void,
  onCloseAfterTimeout?: () => void,
  middleware?: never,
  titleLangKey: LangPackKey,
  initial?: PeerId[],
  useTopics?: boolean,
  footerButton?: (element: HTMLElement) => void,
  footer?: (ctx: {multiSelect: Accessor<AppSelectPeers['multiSelect']>}) => JSX.Element,
  autoHeight?: boolean,
  showTopPeers?: boolean,
  btnConfirmOnEnter?: Parameters<typeof PopupElement>[0]['btnConfirmOnEnter']
}>;

async function wrapTopicRow({
  peerId,
  threadId,
  middleware
}: {
  peerId: PeerId,
  threadId: number,
  middleware: Middleware
}) {
  const size = makeMediaSize(32, 32);
  const row = new Row({
    title: threadId ? await wrapPeerTitle({peerId, threadId}) : i18n('AllMessages'),
    clickable: true
  });
  row.container.dataset.peerId = [peerId, threadId].filter(Boolean).join('_');
  row.container.classList.add('selector-forum-topic');
  const media = row.createMedia('abitbigger');
  if(threadId) {
    const avatar = avatarNew({
      peerId,
      threadId,
      middleware,
      size: size.width,
      wrapOptions: {
        middleware,
        textColor: 'primary-text-color',
        customEmojiSize: size
      }
    });
    await avatar.readyThumbPromise;
    media.append(avatar.node);
  } else {
    media.append(wrapEmojiText('💬'));
    row.container.classList.add('selector-forum-topic-all');
  }

  return row.container;
}

export default function showPickUserPopup(options: PopupPickUserOptions) {
  let multiSelect: AppSelectPeers['multiSelect'];
  if(typeof(options.multiSelect) === 'boolean') {
    multiSelect = options.multiSelect ? 'enabled' : 'disabled';
  } else {
    multiSelect = options.multiSelect;
  }
  multiSelect ||= 'disabled';

  const _onSelect = options.onSelect;

  const [show, setShow] = createSignal(false);
  const [canGoBack, setCanGoBack] = createSignal(false);
  const [multiSelectMode, setMultiSelectMode] = createSignal<AppSelectPeers['multiSelect']>(multiSelect);

  let selector: AppSelectPeers;
  let forumSelector: AppSelectPeers | undefined;
  let transition: ReturnType<typeof TransitionSlider> | undefined;
  let forumNavigationItem: NavigationItem | undefined;
  let btnConfirm: HTMLButtonElement;
  let isMonoforum = false;
  const selected: Array<PopupPickUserSelectedItem> = [];

  let context: PopupContextValue;
  let managers: AppManagers;
  let middleware: Middleware;
  let night: boolean;

  const tabsContainer = document.createElement('div');
  tabsContainer.classList.add('tabs-container');

  const finalize = async() => {
    if(_onSelect) {
      const res = _onSelect(selected);
      if(res instanceof Promise) {
        try {
          await res;
        } catch(err) {
          return;
        }
      }
    }

    setShow(false);
  };

  const onSingleSelect = async(
    sel: AppSelectPeers,
    key: PeerId | string,
    adding: boolean
  ) => {
    key = '' + key;
    const [_peerId, _threadId] = key.split('_');
    const peerId = _peerId.toPeerId();
    const threadId = _threadId ? +_threadId : undefined;
    const item: PopupPickUserSelectedItem = {
      peerId,
      threadId: isMonoforum ? undefined : threadId,
      monoforumThreadId: isMonoforum ? threadId : undefined,
      key
    };

    if(adding) selected.push(item);
    else findAndSplice(selected, (item) => item.key === key);

    if(
      sel.getSelected().length ||
      sel.multiSelect === 'enabled'
    ) {
      return;
    }

    await finalize();
  };

  const onBackClick = () => {
    if(forumSelector) {
      const selected = forumSelector.getSelected();
      selector.removeBatch(selector.getSelected(), false);
      selector.setMultiSelectMode(forumSelector.multiSelect);
      selector.addInitial(selected);
    }

    transition?.(selector.container);
    if(forumNavigationItem) {
      appNavigationController.removeItem(forumNavigationItem);
      forumNavigationItem = undefined;
    }
    setCanGoBack(false);
  };

  const createForumSelector = async({
    peerId,
    placeholder,
    isMonoforum: _isMonoforum
  }: {
    peerId: PeerId,
    placeholder: LangPackKey,
    isMonoforum: boolean
  }) => {
    const fsMiddlewareHelper = middleware.create();
    const fsMiddleware = fsMiddlewareHelper.get();
    const deferred = deferredPromise<void>();
    let offsetIndex: number, lastQuery: string, firstRender = true;
    isMonoforum = _isMonoforum;
    const selected = selector.getSelected();
    const fs = forumSelector = new AppSelectPeers({
      middleware: fsMiddleware,
      appendTo: tabsContainer,
      managers,
      rippleEnabled: false,
      night,
      multiSelect,
      placeholder,
      peerType: ['custom'],
      onSelect: (peerId, adding) => {
        onSingleSelect(fs, peerId, adding);
      },
      getMoreCustom: async(q, middleware) => {
        if(lastQuery !== q) {
          offsetIndex = undefined;
          lastQuery = q;
        }

        const limit = 20;
        let result: Awaited<ReturnType<DialogsStorage['getDialogs']> | ReturnType<MonoforumDialogsStorage['getDialogs']>>;
        if(_isMonoforum) {
          result = await managers.monoforumDialogsStorage.getDialogs({
            parentPeerId: peerId,
            limit,
            offsetIndex
          });
        } else {
          result = await managers.dialogsStorage.getDialogs({
            query: q,
            filterId: peerId,
            limit,
            skipMigrated: true,
            offsetIndex
          });
        }

        if(!middleware()) {
          return;
        }

        offsetIndex = getDialogIndex(result.dialogs[result.dialogs.length - 1]);

        return {
          result: _isMonoforum ?
            result.dialogs.map((dialog) => dialog.peerId) as any :
            result.dialogs.map((forumTopic) => (forumTopic as ForumTopic.forumTopic).id),
          isEnd: result.isEnd
        };
      },
      renderResultsFunc: async(threadIds, append) => {
        if(firstRender) {
          firstRender = false;

          if(apiManagerProxy.isBotforum(peerId)) {
            threadIds.unshift(undefined);
          }
        }

        const promises = threadIds.map((threadId) => {
          return wrapTopicRow({peerId, threadId, middleware: fsMiddleware});
        });
        const elements = await Promise.all(promises);
        elements.forEach((element) => {
          const sel = fs.selected.has(element.dataset.peerId);
          element.prepend(fs.checkbox(sel));
        });
        fs.list[!append ? 'append' : 'prepend'](...elements);
      },
      placeholderSizes: _isMonoforum ? undefined : {
        avatarSize: 32,
        avatarMarginRight: 72 - 32 - 17,
        marginVertical: 8,
        marginLeft: 17,
        lineMarginVertical: 11,
        gapVertical: 0,
        totalHeight: 48,
        statusWidth: 0,
        noSecondLine: true,
        night
      },
      onFirstRender: () => {
        deferred.resolve();
      },
      noSearch: _isMonoforum && !selected.length
    });

    fs.setMultiSelectMode(selector.multiSelect);
    fs.addInitial(selected);
    fs.container.classList.add('tabs-tab');
    fs.container.middlewareHelper = fsMiddlewareHelper;
    if(_isMonoforum && fs.selectorSearch) {
      fs.selectorSearch.inputSearch.container.classList.add('hide');
    }

    await deferred;

    setCanGoBack(true);
    transition?.(fs.container);
    const navigationItem: NavigationItem = forumNavigationItem = {
      type: 'popup',
      onPop: () => {
        onBackClick();
      }
    };
    appNavigationController.pushItem(navigationItem);
    middleware.onClean(() => {
      isMonoforum = false;
      appNavigationController.removeItem(navigationItem);
    });
  };

  const createFolderTabs = (afterElement: HTMLElement) => {
    let menu: HTMLElement;
    let prevId = -1;
    const mount = document.createElement('div');
    mount.classList.add('popup-forward-folder-tabs-container', 'collapsable');
    afterElement.after(mount);
    let scrollableContext: ScrollableContextValue;

    const sectionContainer = selector.selectorSearch.section.container;
    const unobserve = observeResize(sectionContainer, () => {
      mount.style.top = sectionContainer.offsetHeight + 'px';
    });
    const lateMiddleware = untrack(() => context.lateMiddlewareHelper).get();
    lateMiddleware.onClean(unobserve);

    const scrollToStart = (callback: () => void) => {
      let clicked = false;
      const onFinish = () => {
        if(!clicked) {
          clicked = true;
          callback();
        }
      };

      fastSmoothScroll({
        container: selector.scrollable.container,
        element: selector.section.container,
        position: 'start',
        getElementPosition: ({elementPosition}) => elementPosition -
          mount.offsetHeight -
          sectionContainer.offsetHeight,
        startCallback: ({duration, path}) => {
          if(path >= 0) onFinish();
          else setTimeout(onFinish, Math.max(0, duration / 2));
        }
      }).finally(callback);
    };

    const onTabClick = (target: HTMLElement, id: number) => {
      selectTarget({
        target,
        id,
        tabs: menu,
        onClick: async() => {
          const filterId = +(target.dataset.filterId || 0);
          const available = await rootScope.managers.filtersStorage.isFilterIdAvailable(filterId);
          if(!available) {
            showLimitPopup('folders');
            return false;
          }

          if(prevId !== -1) {
            await new Promise<void>((resolve) => scrollToStart(resolve));
          }

          selector.setFolderId(filterId);
          prevId = id;
        },
        prevId,
        scrollableX: scrollableContext
      });
    };

    const dispose = render(() => FoldersTabs({
      scrollableProps: {
        class: 'popup-forward-folder-tabs',
        scrollableProps: {
          contextRef: (ref) => scrollableContext = ref
        }
      },
      menuProps: {
        ref: (ref) => {
          menu = ref;
          queueMicrotask(() => {
            const first = ref.firstElementChild as HTMLElement;
            if(first) onTabClick(first, 0);
          });
        },
        onClick: (e) => {
          cancelEvent(e);
          const target = findUpAttribute(e.target, 'data-filter-id') as HTMLElement;
          if(!target) return;
          const id = whichChild(target);
          onTabClick(target, id);
        }
      },
      gradientProps: {
        color: 'background',
        className: 'popup-forward-folder-tabs-gradient'
      }
    }), mount);

    lateMiddleware.onClean(dispose);

    selector.onSearchChange = (query) => {
      mount.classList.toggle('is-collapsed', !!query);
    };
  };

  function Inner(): JSX.Element {
    context = useContext(PopupContext);
    managers = untrack(() => context.managers);
    middleware = untrack(() => context.middlewareHelper.get());
    night = untrack(() => context.night);

    selector = new AppSelectPeers({
      ...options,
      multiSelect,
      middleware,
      appendTo: tabsContainer,
      onChange: (length) => {
        btnConfirm?.classList.toggle('is-visible', !!length);
        options.onChange?.(length);
      },
      onSelect: async(peerId, adding, e) => {
        let _isMonoforum = false;
        if(
          options.useTopics &&
          e.isTrusted &&
          (
            apiManagerProxy.isForum(peerId) ||
            apiManagerProxy.isBotforum(peerId) ||
            (_isMonoforum = (
              await managers.appPeersManager.canManageDirectMessages(peerId) &&
              await managers.appPeersManager.isMonoforum(peerId)
            ))
          )
        ) {
          createForumSelector({
            peerId,
            placeholder: options.placeholder,
            isMonoforum: _isMonoforum
          });
          return false;
        }

        onSingleSelect(selector, peerId, adding);
      },
      onFirstRender: () => {
        setShow(true);
        selector.checkForTriggers();

        if(!IS_TOUCH_SUPPORTED && selector.inputSearch) {
          selector.inputSearch.input.focus();
        }
      },
      rippleEnabled: false,
      avatarSize: 'abitbigger',
      managers,
      night
    });
    selector.container.classList.add('tabs-tab');

    const originalSetMultiSelectMode = selector.setMultiSelectMode.bind(selector);
    selector.setMultiSelectMode = (mode) => {
      originalSetMultiSelectMode(mode);
      setMultiSelectMode(mode);
    };
    setMultiSelectMode(selector.multiSelect);

    if(options.showTopPeers) {
      const {group, promise} = createTopPeersList({
        middleware,
        className: 'popup-forward-top-peers collapsable',
        modifyPeers: (peers) => {
          findAndSplice(peers, (peer) => peer.id === rootScope.myId);
          peers.unshift({
            id: rootScope.myId,
            rating: 0
          });
          return peers;
        }
      });
      selector.heightContainer.before(group.container);

      createFolderTabs(group.container);

      const prevOnSearchChange = selector.onSearchChange;
      selector.onSearchChange = (query) => {
        group.container.classList.toggle('is-collapsed', !!query);
        prevOnSearchChange?.(query);
      };

      if(multiSelect !== 'disabled') promise.then(() => {
        const topPeerElements = group.list.querySelectorAll<HTMLElement>('.chatlist-chat');

        topPeerElements.forEach((el) => {
          const peerId = el.dataset.peerId.toPeerId();
          const sel = selector.selected.has(peerId);
          el.prepend(selector.checkbox(sel, 'white'));
        });
      });
    }

    if(options.initial) {
      selector.addInitial(options.initial);
    }
    selector.container.classList.add('active');

    if(options.useTopics) {
      transition = TransitionSlider({
        content: tabsContainer,
        type: 'tabs',
        transitionTime: 150,
        animateFirst: false,
        onTransitionEnd: (id) => {
          if(!id) {
            (Array.from(tabsContainer.children) as HTMLElement[]).forEach((el) => {
              if(el !== selector.container) {
                (el as any).middlewareHelper?.destroy();
                el.remove();
              }
            });
          } else {
            selector.clearInput();
          }
        }
      });
      transition(selector.container);
    }

    return tabsContainer;
  }

  function FooterInner(): JSX.Element {
    if(options.footer) {
      return options.footer({multiSelect: multiSelectMode});
    }
    btnConfirm = document.createElement('button');
    btnConfirm.classList.add('btn-primary', 'btn-color-primary');
    options.footerButton?.(btnConfirm);
    return btnConfirm;
  }

  createPopup(() => {
    return (
      <PopupElement
        class="popup-forward"
        containerClass={options.autoHeight ? 'popup-forward-auto-height' : undefined}
        closable
        body
        footer
        withConfirm
        title={options.titleLangKey ?? true}
        show={show()}
        onClose={() => {
          options.onClose?.();
        }}
        onCloseAfterTimeout={() => {
          selector?.destroy();
          selector = undefined;
          options.onCloseAfterTimeout?.();
        }}
        btnConfirmOnEnter={options.btnConfirmOnEnter}
      >
        <PopupElement.Header>
          <PopupElement.CloseButton
            canGoBack={canGoBack()}
            onBackClick={onBackClick}
          />
          <PopupElement.Title title={options.titleLangKey} />
        </PopupElement.Header>
        <PopupElement.Body>
          <Inner />
        </PopupElement.Body>
        <PopupElement.Footer class="popup-forward-footer" floating>
          <FooterInner />
        </PopupElement.Footer>
      </PopupElement>
    );
  });

  return {
    get selector() {
      return selector;
    },
    hide() {
      setShow(false);
    },
    finalize
  };
}

export async function showPickUser2Popup<T extends boolean = false>({
  peerType,
  filterPeerTypeBy,
  chatRightsActions,
  multiSelect,
  limit,
  limitCallback,
  titleLangKey,
  placeholder,
  exceptSelf
}: {
  peerType?: SelectSearchPeerType[],
  filterPeerTypeBy: AppSelectPeers['filterPeerTypeBy'],
  chatRightsActions?: PopupPickUserOptions['chatRightsActions'],
  placeholder?: LangPackKey,
  multiSelect?: T,
  limit?: number,
  limitCallback?: () => void,
  titleLangKey?: LangPackKey,
  exceptSelf?: boolean
}) {
  return new Promise<T extends false ? PeerId : PeerId[]>((resolve, reject) => {
    let resolved = false;
    const popup = showPickUserPopup({
      peerType,
      placeholder: placeholder || 'SelectChat',
      onSelect: (chosen) => {
        resolved = true;
        resolve((multiSelect ? chosen.map((c) => c.peerId) : chosen[0].peerId) as any);
      },
      filterPeerTypeBy,
      chatRightsActions,
      titleLangKey,
      exceptSelf,
      onClose: () => {
        if(!resolved) {
          reject();
        }
      }
    });

    if(limit) {
      popup.selector?.setLimit(limit, limitCallback);
    }
  });
}

export async function showPickUser3Popup(
  types: Parameters<typeof AppSelectPeers['convertPeerTypes']>[0] = ['users', 'bots', 'groups', 'channels'],
  chatRightsActions?: PopupPickUserOptions['chatRightsActions']
) {
  if(!Array.isArray(types)) {
    types = [];
  }

  const filterPeerTypeBy: IsPeerType[] = AppSelectPeers.convertPeerTypes(types);
  const peerType: SelectSearchPeerType[] = ['dialogs'];
  if(types.includes('users')) peerType.push('contacts');

  if(!filterPeerTypeBy.length) {
    throw undefined;
  }

  return showPickUser2Popup({peerType, filterPeerTypeBy, chatRightsActions});
}

export function showSharingPickerPopup(options: {
  onSelect: PopupPickUserOptions['onSelect'],
  chatRightsActions?: PopupPickUserOptions['chatRightsActions'],
  excludeMonoforums?: PopupPickUserOptions['excludeMonoforums'],
  excludeBotforums?: PopupPickUserOptions['excludeBotforums'],
  placeholder?: LangPackKey,
  selfPresence?: LangPackKey,
  onCloseAfterTimeout?: () => void,
  onClose?: () => void
}) {
  options.chatRightsActions ??= ['send_plain'];
  options.placeholder ??= 'ShareModal.Search.Placeholder';
  options.selfPresence ??= 'ChatYourSelf';
  return showPickUserPopup({
    titleLangKey: 'ShareWith',
    showTopPeers: true,
    ...options,
    peerType: ['dialogs', 'contacts']
  });
}

export function showSharingPicker2Popup(options?: Modify<Parameters<typeof showSharingPickerPopup>[0], {onSelect?: never}>) {
  return new Promise<{peerId: PeerId, threadId?: number, monoforumThreadId?: PeerId}>((resolve, reject) => {
    let resolved = false;
    showSharingPickerPopup({
      ...(options || {}),
      onSelect: (chosen) => {
        resolved = true;
        resolve(chosen[0]);
      },
      onClose: () => {
        if(!resolved) {
          reject();
        }
      }
    });
  });
}

export function showReplyPickerPopup(options: Pick<PopupPickUserOptions, 'excludeBotforums' | 'excludeMonoforums'> = {}) {
  return showSharingPicker2Popup({
    placeholder: 'ReplyToDialog',
    selfPresence: 'SavedMessagesInfoQuote',
    ...options
  });
}

export function showContactPickerPopup() {
  return new Promise<PeerId>((resolve, reject) => {
    let resolved = false;
    showPickUserPopup({
      titleLangKey: 'Contacts',
      peerType: ['contacts'],
      placeholder: 'Search',
      onSelect: (chosen) => {
        resolved = true;
        resolve(chosen[0].peerId);
      },
      onClose: () => {
        if(!resolved) {
          reject();
        }
      }
    });
  });
}
