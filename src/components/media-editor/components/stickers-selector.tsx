import rootScope from '../../../lib/rootScope';
import Scrollable, {ScrollableX} from '../../scrollable';
import {createEffect, createMemo, createResource, createSignal, onCleanup, untrack} from 'solid-js';
import {Document, EmojiGroup} from '../../../layer';
import EmoticonsSearch from '../../emoticonsDropdown/search';
import {i18n} from '../../../lib/langPack';
import StickersTabCategory, {EmoticonsTabStyles} from '../../emoticonsDropdown/category';
import EmoticonsTabC from '../../emoticonsDropdown/tab';
import SuperStickerRenderer from '../../emoticonsDropdown/tabs/SuperStickerRenderer';
import {MyDocument} from '../../../lib/appManagers/appDocsManager';
import apiManagerProxy from '../../../lib/mtproto/mtprotoworker';
import getStickerEffectThumb from '../../../lib/appManagers/utils/stickers/getStickerEffectThumb';

export type StickersTabItem = {element: HTMLElement, document: Document.document};

export const MediaEditorStickersSelector = () => {
  const [loading] = createSignal(false);
  const search = EmoticonsSearch({
    type: 'stickers',
    placeholder: 'SearchStickers',
    loading,
    onValue: val => console.info('val', val),
    onFocusChange: val => console.info('focus', val),
    onGroup: val => console.info('group', val)
  });
  return <div>
    { search }
  </div>
};

/*
export const MediaEditorStickersSelector = () => {
  const [query, setQuery] = createSignal('');
  const [group, setGroup] = createSignal<EmojiGroup>();
  const [focused, setFocused] = createSignal(false);
  const searching = createMemo(() => !!query());

  const searchFetcher = async(value: any) => {
    if(!value) return [];
    return managers.appStickersManager.searchStickers(value);
  };

  const groupFetcher = async(group: any) => {
    if(!group) return [];

    if(group._ === 'emojiGroupPremium') {
      return managers.appStickersManager.getPremiumStickers();
    }

    return managers.appStickersManager.getStickersByEmoticon({emoticon: group.emoticons, includeServerStickers: true});
  };

  const processSearchResult = async({data: stickers, searching, grouping}: any) => {
    if(!stickers || (!searching && !grouping)) {
      return;
    }

    if(!stickers.length) {
      const span = i18n('NoStickersFound');
      span.classList.add('emoticons-not-found');
      return span;
    }

    const categoryAppendStickers = (
      tab: EmoticonsTabC<any>,
      stickerRenderer: SuperStickerRenderer,
      count: number,
      category: StickersTabCategory<StickersTabItem>,
      promise: MaybePromise<MyDocument[]>
    ) => {
      const {container} = category.elements;

      category.setCategoryItemsHeight(count);
      container.classList.remove('hide');

      return Promise.all([
        promise,
        apiManagerProxy.isPremiumFeaturesHidden()
      ]).then(([documents, isPremiumFeaturesHidden]) => {
        const isVisible = tab.isCategoryVisible(category);

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

    const _onCategoryVisibility = (category: StickersTabCategory<any>, visible: boolean) => {
      category.elements.items.replaceChildren(...(!visible ? [] : category.items.map(({element}) => element)));
    };

    const clearCategoryItems = (category: StickersTabCategory<StickersTabItem>, noUnmount?: boolean) => {
      if(!noUnmount) category.elements.items.replaceChildren();
      category.items.splice(0, Infinity).forEach(({element}) => this.stickerRenderer.unobserveAnimated(element));
    }

    const container = this.categoriesContainer.cloneNode(false) as HTMLElement;
    const category = this.createCategory({styles: EmoticonsTabStyles.Stickers});
    const promise = categoryAppendStickers(
      this,
      this.stickerRenderer,
      stickers.length,
      category,
      stickers
    );
    container.append(category.elements.container);

    let cleaned = false;
    onCleanup(() => {
      cleaned = true;
      category.middlewareHelper.destroy();
      clearCategoryItems(category, true);
    });

    await promise;

    if(!cleaned) {
      _onCategoryVisibility(category, true);
    }

    return container;
  };

  const [loadedData, setLoadedData] = createSignal<T>();
  const [data] = createResource(query, searchFetcher);
  const [groupData] = groupFetcher ? createResource(group, groupFetcher) : [];
  const [element] = createResource(() => {
    return {
      data: loadedData(),
      grouping: !!untrack(group),
      searching: untrack(searching)
    };
  }, processSearchResult);

  const loading = this.searchNoLoader ? undefined : createMemo(() => searching() && element.loading);
  const shouldMoveSearch = createMemo(() => focused() || searching() || !!group());
  const shouldUseContainer = createMemo(() => element() || this.categoriesContainer);

  createEffect(() => {
    const useData = group() ? groupData : data;
    if(!useData.loading) {
      setLoadedData(() => useData());
    }
  });

  createEffect(() => {
    this.container.classList.toggle('is-searching', shouldMoveSearch());
  });
  const content = <div>
    <div class='emoticons-content'>
      <div class='emoticons-search-container'>


        { EmoticonsSearch({
          type: 'stickers',
          placeholder: 'SearchStickers',
          loading,
          onValue: setQuery,
          onFocusChange: setFocused,
          onGroup: groupFetcher ? setGroup : undefined
        }) }

      </div>
      <div class='emoticons-categories-container emoticons-will-move-down emoticons-has-search animated-item'>
        content
      </div>
    </div>
  </div> as HTMLElement;

  const scroll = new Scrollable(content);


  const managers = rootScope.managers;
  const menuWrapper = <div>
    <div class='menu-wrapper emoticons-menu-wrapper emoticons-will-move-up'>
      <nav class='menu-horizontal-div no-stripe justify-start emoticons-menu'>
        <span>Item</span>
        <span>Item</span>
        <span>Item</span>
        <span>Item</span>
        <span>Item</span>
        <span>Item</span>
        <span>Item</span>
        <span>Item</span>
        <span>Item</span>
        <span>Item</span>
        <span>Item</span>
        <span>Item</span>
        <span>Item</span>
        <span>Item</span>
        <span>Item</span>
        <span>Item</span>
        <span>Item</span>
        <span>Item</span>
        <span>Item</span>
        <span>Item</span>
        <span>Item</span>
        <span>Item</span>
      </nav>
    </div>
  </div> as HTMLElement;
  const menuScroll = new ScrollableX(menuWrapper);

  return <div class="emoji-container">
    <div class="tabs-container">
      <div class="tabs-tab emoticons-container stickers-padding active no-border-top">
        { menuScroll.container }
        { scroll.container }
      </div>
    </div>
  </div>
}
*/
