/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {AppManagers} from '../../lib/appManagers/managers';
import LazyLoadQueue from '../lazyLoadQueue';
import SuperStickerRenderer from '../emoticonsDropdown/tabs/SuperStickerRenderer';
import {AnimationItemGroup} from '../animationIntersector';
import {getMiddleware, MiddlewareHelper} from '../../helpers/middleware';
import wrapStickerAnimation from '../wrappers/stickerAnimation';
import getStickerEffectThumb from '../../lib/appManagers/utils/stickers/getStickerEffectThumb';
import {STICKER_EFFECT_MULTIPLIER} from '../wrappers/sticker';
import {Document} from '../../layer';
import {EMOTICONSSTICKERGROUP} from '../emoticonsDropdown';

const ANIMATION_GROUP: AnimationItemGroup = EMOTICONSSTICKERGROUP;

export default class PremiumStickersCarousel {
  private superStickerRenderer: SuperStickerRenderer;
  private ignoreUnmount: boolean;
  private stickersMiddlewareHelper: MiddlewareHelper;
  private destroyed: boolean;

  private container: HTMLElement;
  private activeStickerIndex: number;
  private stickers: Document.document[];
  private lazyLoadQueue: LazyLoadQueue;

  constructor(options: {
    topSection: HTMLElement,
    managers: AppManagers
  }) {
    this.initStickersCarousel(options);
  }

  public cleanup() {
    this.destroyed = true;
  }

  private assignVisibility(topSiblingIndex: number, bottomSiblingIndex: number) {
    this.container.children[topSiblingIndex].classList.add('visible');
    this.container.children[this.activeStickerIndex].classList.add('active');
    this.container.children[bottomSiblingIndex].classList.add('visible');
  }

  private runStickerAnimation() {
    wrapStickerAnimation({
      doc: this.stickers[this.activeStickerIndex],
      middleware: this.stickersMiddlewareHelper.get(),
      side: 'left',
      size: 200 * STICKER_EFFECT_MULTIPLIER,
      target: this.container.children[this.activeStickerIndex] as HTMLElement,
      play: true,
      fullThumb: getStickerEffectThumb(this.stickers[this.activeStickerIndex]),
      relativeEffect: true,
      loopEffect: false,
      onUnmount: () => {
        if(this.ignoreUnmount) {
          this.ignoreUnmount = undefined;
          return;
        }
        if(!this.destroyed) {
          this.previousSticker();
        }
      }
    });
  }

  private previousSticker() {
    const stickersLength = this.stickers.length;
    this.stickersMiddlewareHelper.clean();
    Array.from(this.container.children).forEach((child) => child.classList.remove('top-sibling', 'active', 'bottom-sibling', 'visible'));
    if((this.activeStickerIndex - 1) < 0) {
      this.activeStickerIndex = stickersLength - 1;
    } else {
      --this.activeStickerIndex;
    }

    const topSiblingIndex = this.activeStickerIndex === 0 ? stickersLength - 1 : this.activeStickerIndex - 1;
    const bottomSiblingIndex = this.activeStickerIndex === (stickersLength - 1) ? 0 : this.activeStickerIndex + 1;
    this.assignVisibility(topSiblingIndex, bottomSiblingIndex);
    this.assignSiblings();
    this.runStickerAnimation();
  }

  private nextSticker() {
    const stickersLength = this.stickers.length;
    this.stickersMiddlewareHelper.clean();
    Array.from(this.container.children).forEach((child) => child.classList.remove('top-sibling', 'active', 'bottom-sibling', 'visible'));
    if((this.activeStickerIndex + 1) === stickersLength) {
      this.activeStickerIndex = 0;
    } else {
      ++this.activeStickerIndex;
    }

    const topSiblingIndex = (this.activeStickerIndex - 1) < 0 ? stickersLength - 1 : this.activeStickerIndex - 1;
    const bottomSiblingIndex = this.activeStickerIndex === (stickersLength - 1) ? 0 : this.activeStickerIndex + 1;
    this.assignVisibility(topSiblingIndex, bottomSiblingIndex);
    this.assignSiblings();
    this.runStickerAnimation();
  }

  private assignSiblings() {
    const siblingsCount = 3;

    for(let i = -siblingsCount; i <= siblingsCount; ++i) {
      const siblingIndex = (this.activeStickerIndex + i + this.stickers.length) % this.stickers.length;
      const siblingElement = this.container.children[siblingIndex];

      if(i < 0) {
        siblingElement.classList.add('top-sibling');
      } else if(i > 0) {
        siblingElement.classList.add('bottom-sibling');
      }
    }
  }

  private async initStickersCarousel(options: {topSection: HTMLElement; managers: AppManagers}) {
    options.topSection.classList.add('no-padding');
    const stickers = await options.managers.appStickersManager.getPromoPremiumStickers();
    this.stickersMiddlewareHelper = getMiddleware();
    this.lazyLoadQueue = new LazyLoadQueue();
    this.superStickerRenderer = new SuperStickerRenderer({
      regularLazyLoadQueue: this.lazyLoadQueue,
      group: 'none',
      managers: options.managers,
      visibleRenderOptions: {
        withLock: false,
        width: 200,
        height: 200
      }
    });
    this.stickers = stickers;
    this.container = document.createElement('div');
    this.container.classList.add('premium-stickers-carousel');
    this.activeStickerIndex = Math.round(this.stickers.length / 2);
    stickers.forEach((sticker, index) => {
      const carouselItem = document.createElement('div');
      carouselItem.classList.add('premium-stickers-carousel-item');
      const element = this.superStickerRenderer.renderSticker(sticker);
      carouselItem.append(element);
      carouselItem.addEventListener('click', (e) => {
        e.stopPropagation();
        if(index !== this.activeStickerIndex) {
          this.ignoreUnmount = true;
          if(carouselItem.classList.contains('bottom-sibling')) {
            this.nextSticker();
          }
          if(carouselItem.classList.contains('top-sibling')) {
            this.previousSticker();
          }
        }
      });
      this.container.append(carouselItem);
    });
    this.assignVisibility(this.activeStickerIndex - 1, this.activeStickerIndex + 1);
    this.assignSiblings();
    this.runStickerAnimation();

    options.topSection.addEventListener('click', (e) => {
      e.stopPropagation();
    });
    options.topSection.append(this.container);
  }
}
