import lottieLoader from '@lib/lottie/lottieLoader';
import {EmoticonsDropdown} from '..';
import findUpClassName from '@helpers/dom/findUpClassName';
import mediaSizes from '@helpers/mediaSizes';
import {Document, MessagesAllStickers, StickerSet} from '@layer';
import {MyDocument} from '@appManagers/appDocsManager';
import {ReadingManagers} from '@lib/managers';
import wrapEmojiText from '@lib/richTextProcessor/wrapEmojiText';
import rootScope, {BroadcastEvents} from '@lib/rootScope';
import {putPreloader} from '@components/putPreloader';
import showStickersPopup from '@components/popups/stickers';
import findAndSplice from '@helpers/array/findAndSplice';
import {simulateClickEvent} from '@helpers/dom/clickEvent';
import VisibilityIntersector, {OnVisibilityChangeItem} from '@components/visibilityIntersector';
import findUpAsChild from '@helpers/dom/findUpAsChild';
import forEachReverse from '@helpers/array/forEachReverse';
import apiManagerProxy from '@lib/apiManagerProxy';
import getStickerEffectThumb from '@appManagers/utils/stickers/getStickerEffectThumb';
import StickersTabCategory, {EmoticonsTabStyles} from '@components/emoticonsDropdown/category';
import EmoticonsTabC from '@components/emoticonsDropdown/tab';
import {i18n} from '@lib/langPack';
import {onCleanup} from 'solid-js';
import SuperStickerRenderer from '@components/emoticonsDropdown/tabs/SuperStickerRenderer';
import GroupSetController, {GROUP_SET_CATEGORY_ID, GroupSetState} from '@components/emoticonsDropdown/groupSet';
import {
  createGroupSetHeaderButton,
  getGroupSetTitle,
  isGroupSetHidden,
  openGroupSetTab,
  setGroupSetHidden
} from '@components/emoticonsDropdown/groupSetSection';
import Icon from '@components/icon';
import {getStickerSetInputById} from '@lib/appManagers/utils/stickers/getStickerSetInput';
import {bindManagersToSession} from '@lib/accounts/bindManagersToAccount';
import createStickersSearch, {StickersSearch} from '@components/emoticonsDropdown/stickersSearch';
import appendClearRecentButton from '@components/emoticonsDropdown/clearRecentButton';

type StickersTabItem = {element: HTMLElement, document: Document.document};
// * `query` is a typed search's: the server is searched for it as well, unlike for a group
type StickersSearchResult = {stickers: MyDocument[], query?: string};
export default class StickersTab extends EmoticonsTabC<StickersTabCategory<StickersTabItem>, StickersSearchResult> {
  private stickerRenderer: SuperStickerRenderer;
  private groupSetController: GroupSetController;
  private groupSetHidden: boolean;
  // * the server's search for the query on the screen: one typed on leaves it at once
  private stickersSearch: StickersSearch;

  constructor(managers: ReadingManagers) {
    super({
      managers,
      searchFetcher: (value) => {
        // * a cleared query is answered at once, which ends the search before it (and the first call
        // comes from within super(), before `this` may be read)
        if(!value) return {stickers: []};
        // * neither the wait before its first page nor its later pages go on for a query left behind,
        // whatever the new one's own lookup takes
        this.stickersSearch?.destroy();
        this.stickersSearch = undefined;
        return this.managers.appStickersManager.searchStickers(value).then((stickers) => ({stickers, query: value}));
      },
      groupFetcher: (group) => {
        if(!group) return {stickers: []};

        const promise = group._ === 'emojiGroupPremium' ?
          this.managers.appStickersManager.getPremiumStickers() :
          this.managers.appStickersManager.getStickersByEmoticon({emoticon: group.emoticons, includeServerStickers: true});
        return promise.then((stickers) => ({stickers}));
      },
      processSearchResult: async({data, searching, grouping}) => {
        if(!data || (!searching && !grouping)) {
          return;
        }

        // * the user's own stickers come first, the server's after them, page by page
        const search = data.query && createStickersSearch(bindManagersToSession(this.managers), data.query, data.stickers);
        this.stickersSearch = search || undefined;
        const category = this.createCategory({styles: EmoticonsTabStyles.Stickers});
        let cleaned = false, onCleaned: () => void;
        onCleanup(() => {
          cleaned = true;
          onCleaned?.();
          search?.destroy();
          if(this.stickersSearch === search) {
            this.stickersSearch = undefined;
          }
          category.middlewareHelper.destroy();
          this.clearCategoryItems(category, true);
        });

        const stickers = search ? await search.first(data.stickers) : data.stickers;
        if(cleaned) {
          return;
        }

        // * a query typed on meanwhile ended this search before the server answered: what is on the
        // screen stays until that query's results replace it
        if(search && this.stickersSearch !== search) {
          return new Promise<HTMLElement>((resolve) => onCleaned = () => resolve(undefined));
        }

        const notFound = () => {
          const span = i18n('NoStickersFound');
          span.classList.add('emoticons-not-found');
          return span;
        };

        // * a server page that did not come is no answer: it is asked for again below
        if(!stickers.length && !search?.failed()) {
          return notFound();
        }

        const container = this.categoriesContainer.cloneNode(false) as HTMLElement;
        const promise = StickersTab.categoryAppendStickers(
          this,
          this.stickerRenderer,
          stickers.length,
          category,
          stickers
        );
        container.append(category.elements.container);

        if(search) {
          const sentinel = document.createElement('div');
          container.append(sentinel);
          search.paginate(sentinel, this.scrollable.container, (stickers) => {
            if(cleaned) {
              return;
            }

            return StickersTab.categoryAppendStickers(
              this,
              this.stickerRenderer,
              category.items.length + stickers.length,
              category,
              stickers,
              true
            );
          }, () => {
            // * the first page came only on a retry, and with nothing in it
            if(!cleaned && !category.items.length) {
              container.replaceChildren(notFound());
            }
          });
        }

        await promise;

        if(!cleaned) {
          StickersTab._onCategoryVisibility(category, true);
        }

        return container;
      },
      // searchNoLoader: true,
      searchPlaceholder: 'SearchStickers',
      searchType: 'stickers'
    });

    this.container.classList.add('stickers-padding');
    this.content.id = 'content-stickers';
  }

  private setFavedLimit(limit: number) {
    const category = this.categories['faved'];
    category.limit = limit;
  }

  private initGroupSet() {
    this.groupSetController = new GroupSetController({
      managers: this.managers,
      listenerSetter: this.listenerSetter,
      getPeerId: () => this.emoticonsDropdown ? this.emoticonsDropdown.chatInput?.chat?.peerId : undefined,
      isHidden: (chatId, set) => isGroupSetHidden(chatId, set),
      isInstalled: (set) => !!this.categories[set.id],
      render: (state) => this.renderGroupSet(state),
      remove: () => this.deleteCategory(this.categories[GROUP_SET_CATEGORY_ID])
    });

    if(this.emoticonsDropdown) {
      this.listenerSetter.add(this.emoticonsDropdown)('opened', () => this.groupSetController.update());
      // the tab is built on the first open, after that open's event already fired
      this.groupSetController.update();
    }
  }

  /**
   * Reuses the menu tab's own click: it already handles making the category active and
   * scrolling the panel to it, including the bookkeeping that keeps the scroll spy quiet.
   */
  private scrollToGroupSet() {
    const menuTab = this.categories[GROUP_SET_CATEGORY_ID]?.elements.menuTab;
    if(menuTab) {
      simulateClickEvent(menuTab);
    }
  }

  /**
   * A collapsed section belongs below every other set, but sets keep arriving — the initial
   * load and later installs both append — so its place has to be reclaimed afterwards.
   */
  private repositionGroupSet() {
    const category = this.categories[GROUP_SET_CATEGORY_ID];
    if(category && this.groupSetHidden) {
      this.positionCategory(category, false);
    }
  }

  private renderGroupSet(state: GroupSetState) {
    const {set, canEdit, hidden} = state;
    this.groupSetHidden = hidden;
    const chatId = this.groupSetController.getCurrentChatId();
    const category = this.createCategory({
      id: GROUP_SET_CATEGORY_ID,
      stickerSet: set,
      title: getGroupSetTitle(set),
      styles: EmoticonsTabStyles.Stickers
    });

    category.elements.title.append(createGroupSetHeaderButton({
      canEdit,
      hidden,
      onClick: () => {
        if(canEdit) {
          openGroupSetTab(chatId, false);
          return;
        }

        setGroupSetHidden(chatId, set, false, !hidden);
        this.groupSetController.update().then(() => {
          // bringing it back should show it, not just move it up the list
          if(hidden) this.scrollToGroupSet();
        });
      }
    }));

    // hidden sections sink below the user's own sets, exactly like tdesktop's Hidden place
    this.positionCategory(category, !hidden);

    if(set) {
      StickersTab.categoryAppendStickers(
        this,
        this.stickerRenderer,
        set.count,
        category,
        this.managers.appStickersManager.getStickerSet(getStickerSetInputById(set))
        .then((stickerSet) => stickerSet.documents as MyDocument[])
      );

      this.renderStickerSetThumb({
        set,
        menuTabPadding: category.elements.menuTabPadding,
        middleware: category.middlewareHelper.get()
      });
    } else {
      // nothing configured yet: an empty section whose only job is to lead an admin to setup
      category.elements.container.classList.remove('hide');
      category.elements.menuTab.append(Icon('stickers_face'));
    }
  }

  public onPeerChanged() {
    if(!this.groupSetController) {
      return;
    }

    this.groupSetController.clear();
    // an open dropdown has to swap the set right away; a closed one resolves on its next open
    if(this.emoticonsDropdown?.isActive()) {
      this.groupSetController.update();
    }
  }

  public static _onCategoryVisibility = (category: StickersTabCategory<any>, visible: boolean) => {
    category.elements.items.replaceChildren(...(!visible ? [] : category.items.map(({element}) => element)));
    if(visible) {
      // remounting detaches+reattaches the cells - transferred placeholder
      // canvases lose their displayed frame until the next worker commit
      lottieLoader.nudgePresentWithin(category.elements.items);
    }
  };

  private onCategoryVisibility = ({target, visible}: OnVisibilityChangeItem) => {
    const category = this.categoriesMap.get(target);
    // the set's documents resolve asynchronously, so this can fire for a category that was
    // already deleted — leaving a chat drops the group's set that way
    if(!category) {
      return;
    }

    StickersTab._onCategoryVisibility(category, visible);
  };

  public init() {
    super.init();

    this.scrollable.onAdditionalScroll = () => {
      this.setTyping();
    };

    /* stickersDiv.addEventListener('mouseover', (e) => {
      let target = e.target as HTMLElement;

      if(target.tagName === 'CANVAS') { // turn on sticker
        let animation = lottieLoader.getAnimation(target.parentElement, EMOTICONSSTICKERGROUP);

        if(animation) {
          // @ts-ignore
          if(animation.currentFrame === animation.totalFrames - 1) {
            animation.goToAndPlay(0, true);
          } else {
            animation.play();
          }
        }
      }
    }); */

    const intersectionOptions = this.emoticonsDropdown.intersectionOptions;
    this.categoriesIntersector = new VisibilityIntersector(this.onCategoryVisibility, intersectionOptions);

    this.scrollable.container.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      if(findUpClassName(target, 'category-title')) {
        const container = findUpClassName(target, 'emoji-category');
        const category = this.categoriesMap.get(container);
        if(category.local) {
          return;
        }

        showStickersPopup(getStickerSetInputById(category.set), false, this.emoticonsDropdown.chatInput);
        return;
      }

      this.emoticonsDropdown.onMediaClick(e);
    });

    this.menuOnClickResult = EmoticonsDropdown.menuOnClick(this, this.menu, this.scrollable, this.menuScroll);

    const preloader = putPreloader(this.content, true);

    const onCategoryStickers = (category: StickersTabCategory<StickersTabItem>, stickers: MyDocument[]) => {
      // if(category.id === 'faved' && category.limit && category.limit < stickers.length) {
      //   category.limit = stickers.length;
      // }

      if(category.limit) {
        stickers = stickers.slice(0, category.limit);
      }

      const ids = new Set(stickers.map((doc) => doc.id));
      forEachReverse(category.items, (item) => {
        if(!ids.has(item.document.id)) {
          this.deleteSticker(category, item.document, true);
        }
      });

      this.toggleLocalCategory(category, !!stickers.length);
      forEachReverse(stickers, (doc, idx) => {
        this.unshiftSticker(category, doc, true, idx);
      });
      this.spliceExceed(category);
      category.elements.container.classList.remove('hide');
    };

    const favedCategory = this.createLocalCategory({
      id: 'faved',
      title: 'FavoriteStickers',
      icon: 'savedmessages',
      styles: EmoticonsTabStyles.Stickers
    });
    // favedCategory.elements.menuTab.classList.add('active');

    const recentCategory = this.createLocalCategory({
      id: 'recent',
      title: 'Stickers.Recent',
      icon: 'recent',
      styles: EmoticonsTabStyles.Stickers
    });
    recentCategory.limit = 20;

    appendClearRecentButton({
      category: recentCategory,
      managers: this.managers,
      titleLangKey: 'ClearRecentStickersAlertTitle',
      descriptionLangKey: 'ClearRecentStickersAlertMessage',
      clear: (managers) => managers.appStickersManager.clearRecentStickers()
    });

    const promises = [
      Promise.all([
        this.managers.apiManager.getLimit('favedStickers'),
        this.managers.appStickersManager.getFavedStickersStickers()
      ]).then(([limit, stickers]) => {
        this.setFavedLimit(limit);
        onCategoryStickers(favedCategory, stickers);
      }),

      this.managers.appStickersManager.getRecentStickersStickers().then((stickers) => {
        onCategoryStickers(recentCategory, stickers);
      }),

      this.managers.appStickersManager.getAllStickers().then((res) => {
        for(const set of (res as MessagesAllStickers.messagesAllStickers).sets) {
          StickersTab.renderStickerSet(this, this.stickerRenderer, set, false);
        }
      })
    ];

    Promise.race(promises).finally(() => {
      preloader.remove();
    });

    Promise.all(promises).finally(() => {
      this.mounted = true;
      this.setTyping();

      const favedCategory = this.categories['faved'];
      const recentCategory = this.categories['recent'];
      this.menuOnClickResult.setActive(favedCategory.items.length ? favedCategory : recentCategory);

      this.repositionGroupSet();

      this.listenerSetter.add(rootScope)('stickers_installed', (set) => {
        if(!this.categories[set.id]) {
          StickersTab.renderStickerSet(this, this.stickerRenderer, set, true);
          this.repositionGroupSet();
          // installing the group's own set gives it a category of its own — the group one
          // beside it would be a duplicate
          this.groupSetController?.update();
        }
      });
    });

    this.stickerRenderer = this.createStickerRenderer();
    this.initGroupSet();

    const onStickerUpdated = ({type, document, faved}: BroadcastEvents['sticker_updated']) => {
      const category = this.categories[type === 'faved' ? 'faved' : 'recent'];
      if(category) {
        if(faved) {
          this.unshiftSticker(category, document);
        } else {
          this.deleteSticker(category, document);
        }
      }
    };

    const onStickerUpdatedPostponed = this.postponedEvent(onStickerUpdated);
    this.listenerSetter.add(rootScope)('sticker_updated', (data) => {
      // using a sticker reshuffles the recent row, which must not happen under the cursor —
      // that waits for the panel to hide; faving and removing are the user's own doing right
      // there in the panel, so they land at once
      const postpone = data.type === 'recent' && data.faved;
      (postpone ? onStickerUpdatedPostponed : onStickerUpdated)(data);
    });

    this.listenerSetter.add(rootScope)('stickers_deleted', ({id}) => {
      const category = this.categories[id];
      this.deleteCategory(category);
      // uninstalling may turn a deduped group set into one worth showing on its own
      this.groupSetController?.update();
    });

    this.listenerSetter.add(rootScope)('stickers_top', this.postponedEvent((id) => {
      const category = this.categories[id];
      if(category) {
        this.positionCategory(category, true);
        this.emoticonsDropdown.addEventListener('openAfterLayout', () => {
          this.menuOnClickResult.setActiveStatic(category);
        }, {once: true});
      }
    }));

    this.listenerSetter.add(rootScope)('stickers_order', this.postponedEvent(({type, order}) => {
      if(type !== 'stickers') {
        return;
      }

      order.forEach((id) => {
        const category = this.categories[id];
        if(category) {
          this.positionCategory(category, false);
        }
      });
    }));

    const onStickersUpdated = ({type, stickers}: BroadcastEvents['stickers_updated']) => {
      const category = this.categories[type === 'faved' ? 'faved' : 'recent'];
      if(category) {
        onCategoryStickers(category, stickers);
      }
    };

    const onStickersUpdatedPostponed = this.postponedEvent(onStickersUpdated);
    this.listenerSetter.add(rootScope)('stickers_updated', (data) => {
      const category = this.categories[data.type === 'faved' ? 'faved' : 'recent'];
      const {limit} = category || {};
      const length = limit ? Math.min(limit, data.stickers.length) : data.stickers.length;
      // a list that got shorter means something was taken out of it — clearing the recent
      // stickers, un-faving one — and the user has to see that happen; a list of the same
      // length is the reorder that follows using a sticker, which waits for the panel to hide
      const shrunk = category && length < category.items.length;
      (shrunk ? onStickersUpdated : onStickersUpdatedPostponed)(data);
    });

    this.listenerSetter.add(rootScope)('app_config', () => {
      this.managers.apiManager.getLimit('favedStickers').then((limit) => {
        this.setFavedLimit(limit);
      });
    });

    this.listenerSetter.add(mediaSizes)('resize', this.resizeCategories);

    this.attachHelpers({
      verifyRecent: (target) => !!findUpAsChild(target, this.categories['recent'].elements.items)
    });

    this.init = null;
  }

  public deleteCategory(category: StickersTabCategory<StickersTabItem>) {
    const ret = super.deleteCategory(category);
    if(ret) {
      this.clearCategoryItems(category);
    }

    return ret;
  }

  private clearCategoryItems(category: StickersTabCategory<StickersTabItem>, noUnmount?: boolean) {
    if(!noUnmount) category.elements.items.replaceChildren();
    category.items.splice(0, Infinity).forEach(({element}) => this.stickerRenderer.unobserveAnimated(element));
  }

  public deleteSticker(category: StickersTabCategory<StickersTabItem>, doc: MyDocument, batch?: boolean) {
    const item = findAndSplice(category.items, (item) => item.document.id === doc.id);
    if(item) {
      item.element.remove();
      this.stickerRenderer.unobserveAnimated(item.element);

      if(!batch) {
        this.onLocalCategoryUpdate(category);
      }
    }
  }

  public unshiftSticker(category: StickersTabCategory<StickersTabItem>, doc: MyDocument, batch?: boolean, idx?: number) {
    if(idx !== undefined) {
      const i = category.items[idx];
      if(i && i.document.id === doc.id) {
        return;
      }
    }

    let item = findAndSplice(category.items, (item) => item.document.id === doc.id);
    if(!item) {
      item = {
        element: this.stickerRenderer.renderSticker(doc, undefined, undefined, category.middlewareHelper.get()),
        document: doc
      };
    }

    category.items.unshift(item);
    category.elements.items.prepend(item.element);
    // the DOM move blanks a transferred placeholder canvas - re-present
    lottieLoader.nudgePresentWithin(item.element);

    if(!batch) {
      this.spliceExceed(category);
    }
  }

  public unshiftRecentSticker(doc: MyDocument) {
    this.managers.appStickersManager.saveRecentSticker(doc.id);
  }

  public deleteRecentSticker(doc: MyDocument) {
    this.managers.appStickersManager.saveRecentSticker(doc.id, true);
  }

  public setTyping = (cancel = false) => {
    if(!cancel && (!this.emoticonsDropdown.isActive() || this.emoticonsDropdown.tab !== this)) {
      return;
    }

    rootScope.dispatchEvent('choosing_sticker', !cancel);
  };

  public onClosed() {
    this.setTyping(true);
  }

  public onOpened() {
    this.setTyping();
    this.resizeCategories();
  }

  public destroy() {
    // * made by init(): a tab never opened has none
    this.stickerRenderer?.destroy();
    super.destroy();
  }

  /**
   * `mount` puts the stickers in whether or not the category is observed as visible: a search's results,
   * which are not observed, take their later pages that way
   */
  public static categoryAppendStickers(
    tab: EmoticonsTabC<any>,
    stickerRenderer: SuperStickerRenderer,
    count: number,
    category: StickersTabCategory<StickersTabItem>,
    promise: MaybePromise<MyDocument[]>,
    mount?: boolean
  ) {
    const {container} = category.elements;

    category.setCategoryItemsHeight(count);
    container.classList.remove('hide');

    return Promise.all([
      promise,
      apiManagerProxy.isPremiumFeaturesHidden()
    ]).then(([documents, isPremiumFeaturesHidden]) => {
      const isVisible = mount || tab.isCategoryVisible(category);

      const elements = documents.map((document) => {
        if(isPremiumFeaturesHidden && getStickerEffectThumb(document)) {
          return;
        }

        const element = stickerRenderer.renderSticker(document, undefined, undefined, category.middlewareHelper.get());
        category.items.push({document, element});
        return element;
      }).filter(Boolean);

      if(isVisible) {
        category.elements.items.append(...elements);
      }
    });
  }

  public static async renderStickerSet(
    tab: EmoticonsTabC<any>,
    stickerRenderer: SuperStickerRenderer,
    set: StickerSet.stickerSet,
    prepend?: boolean
  ) {
    const category = tab.createCategory({
      stickerSet: set,
      title: wrapEmojiText(set.title),
      styles: EmoticonsTabStyles.Stickers
    });
    const {menuTabPadding} = category.elements;

    const promise = tab.managers.appStickersManager.getStickerSet(getStickerSetInputById(set));
    this.categoryAppendStickers(
      tab,
      stickerRenderer,
      set.count,
      category,
      promise.then((stickerSet) => stickerSet.documents as MyDocument[])
    );

    if(prepend !== undefined) {
      tab.positionCategory(category, prepend);
    }

    tab.renderStickerSetThumb({
      set,
      menuTabPadding,
      middleware: category.middlewareHelper.get()
    });
  }
}
