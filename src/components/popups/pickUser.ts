/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import IS_TOUCH_SUPPORTED from '../../environment/touchSupport';
import AppSelectPeers, {SelectSearchPeerType} from '../appSelectPeers';
import PopupElement from '.';
import {LangPackKey, _i18n, i18n} from '../../lib/langPack';
import {Modify} from '../../types';
import {IsPeerType} from '../../lib/appManagers/appPeersManager';
import ButtonCorner from '../buttonCorner';
import {attachClickEvent, simulateClickEvent} from '../../helpers/dom/clickEvent';
import TransitionSlider from '../transition';
import appNavigationController, {NavigationItem} from '../appNavigationController';
import {ForumTopic} from '../../layer';
import Row from '../row';
import wrapEmojiText from '../../lib/richTextProcessor/wrapEmojiText';
import {avatarNew} from '../avatarNew';
import {makeMediaSize} from '../../helpers/mediaSize';
import getDialogIndex from '../../lib/appManagers/utils/dialogs/getDialogIndex';
import {Middleware} from '../../helpers/middleware';
import deferredPromise from '../../helpers/cancellablePromise';
import {MOUNT_CLASS_TO} from '../../config/debug';
import createMonoforumDialogsList from '../monoforumDrawer/list';
import appDialogsManager, {AutonomousMonoforumThreadList} from '../../lib/appManagers/appDialogsManager';
import findUpAttribute from '../../helpers/dom/findUpAttribute';
import cancelEvent from '../../helpers/dom/cancelEvent';

type PopupPickUserOptions = Modify<ConstructorParameters<typeof AppSelectPeers>[0], {
  multiSelect?: never,
  appendTo?: never,
  managers?: never,
  onSelect?: (peerId: PeerId, threadId?: number, monoforumThreadId?: PeerId) => Promise<void> | void,
  onMultiSelect?: (peerIds: PeerId[]) => Promise<void> | void,
  middleware?: never,
  titleLangKey?: LangPackKey,
  initial?: PeerId[],
  useTopics?: boolean,
  headerLangPackKey?: LangPackKey,
  footerButton?: (element: HTMLElement) => void,
  autoHeight?: boolean
}>;

async function wrapTopicRow({
  topic,
  middleware
}: {
  topic: ForumTopic.forumTopic,
  middleware: Middleware
}) {
  const size = makeMediaSize(32, 32);
  const row = new Row({
    title: wrapEmojiText(topic.title),
    clickable: true
  });
  row.container.dataset.peerId = '' + topic.id;
  row.container.classList.add('selector-forum-topic');
  const media = row.createMedia('abitbigger');
  const avatar = avatarNew({
    peerId: topic.peerId,
    threadId: topic.id,
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
  return row.container;
}

export default class PopupPickUser extends PopupElement {
  public selector: AppSelectPeers;
  public forumSelector: AppSelectPeers;
  public transition: ReturnType<typeof TransitionSlider>;
  public forumNavigationItem: NavigationItem;

  constructor(options: PopupPickUserOptions) {
    super(
      'popup-forward',
      {
        closable: true,
        overlayClosable: true,
        onBackClick: () => {
          this.forumSelector?.input?.replaceWith(this.selector.input);
          _i18n(this.selector.input, options.placeholder, undefined, 'placeholder');
          this.selector.input.removeAttribute('disabled');
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

    const isMultiSelect = !!options.onMultiSelect;
    const headerSearch = options.headerSearch ?? isMultiSelect;

    let ignoreOnSelect: boolean;
    const onSelect = async(peerId: PeerId | PeerId[], threadId?: number, monoforumThreadId?: PeerId) => {
      if(ignoreOnSelect) {
        return;
      }

      if(
        options.useTopics &&
        !Array.isArray(peerId) &&
        !threadId && !monoforumThreadId &&
        await this.managers.appPeersManager.isForum(peerId)
      ) {
        ignoreOnSelect = true;
        await this.createForumSelector({
          tabsContainer,
          peerId,
          placeholder: options.placeholder,
          onSelect
        });
        ignoreOnSelect = undefined;
        return;
      }

      if(
        !Array.isArray(peerId) &&
        !threadId && !monoforumThreadId &&
        await this.managers.appPeersManager.isMonoforum(peerId)
      ) {
        ignoreOnSelect = true;
        await this.createMonoforumSelector({
          tabsContainer,
          peerId,
          placeholder: options.placeholder,
          onSelect
        });
        ignoreOnSelect = undefined;
        return;
      }

      const callback = options.onSelect || options.onMultiSelect;
      if(callback) {
        const res = callback(peerId as any, threadId, monoforumThreadId);
        if(res instanceof Promise) {
          try {
            await res;
          } catch(err) {
            return;
          }
        }
      }

      this.selector = null;
      this.hide();
    };

    const tabsContainer = document.createElement('div');
    tabsContainer.classList.add('tabs-container');
    this.body.append(tabsContainer);

    this.selector = new AppSelectPeers({
      ...options,
      middleware: this.middlewareHelper.get(),
      appendTo: tabsContainer,
      onChange: isMultiSelect ? (length) => {
        this.btnConfirm.classList.toggle('is-visible', !!length);
        options.onChange?.(length);
      } : undefined,
      onSelect: isMultiSelect ? undefined : onSelect,
      onFirstRender: () => {
        this.show();
        this.selector.checkForTriggers(); // ! due to zero height before mounting

        if(!IS_TOUCH_SUPPORTED && this.selector.input) {
          this.selector.input.focus();
        }
      },
      multiSelect: isMultiSelect,
      rippleEnabled: false,
      avatarSize: 'abitbigger',
      managers: this.managers,
      night: this.night,
      headerSearch: headerSearch
    });
    this.selector.container.classList.add('tabs-tab');

    this.scrollable = this.selector.scrollable;

    if(isMultiSelect) {
      if(headerSearch) {
        this.header.after(this.selector.searchSection.container);
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

      attachClickEvent(this.btnConfirm, () => {
        onSelect(this.selector.getSelected() as PeerId[]);
      }, {listenerSetter: this.listenerSetter});

      if(options.initial) {
        this.selector.addInitial(options.initial);
      }
      this.selector.container.classList.add('active');
    } else {
      if(options.headerLangPackKey) {
        this.title.append(i18n(options.headerLangPackKey));
      } else {
        this.title.append(this.selector.input);
      }

      this.attachScrollableListeners();
      this.transition = TransitionSlider({
        content: tabsContainer,
        type: 'navigation',
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

  private async createForumSelector({
    tabsContainer,
    peerId,
    placeholder,
    onSelect
  }: {
    tabsContainer: HTMLElement,
    peerId: PeerId,
    placeholder: LangPackKey,
    onSelect: (peerId: PeerId, threadId: number) => any
  }) {
    const middlewareHelper = this.middlewareHelper.get().create();
    const middleware = middlewareHelper.get();
    const deferred = deferredPromise<void>();
    let offsetIndex: number, lastQuery: string;
    const forumSelector = this.forumSelector = new AppSelectPeers({
      middleware,
      appendTo: tabsContainer,
      managers: this.managers,
      rippleEnabled: false,
      night: this.night,
      multiSelect: false,
      headerSearch: false,
      placeholder,
      peerType: ['custom'],
      getMoreCustom: async(q, middleware) => {
        if(lastQuery !== q) {
          offsetIndex = undefined;
          lastQuery = q;
        }

        const result = await this.managers.dialogsStorage.getDialogs({
          query: q,
          filterId: peerId,
          limit: 20,
          skipMigrated: true,
          offsetIndex
        });

        if(!middleware()) {
          return;
        }

        offsetIndex = getDialogIndex(result.dialogs[result.dialogs.length - 1]);

        return {
          result: result.dialogs.map((forumTopic) => (forumTopic as ForumTopic.forumTopic).id),
          isEnd: result.isEnd
        };
      },
      renderResultsFunc: async(topicIds, append) => {
        const promises = topicIds.map(async(topicId) => {
          const topic = await this.managers.dialogsStorage.getForumTopic(peerId, topicId);
          return wrapTopicRow({topic, middleware});
        });
        const elements = await Promise.all(promises);
        forumSelector.list[!append ? 'append' : 'prepend'](...elements);
      },
      onSelect: (topicId) => {
        onSelect(peerId, topicId);
      },
      placeholderSizes: {
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
      }
    });

    forumSelector.container.classList.add('tabs-tab');
    forumSelector.scrollable.attachBorderListeners();
    forumSelector.container.middlewareHelper = middlewareHelper;

    await deferred;

    this.btnCloseAnimatedIcon.classList.add('state-back');
    // this.selector.clearInput();
    this.selector.input.replaceWith(forumSelector.input);
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

  private async createMonoforumSelector({
    peerId: parentPeerId,
    tabsContainer,
    placeholder,
    onSelect
  }: {
    peerId: PeerId,
    tabsContainer: HTMLElement,
    placeholder: LangPackKey,
    onSelect: PopupPickUserOptions['onSelect']
  }) {
    const middlewareHelper = this.middlewareHelper.get().create();
    const middleware = middlewareHelper.get();

    const autonomousList = createMonoforumDialogsList({peerId: parentPeerId, appDialogsManager, AutonomousMonoforumThreadList});

    middleware.onDestroy(() => void autonomousList.destroy());

    const list = autonomousList.sortedList.list;
    attachClickEvent(list, (e) => {
      const target = findUpAttribute(e.target, 'data-peer-id') as HTMLElement;

      if(!target) return;
      cancelEvent(e);

      const peerId = target.dataset.peerId?.toPeerId?.();
      if(!peerId) return;

      onSelect?.(parentPeerId, undefined, peerId);
    });

    const container = document.createElement('div');
    container.classList.add('tabs-tab');

    autonomousList.scrollable.container.classList.add('surface-color-background');
    container.append(autonomousList.scrollable.container);

    autonomousList.scrollable.attachBorderListeners();

    this.btnCloseAnimatedIcon.classList.add('state-back');

    this.selector.clearInput();
    _i18n(this.selector.input, 'ChannelDirectMessages.SelectAChat', undefined, 'placeholder');
    this.selector.input.setAttribute('disabled', '');

    tabsContainer.append(container);
    container.middlewareHelper = middlewareHelper;

    this.transition(container);

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
        onSelect: multiSelect ? undefined : (peerId) => {
          resolve(peerId as any);
          resolved = true;
        },
        onMultiSelect: multiSelect ? (peerIds) => {
          resolve(peerIds as any);
          resolved = true;
        } : undefined,
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
    placeholder?: LangPackKey,
    selfPresence?: LangPackKey
  }) {
    options.chatRightsActions ??= ['send_plain'];
    options.placeholder ??= 'ShareModal.Search.Placeholder';
    options.selfPresence ??= 'ChatYourSelf';
    return PopupElement.createPopup(PopupPickUser, {
      ...options,
      peerType: ['dialogs', 'contacts']
    });
  }

  public static createSharingPicker2(options?: Modify<Parameters<typeof PopupPickUser['createSharingPicker']>[0], {onSelect?: never}>) {
    return new Promise<{ peerId: PeerId, threadId?: number, monoforumThreadId?: PeerId }>((resolve, reject) => {
      let resolved = false;
      const popup = PopupPickUser.createSharingPicker({
        ...(options || {}),
        onSelect: (peerId, threadId, monoforumThreadId) => {
          resolved = true;
          resolve({peerId, threadId, monoforumThreadId});
        }
      });
      popup.addEventListener('close', () => {
        if(!resolved) {
          reject();
        }
      });
    });
  }

  public static createReplyPicker(options: { excludeMonoforums?: boolean } = {}) {
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
        peerType: ['contacts'],
        placeholder: 'Search',
        onSelect: (peerId) => {
          resolved = true;
          resolve(peerId);
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
