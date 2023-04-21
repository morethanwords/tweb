/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {MOUNT_CLASS_TO} from '../config/debug';
import EventListenerBase from './eventListenerBase';
import {makeMediaSize, MediaSize} from './mediaSize';

type MediaTypeSizes = {
  regular: MediaSize,
  webpage: MediaSize,
  album: MediaSize,
  esgSticker: MediaSize,
  animatedSticker: MediaSize,
  staticSticker: MediaSize,
  emojiSticker: MediaSize,
  poll: MediaSize,
  round: MediaSize,
  documentName: MediaSize,
  invoice: MediaSize,
  extendedInvoice: MediaSize,
  customEmoji: MediaSize,
  esgCustomEmoji: MediaSize,
  emojiStatus: MediaSize,
  popupSticker: MediaSize
};

export type MediaSizeType = keyof MediaTypeSizes;

export enum ScreenSize {
  mobile,
  medium,
  large
}

const MOBILE_SIZE = 600;
const MEDIUM_SIZE = 1275;
const LARGE_SIZE = 1680;

const CUSTOM_EMOJI_SIZE = makeMediaSize(20, 20);
const ESG_CUSTOM_EMOJI_SIZE = makeMediaSize(36, 36);
const EMOJI_STATUS_SIZE = makeMediaSize(18, 18);

class MediaSizes extends EventListenerBase<{
  changeScreen: (from: ScreenSize, to: ScreenSize) => void,
  resize: () => void
}> {
  private screenSizes: {key: ScreenSize, value: number}[] = [
    {key: ScreenSize.mobile, value: MOBILE_SIZE},
    {key: ScreenSize.medium, value: MEDIUM_SIZE},
    {key: ScreenSize.large, value: LARGE_SIZE}
  ];

  private sizes: {[k in 'desktop' | 'handhelds']: MediaTypeSizes} = {
    handhelds: {
      regular: makeMediaSize(270, 270),
      webpage: makeMediaSize(270, 200),
      album: makeMediaSize(270, 0),
      esgSticker: makeMediaSize(68, 68),
      animatedSticker: makeMediaSize(180, 180),
      staticSticker: makeMediaSize(180, 180),
      emojiSticker: makeMediaSize(112, 112),
      poll: makeMediaSize(240, 0),
      round: makeMediaSize(240, 240),
      documentName: makeMediaSize(200, 0),
      invoice: makeMediaSize(270, 270),
      extendedInvoice: makeMediaSize(270, 270),
      customEmoji: CUSTOM_EMOJI_SIZE,
      esgCustomEmoji: ESG_CUSTOM_EMOJI_SIZE,
      emojiStatus: EMOJI_STATUS_SIZE,
      popupSticker: makeMediaSize(68, 68)
    },
    desktop: {
      regular: makeMediaSize(420, 340),
      webpage: makeMediaSize(420, 340),
      album: makeMediaSize(420, 0),
      esgSticker: makeMediaSize(72, 72),
      animatedSticker: makeMediaSize(200, 200),
      staticSticker: makeMediaSize(200, 200),
      emojiSticker: makeMediaSize(112, 112),
      poll: makeMediaSize(330, 0),
      round: makeMediaSize(280, 280),
      documentName: makeMediaSize(240, 0),
      invoice: makeMediaSize(320, 320),
      extendedInvoice: makeMediaSize(420, 340),
      customEmoji: CUSTOM_EMOJI_SIZE,
      esgCustomEmoji: ESG_CUSTOM_EMOJI_SIZE,
      emojiStatus: EMOJI_STATUS_SIZE,
      popupSticker: makeMediaSize(80, 80)
    }
  };

  public isMobile = false;
  public active: MediaTypeSizes;
  public activeScreen: ScreenSize;
  private rAF: number;

  constructor() {
    super();

    window.addEventListener('resize', () => {
      if(this.rAF) window.cancelAnimationFrame(this.rAF);
      this.rAF = window.requestAnimationFrame(() => {
        this.handleResize();
        this.rAF = 0;
      });
    });
    this.handleResize();
  }

  private handleResize = () => {
    const innerWidth = window.innerWidth;
    // this.isMobile = innerWidth <= 720;

    let activeScreen = this.screenSizes[0].key;
    for(let i = this.screenSizes.length - 1; i >= 0; --i) {
      if(this.screenSizes[i].value < innerWidth) {
        activeScreen = (this.screenSizes[i + 1] || this.screenSizes[i]).key;
        break;
      }
    }

    const wasScreen = this.activeScreen;
    this.activeScreen = activeScreen;
    this.isMobile = this.activeScreen === ScreenSize.mobile;
    this.active = this.isMobile ? this.sizes.handhelds : this.sizes.desktop;

    // console.time('esg');
    // const computedStyle = window.getComputedStyle(document.documentElement);
    // this.active.esgSticker.width = parseFloat(computedStyle.getPropertyValue('--esg-sticker-size'));
    // console.timeEnd('esg');

    if(wasScreen !== activeScreen) {
      // console.log('changeScreen', this.activeScreen, activeScreen);

      if(wasScreen !== undefined) {
        this.dispatchEvent('changeScreen', wasScreen, activeScreen);
      }
    }

    if(wasScreen !== undefined) {
      this.dispatchEvent('resize');
    }

    /* if(this.isMobile) {
      for(let i in this.active) {
        // @ts-ignore
        let size = this.active[i];
        size.width = innerWidth
      }
    } */
  };
}

const mediaSizes = new MediaSizes();
MOUNT_CLASS_TO.mediaSizes = mediaSizes;
export default mediaSizes;
