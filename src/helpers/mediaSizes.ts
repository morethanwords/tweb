import { MOUNT_CLASS_TO } from "../config/debug";
import EventListenerBase from "./eventListenerBase";

type Size = Partial<{width: number, height: number}>;
type Sizes = {
  regular: Size,
  webpage: Size,
  album: Size,
  esgSticker: Size
};

export enum ScreenSize {
  mobile,
  medium,
  large
}

const MOBILE_SIZE = 600;
const MEDIUM_SIZE = 1275;
const LARGE_SIZE = 1680;

class MediaSizes extends EventListenerBase<{
  changeScreen: (from: ScreenSize, to: ScreenSize) => void
}> {
  private screenSizes: {key: ScreenSize, value: number}[] = [
    {key: ScreenSize.mobile, value: MOBILE_SIZE},
    {key: ScreenSize.medium, value: MEDIUM_SIZE},
    {key: ScreenSize.large, value: LARGE_SIZE}
  ];

  private sizes: {[k in 'desktop' | 'handhelds']: Sizes} = {
    handhelds: {
      regular: {
        width: 293,
        height: 293
      },
      webpage: {
        width: 293,
        height: 213
      },
      album: {
        width: 293,
        height: 0
      },
      esgSticker: {
        width: 68,
        height: 68
      }
    },
    desktop: {
      regular: {
        width: 480,
        height: 480
      },
      webpage: {
        width: 480,
        height: 400
      },
      album: {
        width: 451,
        height: 0
      },
      esgSticker: {
        width: 80,
        height: 80
      }
    }
  };

  public isMobile = false;
  public active: Sizes;
  public activeScreen: ScreenSize;
  public rAF: number;

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
    //this.isMobile = innerWidth <= 720;
    
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

    //console.time('esg');
    //const computedStyle = window.getComputedStyle(document.documentElement);
    //this.active.esgSticker.width = parseFloat(computedStyle.getPropertyValue('--esg-sticker-size'));
    //console.timeEnd('esg');

    if(wasScreen !== activeScreen) {
      //console.log('changeScreen', this.activeScreen, activeScreen);

      if(wasScreen !== undefined) {
        this.dispatchEvent('changeScreen', this.activeScreen, activeScreen);
      }
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
MOUNT_CLASS_TO && (MOUNT_CLASS_TO.mediaSizes = mediaSizes);
export default mediaSizes;
