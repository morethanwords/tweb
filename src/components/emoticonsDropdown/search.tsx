/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {Accessor, createEffect, createSignal, onCleanup, For, on} from 'solid-js';
import {attachClickEvent} from '../../helpers/dom/clickEvent';
import placeCaretAtEnd from '../../helpers/dom/placeCaretAtEnd';
import fastSmoothScroll, {fastSmoothScrollToStart} from '../../helpers/fastSmoothScroll';
import createMiddleware from '../../helpers/solid/createMiddleware';
import {EmojiGroup} from '../../layer';
import {AppEmojiManager} from '../../lib/appManagers/appEmojiManager';
import {LangPackKey} from '../../lib/langPack';
import rootScope from '../../lib/rootScope';
import InputSearch from '../inputSearch';
import {ScrollableXTsx} from '../stories/list';
import wrapSticker from '../wrappers/sticker';
import {AnimationItemGroup} from '../animationIntersector';

/* @refresh reload */

function addSearchCategories(props: {
  type: Parameters<typeof EmoticonsSearch>[0]['type'],
  searching: Accessor<boolean>,
  inputSearch: InputSearch,
  onGroup: (group: EmojiGroup) => void,
  animatedItemGroup?: AnimationItemGroup,
  color?: string
}) {
  const {inputSearch} = props;
  const [emojiGroups, setEmojiGroups] = createSignal<Awaited<ReturnType<AppEmojiManager['getEmojiGroups']>>>([]);
  const [selected, setSelected] = createSignal<EmojiGroup>();
  const [scrolled, setScrolled] = createSignal(false);

  const onEmojiGroupClick = (group: EmojiGroup, e: MouseEvent) => {
    setSelected(group);
    fastSmoothScroll({
      container: scrollableContainer,
      element: e.target as HTMLElement,
      position: 'center',
      axis: 'x'
    });
  };

  const EmojiGroup = ({group, document}: ReturnType<typeof emojiGroups>[0]) => {
    // * until layer 179
    if(props.type !== 'stickers' && group._ === 'emojiGroupPremium') {
      return;
    }

    let element: HTMLDivElement, stickerContainer: HTMLDivElement;
    const ret = (
      <div
        ref={element}
        class="emoticons-search-input-category"
        classList={{active: selected() === group}}
        title={group.title}
        onClick={[onEmojiGroupClick, group]}
      >
        <div ref={stickerContainer} class="emoticons-search-input-category-sticker"></div>
      </div>
    );

    wrapSticker({
      doc: document,
      div: stickerContainer,
      width: 24,
      height: 24,
      group: props.animatedItemGroup,
      play: true,
      middleware: createMiddleware().get(),
      textColor: props.color
    });

    return ret;
  };

  let scrollableContainer: HTMLDivElement;
  const scrollable = (
    <ScrollableXTsx
      ref={scrollableContainer}
      class="emoticons-search-input-scrollable"
      classList={{'is-searching': props.searching(), 'is-scrolled': scrolled()}}
      onClick={(e) => {
        if(e.target === inputSearch.currentPlaceholder) {
          placeCaretAtEnd(inputSearch.input, true, true);
        }
      }}
      onAdditionalScroll={() => {
        setScrolled(scrollableContainer.scrollLeft > 0);
      }}
    >
      {inputSearch.currentPlaceholder}
      <div class="emoticons-search-input-categories">
        <For each={emojiGroups()}>{EmojiGroup}</For>
      </div>
    </ScrollableXTsx>
  );

  inputSearch.input.after(scrollableContainer);

  inputSearch.currentPlaceholder.classList.remove('will-animate');

  const arrowButton = inputSearch.createButtonIcon('arrow_prev', 'will-animate', 'emoticons-search-input-arrow');
  inputSearch.searchIcon.classList.add('will-animate');
  inputSearch.searchIcon.after(arrowButton);

  const detachClickEvent = attachClickEvent(arrowButton, () => {
    setSelected();
  });

  onCleanup(detachClickEvent);

  createEffect(() => {
    arrowButton.classList.toggle('is-hiding', !selected());
    inputSearch.searchIcon.classList.toggle('is-hiding', !!selected());
  });

  createEffect(() => {
    if(props.searching()) {
      setSelected();
    }
  });

  createEffect(on(selected, (selected) => {
    props.onGroup(selected);
    if(!selected) {
      fastSmoothScrollToStart(scrollableContainer, 'x');
    }
  }, {defer: true}));

  rootScope.managers.appEmojiManager.getEmojiGroups(props.type === 'stickers' ? 'stickers' : 'esg').then(setEmojiGroups);
}

export default function EmoticonsSearch(props: {
  type: 'emoji' | 'stickers' | 'gifs'
  placeholder?: LangPackKey,
  loading?: Accessor<boolean>,
  onValue: (value: string) => void,
  onFocusChange?: ConstructorParameters<typeof InputSearch>[0]['onFocusChange'],
  onGroup?: (group: EmojiGroup) => void,
  animatedItemGroup?: AnimationItemGroup,
  categoryColor?: string
}) {
  const [searching, setSearching] = createSignal(false);
  const [debounced, setDebounced] = createSignal(false);
  const inputSearch = new InputSearch({
    placeholder: props.placeholder || 'Search',
    onChange: (value) => {
      value = value.trim();
      setSearching(!!value);
      props.onValue(value);
    },
    onFocusChange: props.onFocusChange,
    onDebounce: setDebounced,
    noBorder: true,
    noFocusEffect: true,
    debounceTime: 0
  });
  inputSearch.container.classList.add('emoticons-search-input-container');
  inputSearch.input.classList.add('emoticons-search-input');

  onCleanup(() => {
    inputSearch.remove();
  });

  if(props.loading) {
    createEffect(() => {
      inputSearch.toggleLoading(debounced() || props.loading());
    });
  }

  if(props.onGroup) {
    addSearchCategories({
      type: props.type,
      searching,
      inputSearch,
      onGroup: props.onGroup,
      animatedItemGroup: props.animatedItemGroup,
      color: props.categoryColor
    });
  }

  return (
    <>
      {inputSearch.container}
    </>
  );
}
