import findUpClassName from "../../helpers/dom/findUpClassName";
import { MyDocument } from "../../lib/appManagers/appDocsManager";
import { CHAT_ANIMATION_GROUP } from "../../lib/appManagers/appImManager";
import appStickersManager from "../../lib/appManagers/appStickersManager";
import { EmoticonsDropdown } from "../emoticonsDropdown";
import { SuperStickerRenderer } from "../emoticonsDropdown/tabs/stickers";
import LazyLoadQueue from "../lazyLoadQueue";
import Scrollable from "../scrollable";
import SetTransition from "../singleTransition";

export default class StickersHelper {
  private container: HTMLElement;
  private stickersContainer: HTMLElement;
  private scrollable: Scrollable;
  private superStickerRenderer: SuperStickerRenderer;
  private lazyLoadQueue: LazyLoadQueue;
  private lastEmoticon = '';

  constructor(private appendTo: HTMLElement) {

  }

  public checkEmoticon(emoticon: string) {
    if(this.lastEmoticon === emoticon) return;

    if(this.lastEmoticon && !emoticon) {
      if(this.container) {
        SetTransition(this.container, 'is-visible', false, 200, () => {
          this.stickersContainer.innerHTML = '';
        });
      }
    }

    this.lastEmoticon = emoticon;
    if(this.lazyLoadQueue) {
      this.lazyLoadQueue.clear();
    }
    
    if(!emoticon) {
      return;
    }

    appStickersManager.getStickersByEmoticon(emoticon)
    .then(stickers => {
      if(this.lastEmoticon !== emoticon) {
        return;
      }

      if(this.init) {
        this.init();
        this.init = null;
      }

      this.stickersContainer.innerHTML = '';
      this.lazyLoadQueue.clear();
      if(stickers.length) {
        stickers.forEach(sticker => {
          this.stickersContainer.append(this.superStickerRenderer.renderSticker(sticker as MyDocument));
        });
      }

      SetTransition(this.container, 'is-visible', true, 200);
      this.scrollable.scrollTop = 0;
    });
  }

  private init() {
    this.container = document.createElement('div');
    this.container.classList.add('stickers-helper', 'z-depth-1');

    this.stickersContainer = document.createElement('div');
    this.stickersContainer.classList.add('stickers-helper-stickers', 'super-stickers');
    this.stickersContainer.addEventListener('click', (e) => {
      if(!findUpClassName(e.target, 'super-sticker')) {
        return;
      }

      EmoticonsDropdown.onMediaClick(e, true);
    });

    this.container.append(this.stickersContainer);

    this.scrollable = new Scrollable(this.container);
    this.lazyLoadQueue = new LazyLoadQueue();
    this.superStickerRenderer = new SuperStickerRenderer(this.lazyLoadQueue, CHAT_ANIMATION_GROUP);

    this.appendTo.append(this.container);
  }
}