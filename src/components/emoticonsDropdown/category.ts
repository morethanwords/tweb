/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {makeMediaSize, MediaSize} from '../../helpers/mediaSize';
import mediaSizes from '../../helpers/mediaSizes';
import {MiddlewareHelper, Middleware, getMiddleware} from '../../helpers/middleware';
import {StickerSet} from '../../layer';
import ButtonIcon from '../buttonIcon';
import {ScrollableX} from '../scrollable';
import {EMOJI_ELEMENT_SIZE} from './tabs/emoji';

export type StickersTabCategoryItem = {element: HTMLElement};
export type StickersTabStyles = {
  padding: number,
  gapX: number,
  gapY: number,
  getElementMediaSize: () => MediaSize,
  itemsClassName: string
};

export const EmoticonsTabStyles: {[key in 'Stickers' | 'Emoji' | 'GIF']?: StickersTabStyles} = {
  Stickers: {
    getElementMediaSize: () => mediaSizes.active.esgSticker,
    padding: 3 * 2,
    gapX: 4,
    gapY: 4,
    itemsClassName: 'super-stickers'
  },
  Emoji: {
    getElementMediaSize: () => EMOJI_ELEMENT_SIZE,
    padding: 16,
    gapX: 4,
    gapY: 0,
    itemsClassName: 'super-emojis'
  },
  GIF: {
    getElementMediaSize: () => makeMediaSize(124, 124),
    padding: 4,
    gapX: 2,
    gapY: 2,
    itemsClassName: 'emoticons-gifs'
  }
}

export default class StickersTabCategory<Item extends StickersTabCategoryItem, AdditionalElements extends Record<string, HTMLElement> = {}> {
  public elements: {
    container: HTMLElement,
    title: HTMLElement,
    items: HTMLElement,
    menuTab: HTMLElement,
    menuTabPadding: HTMLElement
  } & AdditionalElements;
  public items: Item[];
  public mounted: boolean;
  public id: string;
  public limit: number;

  public getContainerSize: () => {width: number, height: number};
  private getElementMediaSize: () => MediaSize;

  private gapX: number;
  private gapY: number;

  public set?: StickerSet;
  public local?: boolean;
  public menuScroll?: ScrollableX;

  public middlewareHelper: MiddlewareHelper;

  constructor(options: {
    id: string,
    title: HTMLElement | DocumentFragment,
    overflowElement: HTMLElement,
    styles: StickersTabStyles,
    getContainerSize: StickersTabCategory<Item>['getContainerSize'],
    noMenuTab?: boolean,
    middleware?: Middleware
  }) {
    const container = document.createElement('div');
    container.classList.add('emoji-category');

    const items = document.createElement('div');
    items.classList.add('category-items');

    let title: HTMLElement;
    if(options.title) {
      title = document.createElement('div');
      title.classList.add('category-title');
      title.append(options.title);
    }

    let menuTab: HTMLElement, menuTabPadding: HTMLElement;
    if(!options.noMenuTab) {
      menuTab = ButtonIcon(undefined, {noRipple: true});
      menuTab.classList.add('menu-horizontal-div-item');

      menuTabPadding = document.createElement('div');
      menuTabPadding.classList.add('menu-horizontal-div-item-padding');

      menuTab.append(menuTabPadding);
    }

    if(title) container.append(title);
    container.append(items);

    this.elements = {
      container,
      title,
      items,
      menuTab,
      menuTabPadding
    } as any;
    this.id = options.id;
    this.items = [];

    this.getContainerSize = options.getContainerSize;
    this.getElementMediaSize = options.styles.getElementMediaSize;
    this.gapX = options.styles.gapX ?? 0;
    this.gapY = options.styles.gapY ?? 0;
    this.middlewareHelper = options.middleware ? options.middleware.create() : getMiddleware();
  }

  public setCategoryItemsHeight(itemsLength = this.items.length) {
    const {width: containerWidth} = this.getContainerSize();
    const elementSize = this.getElementMediaSize().width;

    let itemsPerRow = containerWidth / elementSize;
    if(this.gapX) itemsPerRow -= Math.floor(itemsPerRow - 1) * this.gapX / elementSize;
    itemsPerRow = Math.floor(itemsPerRow);

    const rows = Math.ceil(itemsLength / itemsPerRow);
    let height = rows * elementSize;
    if(this.gapY) height += (rows - 1) * this.gapY;

    this.elements.items.style.minHeight = height + 'px';
  }
}
