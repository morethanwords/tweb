/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import type {MyDocument} from '../lib/appManagers/appDocsManager';
import MEDIA_MIME_TYPES_SUPPORTED from '../environment/mediaMimeTypesSupport';
import cancelEvent from '../helpers/dom/cancelEvent';
import {attachClickEvent} from '../helpers/dom/clickEvent';
import findUpClassName from '../helpers/dom/findUpClassName';
import findUpTag from '../helpers/dom/findUpTag';
import setInnerHTML from '../helpers/dom/setInnerHTML';
import mediaSizes from '../helpers/mediaSizes';
import SearchListLoader from '../helpers/searchListLoader';
import {Message} from '../layer';
import appDownloadManager from '../lib/appManagers/appDownloadManager';
import appImManager from '../lib/appManagers/appImManager';
import {MyMessage} from '../lib/appManagers/appMessagesManager';
import {MyPhoto} from '../lib/appManagers/appPhotosManager';
import canSaveMessageMedia from '../lib/appManagers/utils/messages/canSaveMessageMedia';
import getMediaFromMessage from '../lib/appManagers/utils/messages/getMediaFromMessage';
import wrapRichText from '../lib/richTextProcessor/wrapRichText';
import {MediaSearchContext} from './appMediaPlaybackController';
import AppMediaViewerBase, {MEDIA_VIEWER_CLASSNAME} from './appMediaViewerBase';
import {ButtonMenuItemOptionsVerifiable} from './buttonMenu';
import PopupDeleteMessages from './popups/deleteMessages';
import PopupForward from './popups/forward';
import Scrollable from './scrollable';
import appSidebarRight from './sidebarRight';
import AppSharedMediaTab from './sidebarRight/tabs/sharedMedia';
import PopupElement from './popups';

type AppMediaViewerTargetType = {
  element: HTMLElement,
  mid: number,
  peerId: PeerId,
  message?: MyMessage
};
export default class AppMediaViewer extends AppMediaViewerBase<'caption', 'delete' | 'forward', AppMediaViewerTargetType> {
  protected listLoader: SearchListLoader<AppMediaViewerTargetType>;
  protected btnMenuForward: ButtonMenuItemOptionsVerifiable;
  protected btnMenuDownload: ButtonMenuItemOptionsVerifiable;
  protected btnMenuDelete: ButtonMenuItemOptionsVerifiable;

  get searchContext() {
    return this.listLoader.searchContext;
  }

  constructor() {
    super(new SearchListLoader({
      processItem: (item) => {
        const isForDocument = this.searchContext.inputFilter._ === 'inputMessagesFilterDocument';
        const {mid, peerId} = item;
        const media = getMediaFromMessage(item, true);

        if(!media) return;

        if(isForDocument && !AppMediaViewer.isMediaCompatibleForDocumentViewer(media)) {
          return;
        }

        return {element: null as HTMLElement, mid, peerId};
      }
    }), ['delete', 'forward']);

    this.listLoader.onEmptied = () => {
      this.close();
    };

    /* const stub = document.createElement('div');
    stub.classList.add(MEDIA_VIEWER_CLASSNAME + '-stub');
    this.content.main.prepend(stub); */

    this.content.caption = document.createElement('div');
    this.content.caption.classList.add(MEDIA_VIEWER_CLASSNAME + '-caption', 'spoilers-container'/* , 'media-viewer-stub' */);

    let captionTimeout: number;
    const setCaptionTimeout = () => {
      if(captionTimeout) {
        clearTimeout(captionTimeout);
      }

      captionTimeout = window.setTimeout(() => {
        captionTimeout = undefined;
        this.content.caption.classList.remove('is-focused');
      }, 800);
    };
    this.content.caption.addEventListener('touchstart', () => {
      if(!mediaSizes.isMobile) return;

      this.content.caption.classList.add('is-focused');

      if(captionTimeout) {
        clearTimeout(captionTimeout);
        captionTimeout = undefined;
      }

      document.addEventListener('touchend', setCaptionTimeout, {once: true});
    });

    const captionScrollable = new Scrollable(this.content.caption);
    captionScrollable.onAdditionalScroll = setCaptionTimeout;

    // this.content.main.append(this.content.caption);
    this.wholeDiv.append(this.content.caption);

    attachClickEvent(this.buttons.delete, this.onDeleteClick);

    const buttons: ButtonMenuItemOptionsVerifiable[] = [this.btnMenuForward = {
      icon: 'forward',
      text: 'Forward',
      onClick: this.onForwardClick
    }, this.btnMenuDownload = {
      icon: 'download',
      text: 'MediaViewer.Context.Download',
      onClick: this.onDownloadClick
    }, this.btnMenuDelete = {
      icon: 'delete danger',
      text: 'Delete',
      onClick: this.onDeleteClick
    }];

    this.setBtnMenuToggle(buttons);

    // * constructing html end

    this.setListeners();
  }

  protected setListeners() {
    super.setListeners();
    attachClickEvent(this.buttons.forward, this.onForwardClick);
    attachClickEvent(this.author.container, this.onAuthorClick);

    const onCaptionClick = (e: MouseEvent) => {
      const a = findUpTag(e.target, 'A');
      if(a.classList.contains('timestamp')) {
        return;
      }

      const spoiler = findUpClassName(e.target, 'spoiler');
      if(a instanceof HTMLAnchorElement && (!spoiler || this.content.caption.classList.contains('is-spoiler-visible'))) { // close viewer if it's t.me/ redirect
        const onclick = a.getAttribute('onclick');
        if(!onclick || onclick.includes('showMaskedAlert')) {
          return;
        }

        cancelEvent(e);

        this.close().then(() => {
          this.content.caption.removeEventListener('click', onCaptionClick, {capture: true});
          a.click();
        });

        return false;
      }
    };

    this.content.caption.addEventListener('click', onCaptionClick, {capture: true});
  }

  /* public close(e?: MouseEvent) {
    const good = !this.setMoverAnimationPromise;
    const promise = super.close(e);

    if(good) { // clear
      this.currentMessageId = 0;
      this.peerId = 0;
    }

    return promise;
  } */

  protected getMessageByPeer(peerId: PeerId, mid: number) {
    return this.searchContext.isScheduled ? this.managers.appMessagesManager.getScheduledMessageByPeer(peerId, mid) : this.managers.appMessagesManager.getMessageByPeer(peerId, mid);
  }

  onPrevClick = async(target: AppMediaViewerTargetType) => {
    this.openMedia({
      message: await this.getMessageByPeer(target.peerId, target.mid),
      target: target.element,
      fromRight: -1
    });
  };

  onNextClick = async(target: AppMediaViewerTargetType) => {
    this.openMedia({
      message: await this.getMessageByPeer(target.peerId, target.mid),
      target: target.element,
      fromRight: 1
    });
  };

  onDeleteClick = () => {
    const target = this.target;
    PopupElement.createPopup(
      PopupDeleteMessages,
      target.peerId,
      [target.mid],
      'chat',
      () => {
        this.target = {element: this.content.media} as any;
        this.close();
      }
    );
  };

  onForwardClick = () => {
    const target = this.target;
    if(target.mid) {
      // appSidebarRight.forwardTab.open([target.mid]);
      PopupElement.createPopup(PopupForward, {
        [target.peerId]: [target.mid]
      }, () => {
        return this.close();
      });
    }
  };

  onAuthorClick = async(e: MouseEvent) => {
    const {mid, peerId} = this.target;
    if(mid && mid !== Number.MAX_SAFE_INTEGER) {
      const threadId = this.searchContext.threadId;
      const message = await this.getMessageByPeer(peerId, mid);
      this.close(e)
      // .then(() => mediaSizes.isMobile ? appSidebarRight.sharedMediaTab.closeBtn.click() : Promise.resolve())
      .then(async() => {
        if(mediaSizes.isMobile) {
          const tab = appSidebarRight.getTab(AppSharedMediaTab);
          if(tab) {
            tab.close();
          }
        }

        appImManager.setInnerPeer({
          peerId: message.peerId,
          lastMsgId: mid,
          type: threadId ? 'discussion' : undefined,
          threadId
        });
      });
    }
  };

  onDownloadClick = () => {
    const {message} = this.target;
    const media = getMediaFromMessage(message, true);
    if(!media) return;
    appDownloadManager.downloadToDisc({media, queueId: appImManager.chat.bubbles.lazyLoadQueue.queueId});
  };

  private setCaption(message: MyMessage) {
    const caption = (message as Message.message).message;
    let html: Parameters<typeof setInnerHTML>[1];
    if(caption) {
      const media = getMediaFromMessage(message, true);

      html = wrapRichText(caption, {
        entities: (message as Message.message).totalEntities,
        maxMediaTimestamp: ((media as MyDocument)?.type === 'video' && (media as MyDocument).duration) || undefined
      });
    }

    // html = 'Dandelion are a family of flowering plants that grow in many parts of the world.';
    setInnerHTML(this.content.caption.firstElementChild, html);
    this.content.caption.classList.toggle('hide', !caption);
    // this.content.container.classList.toggle('with-caption', !!caption);
  }

  public setSearchContext(context: MediaSearchContext) {
    this.listLoader.setSearchContext(context);

    return this;
  }

  public async openMedia({
    message,
    target,
    fromRight = 0,
    reverse = false,
    prevTargets = [],
    nextTargets = [],
    mediaTimestamp
  }: {
    message: MyMessage,
    target?: HTMLElement,
    fromRight?: number,
    reverse?: boolean,
    prevTargets?: AppMediaViewerTargetType[],
    nextTargets?: AppMediaViewerTargetType[],
    mediaTimestamp?: number
    /* , needLoadMore = true */
  }) {
    if(this.setMoverPromise) return this.setMoverPromise;

    const mid = message.mid;
    const fromId = (message as Message.message).fwd_from && !message.fromId ? (message as Message.message).fwd_from.from_name : message.fromId;
    const media = getMediaFromMessage(message, true);

    const noForwards = await this.managers.appPeersManager.noForwards(message.peerId);
    const isServiceMessage = message._ === 'messageService';
    const cantForwardMessage = isServiceMessage || !(await this.managers.appMessagesManager.canForward(message));
    const cantDownloadMessage = (isServiceMessage ? noForwards : cantForwardMessage) || !canSaveMessageMedia(message);
    const a: [(HTMLElement | ButtonMenuItemOptionsVerifiable)[], boolean][] = [
      [[this.buttons.forward, this.btnMenuForward], cantForwardMessage],
      [[this.buttons.download, this.btnMenuDownload], cantDownloadMessage],
      [[this.buttons.delete, this.btnMenuDelete], !(await this.managers.appMessagesManager.canDeleteMessage(message))]
    ];

    a.forEach(([buttons, hide]) => {
      buttons.forEach((button) => {
        if(button instanceof HTMLElement) {
          button.classList.toggle('hide', hide);
        } else {
          button.verify = () => !hide;
        }
      });
    });

    this.wholeDiv.classList.toggle('no-forwards', cantDownloadMessage);

    this.setCaption(message);
    const promise = super._openMedia({
      media: media as MyPhoto | MyDocument,
      timestamp: message.date,
      fromId,
      fromRight,
      target,
      reverse,
      prevTargets,
      nextTargets,
      message,
      mediaTimestamp
      /* , needLoadMore */
    });
    this.target.mid = mid;
    this.target.peerId = message.peerId;
    this.target.message = message;

    return promise;
  }

  public static isMediaCompatibleForDocumentViewer(media: MyPhoto | MyDocument) {
    return media._ === 'photo' || MEDIA_MIME_TYPES_SUPPORTED.has(media.mime_type);
  }
}
