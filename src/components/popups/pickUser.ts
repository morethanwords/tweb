/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import IS_TOUCH_SUPPORTED from '@environment/touchSupport';
import AppSelectPeers, {SelectSearchPeerType} from '@components/appSelectPeers';
import PopupElement from '.';
import {LangPackKey, i18n} from '@lib/langPack';
import {Modify} from '@types';
import {IsPeerType} from '@appManagers/appPeersManager';
import ButtonCorner from '@components/buttonCorner';
import {simulateClickEvent} from '@helpers/dom/clickEvent';
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

type PopupPickUserOptions = Modify<ConstructorParameters<typeof AppSelectPeers>[0], {
  appendTo?: never,
  managers?: never,
  onSelect?: (chosen: {peerId: PeerId, threadId?: number, monoforumThreadId?: PeerId}[]) => Promise<void> | void,
  middleware?: never,
  titleLangKey: LangPackKey,
  initial?: PeerId[],
  useTopics?: boolean,
  footerButton?: (element: HTMLElement) => void,
  autoHeight?: boolean,
  showTopPeers?: boolean
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

export default class PopupPickUser extends PopupElement {
  public selector: AppSelectPeers;
  public forumSelector: AppSelectPeers;
  public transition: ReturnType<typeof TransitionSlider>;
  public forumNavigationItem: NavigationItem;
  private multiSelect: AppSelectPeers['multiSelect'];
  private _onSelect: PopupPickUserOptions['onSelect'];
  private isMonoforum: boolean;

  constructor(options: PopupPickUserOptions) {
    super(
      'popup-forward',
      {
        closable: true,
        overlayClosable: true,
        onBackClick: () => {
          if(this.forumSelector) {
            const selected = this.forumSelector.getSelected();
            this.selector.removeBatch(this.selector.getSelected(), false);
            this.selector.setMultiSelectMode(this.forumSelector.multiSelect);
            this.selector.addInitial(selected);
          }

          this.transition(this.selector.container);
          if(this.forumNavigationItem) {
            appNavigationController.removeItem(this.forumNavigationItem);
            this.forumNavigationItem = undefined;
          }
        },
        body: true,
        title: options.titleLangKey ?? true,
        footer: !!options.footerButton || undefined,
        withConfirm: !!options.footerButton || undefined
      }
    );

    if(typeof(options.multiSelect) === 'boolean') {
      this.multiSelect = options.multiSelect ? 'enabled' : 'disabled';
    } else {
      this.multiSelect = options.multiSelect;
    }

    this.multiSelect ||= 'disabled';

    this._onSelect = options.onSelect;

    this.addEventListener('closeAfterTimeout', () => {
      this.selector = undefined;
    });

    const tabsContainer = document.createElement('div');
    tabsContainer.classList.add('tabs-container');
    this.body.append(tabsContainer);

    this.selector = new AppSelectPeers({
      ...options,
      multiSelect: this.multiSelect,
      middleware: this.middlewareHelper.get(),
      appendTo: tabsContainer,
      onChange: (length) => {
        this.btnConfirm.classList.toggle('is-visible', !!length);
        options.onChange?.(length);
      },
      onSelect: async(peerId, adding, e) => {
        let isMonoforum = false;
        if(
          options.useTopics &&
          e.isTrusted && // * ignore context menu / chip simulated click
          (
            apiManagerProxy.isForum(peerId) ||
            apiManagerProxy.isBotforum(peerId) ||
            (isMonoforum = (
              await this.managers.appPeersManager.canManageDirectMessages(peerId) &&
              await this.managers.appPeersManager.isMonoforum(peerId)
            ))
          )
        ) {
          this.createForumSelector({
            tabsContainer,
            peerId,
            placeholder: options.placeholder,
            isMonoforum
          });
          return false;
        }

        this.onSingleSelect(this.selector, peerId);
      },
      onFirstRender: () => {
        this.show();
        this.selector.checkForTriggers(); // ! due to zero height before mounting

        if(!IS_TOUCH_SUPPORTED && this.selector.inputSearch) {
          this.selector.inputSearch.input.focus();
        }
      },
      rippleEnabled: false,
      avatarSize: 'abitbigger',
      managers: this.managers,
      night: this.night
    });
    this.selector.container.classList.add('tabs-tab');

    this.scrollable = this.selector.scrollable;

    if(options.showTopPeers) {
      const {group, promise} = createTopPeersList({
        middleware: this.middlewareHelper.get(),
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
      this.selector.heightContainer.before(group.container);

      this.createFolderTabs(group.container);

      const prevOnSearchChange = this.selector.onSearchChange;
      this.selector.onSearchChange = (query) => {
        group.container.classList.toggle('is-collapsed', !!query);
        prevOnSearchChange?.(query);
      };

      if(this.multiSelect !== 'disabled') promise.then(() => {
        const topPeerElements = group.list.querySelectorAll<HTMLElement>('.chatlist-chat');

        topPeerElements.forEach((el) => {
          const peerId = el.dataset.peerId.toPeerId();
          const selected = this.selector.selected.has(peerId);
          el.prepend(this.selector.checkbox(selected, 'white'));
        });
      });
    }

    if(!this.btnConfirm) {
      this.btnConfirm = this.btnConfirmOnEnter = ButtonCorner({icon: 'check'});
      this.body.append(this.btnConfirm);
    } else if(this.footer) {
      this.footer.append(this.btnConfirm);
      this.body.after(this.footer);
      this.footer.classList.add('abitlarger');
      options.footerButton?.(this.btnConfirm);
    }

    // attachClickEvent(this.btnConfirm, () => {
    //   onSelect(this.selector.getSelected() as PeerId[]);
    // }, {listenerSetter: this.listenerSetter});

    if(options.initial) {
      this.selector.addInitial(options.initial);
    }
    this.selector.container.classList.add('active');

    if(options.useTopics) {
      this.transition = TransitionSlider({
        content: tabsContainer,
        type: 'tabs',
        transitionTime: 150,
        animateFirst: false,
        onTransitionEnd: (id) => {
          if(!id) {
            (Array.from(tabsContainer.children) as HTMLElement[]).forEach((el) => {
              if(el !== this.selector.container) {
                el.middlewareHelper.destroy();
                el.remove();
              }
            });
          } else {
            this.selector.clearInput();
          }
        }
      });
      this.transition(this.selector.container);
    }

    if(options.autoHeight) {
      this.container.classList.add('popup-forward-auto-height');
    }
  }

  private onSingleSelect = async(
    selector: AppSelectPeers,
    key: PeerId | string
  ) => {
    if(selector.getSelected().length || selector.multiSelect === 'enabled') {
      return;
    }

    if(this._onSelect) {
      const [_peerId, _threadId] = ('' + key).split('_');
      const peerId = _peerId.toPeerId();
      const threadId = _threadId ? +_threadId : undefined;
      const chosen = [{
        peerId,
        threadId: this.isMonoforum ? undefined : threadId,
        monoforumThreadId: this.isMonoforum ? threadId : undefined
      }];
      const res = this._onSelect(chosen);
      if(res instanceof Promise) {
        try {
          await res;
        } catch(err) {
          return;
        }
      }
    }

    this.hide();
  };

  private createFolderTabs(afterElement: HTMLElement) {
    let menu: HTMLElement;
    let prevId = -1;
    const mount = document.createElement('div');
    mount.classList.add('popup-forward-folder-tabs-container', 'collapsable');
    afterElement.after(mount);
    let scrollableContext: ScrollableContextValue;

    const sectionContainer = this.selector.selectorSearch.section.container;
    const unobserve = observeResize(sectionContainer, () => {
      mount.style.top = sectionContainer.offsetHeight + 'px';
    });
    this.addEventListener('closeAfterTimeout', unobserve);

    const scrollToStart = (callback: () => void) => {
      let clicked = false;
      const onFinish = () => {
        if(!clicked) {
          clicked = true;
          callback();
        }
      };

      this.scrollable.scrollIntoViewNew({
        element: this.selector.section.container,
        position: 'start',
        getElementPosition: ({elementPosition}) => elementPosition -
          mount.offsetHeight -
          sectionContainer.offsetHeight,
        startCallback: ({duration, path}) => {
          if(path >= 0) onFinish();
          else setTimeout(onFinish, Math.max(0, duration / 2));
        }
      }).finally(onFinish);
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

          await new Promise<void>((resolve) => scrollToStart(resolve));

          this.selector.setFolderId(filterId);
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

    this.addEventListener('closeAfterTimeout', dispose);

    this.selector.onSearchChange = (query) => {
      mount.classList.toggle('is-collapsed', !!query);
    };
  }

  private async createForumSelector({
    tabsContainer,
    peerId,
    placeholder,
    isMonoforum
  }: {
    tabsContainer: HTMLElement,
    peerId: PeerId,
    placeholder: LangPackKey,
    isMonoforum: boolean
  }) {
    const middlewareHelper = this.middlewareHelper.get().create();
    const middleware = middlewareHelper.get();
    const deferred = deferredPromise<void>();
    let offsetIndex: number, lastQuery: string, firstRender = true;
    this.isMonoforum = isMonoforum;
    const selected = this.selector.getSelected();
    const forumSelector = this.forumSelector = new AppSelectPeers({
      middleware,
      appendTo: tabsContainer,
      managers: this.managers,
      rippleEnabled: false,
      night: this.night,
      multiSelect: this.multiSelect,
      placeholder,
      peerType: ['custom'],
      onSelect: (peerId) => {
        this.onSingleSelect(forumSelector, peerId);
      },
      getMoreCustom: async(q, middleware) => {
        if(lastQuery !== q) {
          offsetIndex = undefined;
          lastQuery = q;
        }

        const limit = 20;
        let result: Awaited<ReturnType<DialogsStorage['getDialogs']> | ReturnType<MonoforumDialogsStorage['getDialogs']>>;
        if(isMonoforum) {
          result = await this.managers.monoforumDialogsStorage.getDialogs({
            parentPeerId: peerId,
            limit,
            offsetIndex
          });
        } else {
          result = await this.managers.dialogsStorage.getDialogs({
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
          result: isMonoforum ?
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
          return wrapTopicRow({peerId, threadId, middleware});
        });
        const elements = await Promise.all(promises);
        elements.forEach((element) => {
          const selected = forumSelector.selected.has(element.dataset.peerId);
          element.prepend(forumSelector.checkbox(selected));
        });
        forumSelector.list[!append ? 'append' : 'prepend'](...elements);
      },
      placeholderSizes: isMonoforum ? undefined : {
        avatarSize: 32,
        avatarMarginRight: 72 - 32 - 17,
        marginVertical: 8,
        marginLeft: 17,
        lineMarginVertical: 11,
        gapVertical: 0,
        totalHeight: 48,
        statusWidth: 0,
        noSecondLine: true,
        night: this.night
      },
      onFirstRender: () => {
        deferred.resolve();
      },
      noSearch: isMonoforum && !selected.length
    });

    forumSelector.setMultiSelectMode(this.selector.multiSelect);
    forumSelector.addInitial(selected);
    forumSelector.container.classList.add('tabs-tab');
    forumSelector.container.middlewareHelper = middlewareHelper;
    if(isMonoforum && forumSelector.selectorSearch) {
      forumSelector.selectorSearch.inputSearch.container.classList.add('hide');
    }

    await deferred;

    this.btnCloseAnimatedIcon.classList.add('state-back');
    this.transition(forumSelector.container);
    const navigationItem = this.forumNavigationItem = {
      type: 'popup',
      onPop: () => {
        simulateClickEvent(this.btnClose);
      }
    };
    appNavigationController.pushItem(this.forumNavigationItem);
    this.addEventListener('close', () => {
      appNavigationController.removeItem(navigationItem);
    });
  }

  protected destroy() {
    super.destroy();
    this.selector?.destroy();
    this.selector = undefined;
  }

  public static async createPicker2<T extends boolean = false>({
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
      const popup = PopupElement.createPopup(PopupPickUser, {
        peerType,
        placeholder: placeholder || 'SelectChat',
        onSelect: (chosen) => {
          resolved = true;
          resolve((multiSelect ? chosen.map((c) => c.peerId) : chosen[0].peerId) as any);
        },
        filterPeerTypeBy,
        chatRightsActions,
        titleLangKey,
        exceptSelf
      });

      if(limit) {
        popup.selector.setLimit(limit, limitCallback);
      }

      popup.addEventListener('close', () => {
        if(!resolved) {
          reject();
        }
      }, {once: true});
    });
  }

  public static async createPicker(
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

    return this.createPicker2({peerType, filterPeerTypeBy, chatRightsActions});
  }

  public static createSharingPicker(options: {
    onSelect: ConstructorParameters<typeof PopupPickUser>[0]['onSelect'],
    chatRightsActions?: PopupPickUserOptions['chatRightsActions'],
    excludeMonoforums?: PopupPickUserOptions['excludeMonoforums'],
    excludeBotforums?: PopupPickUserOptions['excludeBotforums'],
    placeholder?: LangPackKey,
    selfPresence?: LangPackKey
  }) {
    options.chatRightsActions ??= ['send_plain'];
    options.placeholder ??= 'ShareModal.Search.Placeholder';
    options.selfPresence ??= 'ChatYourSelf';
    return PopupElement.createPopup(PopupPickUser, {
      titleLangKey: 'ShareWith',
      showTopPeers: true,
      ...options,
      peerType: ['dialogs', 'contacts']
    });
  }

  public static createSharingPicker2(options?: Modify<Parameters<typeof PopupPickUser['createSharingPicker']>[0], {onSelect?: never}>) {
    return new Promise<{ peerId: PeerId, threadId?: number, monoforumThreadId?: PeerId }>((resolve, reject) => {
      let resolved = false;
      const popup = PopupPickUser.createSharingPicker({
        ...(options || {}),
        onSelect: (chosen) => {
          resolved = true;
          resolve(chosen[0]);
        }
      });
      popup.addEventListener('close', () => {
        if(!resolved) {
          reject();
        }
      });
    });
  }

  public static createReplyPicker(options: Pick<PopupPickUserOptions, 'excludeBotforums' | 'excludeMonoforums'> = {}) {
    return this.createSharingPicker2({
      placeholder: 'ReplyToDialog',
      selfPresence: 'SavedMessagesInfoQuote',
      ...options
    });
  }

  public static createContactPicker() {
    return new Promise<PeerId>((resolve, reject) => {
      let resolved = false;
      const popup = PopupElement.createPopup(PopupPickUser, {
        titleLangKey: 'Contacts',
        peerType: ['contacts'],
        placeholder: 'Search',
        onSelect: (chosen) => {
          resolved = true;
          resolve(chosen[0].peerId);
        }
      });
      popup.addEventListener('close', () => {
        if(!resolved) {
          reject();
        }
      });
    });
  }
}

MOUNT_CLASS_TO.PopupPickUser = PopupPickUser;
