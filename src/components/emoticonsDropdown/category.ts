/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {MediaSize} from '../../helpers/mediaSize';
import {MiddlewareHelper, Middleware, getMiddleware} from '../../helpers/middleware';
import {StickerSet} from '../../layer';
import ButtonIcon from '../buttonIcon';
import {ScrollableX} from '../scrollable';

export type StickersTabCategoryItem = {element: HTMLElement};

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
    getContainerSize: StickersTabCategory<Item>['getContainerSize'],
    getElementMediaSize: StickersTabCategory<Item>['getElementMediaSize'],
    gapX: number,
    gapY: number,
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
    this.getElementMediaSize = options.getElementMediaSize;
    this.gapX = options.gapX ?? 0;
    this.gapY = options.gapY ?? 0;
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
