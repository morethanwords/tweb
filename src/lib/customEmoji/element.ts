/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import type {CancellablePromise} from '../../helpers/cancellablePromise';
import animationIntersector from '../../components/animationIntersector';
import safePlay from '../../helpers/dom/safePlay';
import {MiddlewareHelper} from '../../helpers/middleware';
import {createCustomFiller} from '../richTextProcessor/wrapRichText';
import RLottiePlayer from '../rlottie/rlottiePlayer';
import {CustomEmojiRendererElement, SyncedPlayer} from './renderer';

export type CustomEmojiElements = Set<CustomEmojiElement>;

export default class CustomEmojiElement extends HTMLElement {
  public elements: CustomEmojiElements;
  public renderer: CustomEmojiRendererElement;
  public player: RLottiePlayer | HTMLVideoElement;
  public paused: boolean;
  public syncedPlayer: SyncedPlayer;
  public clean: boolean;
  public lastChildWas: Node;
  // public docId: DocId;
  public placeholder: HTMLImageElement;
  public middlewareHelper: MiddlewareHelper;
  public static: boolean;
  public readyPromise: CancellablePromise<void>;

  constructor() {
    super();
    this.paused = true;
    this.classList.add('custom-emoji');
  }

  public get docId() {
    return this.dataset.docId;
  }

  public set docId(docId: DocId) {
    this.dataset.docId = '' + docId;
  }

  public static create(docId?: DocId) {
    const element = new CustomEmojiElement();
    if(docId) element.docId = docId;
    return element;
  }

  public get isConnected() {
    return this.placeholder?.isConnected ?? super.isConnected;
  }

  public connectedCallback() {
    // if(this.isConnected) {
    //   return;
    // }

    if(this.player) {
      animationIntersector.addAnimation({
        animation: this,
        group: this.renderer.animationGroup,
        observeElement: this.placeholder ?? this,
        controlled: true,
        type: 'emoji'
      });
    }

    // this.connectedCallback = undefined;
  }

  public disconnectedCallback() {
    if(this.isConnected || !this.renderer?.isSelectable) { // prepend on sibling can invoke disconnectedCallback
      return;
    }

    this.clear();
  }

  public destroy() {
    this.clear();
  }

  public clear(replaceChildren = true) {
    if(this.clean) {
      return;
    }

    // if(this.docId === '5399836826758290421') {
    //   console.log('clear', this, this.isConnected);
    // }

    this.clean = true;
    this.pause();

    const {syncedPlayer} = this;
    if(syncedPlayer) {
      syncedPlayer.pausedElements.delete(this);
    }

    this.middlewareHelper?.clean();
    this.readyPromise?.reject();

    if(this.renderer) {
      const elements = this.renderer.customEmojis.get(this.docId);
      if(elements?.delete(this) && !elements.size) {
        this.renderer.customEmojis.delete(this.docId);
        this.renderer.textColored.delete(elements);
        this.renderer.playersSynced.delete(elements);
      }

      if(replaceChildren) {
        if(this.renderer.isSelectable) {
          this.replaceChildren(createCustomFiller(true));
        } else {
          // otherwise https://bugs.chromium.org/p/chromium/issues/detail?id=1144736#c27 will happen
          this.replaceChildren();
        }
      }
    }

    if(this.player) {
      animationIntersector.removeAnimationByPlayer(this);
    }

    CustomEmojiRendererElement.globalLazyLoadQueue?.delete({div: this});

    /* this.disconnectedCallback =  */this.elements =
      this.renderer =
      this.player =
      this.syncedPlayer =
      undefined;
  }

  public pause() {
    if(this.paused) {
      return;
    }

    this.paused = true;

    if(this.player instanceof HTMLVideoElement && !this.syncedPlayer) {
      this.renderer.lastPausedVideo = this.player;
      this.player.pause();
    }

    if(this.syncedPlayer && !this.syncedPlayer.pausedElements.has(this)) {
      this.syncedPlayer.pausedElements.add(this);

      if(this.syncedPlayer.player && this.syncedPlayer.pausedElements.size === this.syncedPlayer.middlewares.size) {
        this.syncedPlayer.player.pause();
      }
    }
  }

  public play() {
    if(!this.paused) {
      return;
    }

    this.paused = false;

    if(this.player instanceof HTMLVideoElement) {
      this.player.currentTime = this.renderer.lastPausedVideo?.currentTime ?? this.player.currentTime;
      safePlay(this.player);
    }

    if(this.syncedPlayer && this.syncedPlayer.pausedElements.has(this)) {
      this.syncedPlayer.pausedElements.delete(this);

      if(this.syncedPlayer.pausedElements.size !== this.syncedPlayer.middlewares.size) {
        this.player.play();
      }
    }
  }

  public remove() {
    super.remove();
    this.clear();
    // this.elements = this.renderer = this.player = undefined;
  }

  public get autoplay() {
    return true;
  }

  public get loop() {
    return true;
  }
}

customElements.define('custom-emoji-element', CustomEmojiElement);
