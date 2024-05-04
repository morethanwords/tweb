/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import type Chat from './chat';
import debounce from '../../helpers/schedulers/debounce';
import {WebDocument} from '../../layer';
import {MyDocument} from '../../lib/appManagers/appDocsManager';
import LazyLoadQueue from '../lazyLoadQueue';
import Scrollable from '../scrollable';
import AutocompleteHelper from './autocompleteHelper';
import AutocompleteHelperController from './autocompleteHelperController';
import Button from '../button';
import {attachClickEvent} from '../../helpers/dom/clickEvent';
import {MyPhoto} from '../../lib/appManagers/appPhotosManager';
import assumeType from '../../helpers/assumeType';
import GifsMasonry from '../gifsMasonry';
import SuperStickerRenderer from '../emoticonsDropdown/tabs/SuperStickerRenderer';
import mediaSizes from '../../helpers/mediaSizes';
import readBlobAsDataURL from '../../helpers/blob/readBlobAsDataURL';
import setInnerHTML from '../../helpers/dom/setInnerHTML';
import renderMediaWithFadeIn from '../../helpers/dom/renderMediaWithFadeIn';
import {AppManagers} from '../../lib/appManagers/managers';
import wrapEmojiText from '../../lib/richTextProcessor/wrapEmojiText';
import wrapRichText from '../../lib/richTextProcessor/wrapRichText';
import generateQId from '../../lib/appManagers/utils/inlineBots/generateQId';
import appDownloadManager from '../../lib/appManagers/appDownloadManager';
import {AnimationItemGroup} from '../animationIntersector';
import wrapPhoto from '../wrappers/photo';
import {i18n} from '../../lib/langPack';
import {POSTING_NOT_ALLOWED_MAP} from './input';
import liteMode from '../../helpers/liteMode';

const ANIMATION_GROUP: AnimationItemGroup = 'INLINE-HELPER';
// const GRID_ITEMS = 5;

export default class InlineHelper extends AutocompleteHelper {
  private scrollable: Scrollable;
  private lazyLoadQueue: LazyLoadQueue;
  private gifsMasonry: GifsMasonry;
  private superStickerRenderer: SuperStickerRenderer;
  private onChangeScreen: () => void;
  public checkQuery: ReturnType<typeof debounce<InlineHelper['_checkQuery']>>;

  constructor(
    appendTo: HTMLElement,
    controller: AutocompleteHelperController,
    private chat: Chat,
    private managers: AppManagers
  ) {
    super({
      appendTo,
      controller,
      listType: 'xy',
      waitForKey: ['ArrowUp', 'ArrowDown'],
      onSelect: (target) => {
        if(!target) return false; // can happen when there is only button
        const {peerId, botId, queryId} = this.list.dataset;
        return this.chat.input.getReadyToSend(() => {
          const queryAndResultIds = generateQId(queryId, (target as HTMLElement).dataset.resultId);
          this.managers.appInlineBotsManager.sendInlineResult(peerId.toPeerId(), botId, queryAndResultIds, {
            ...this.chat.getMessageSendingParams(),
            clearDraft: true
          });

          this.chat.input.onMessageSent(true, true);
        });
      }
    });

    this.container.classList.add('inline-helper');

    this.addEventListener('visible', () => {
      setTimeout(() => { // it is not rendered yet
        this.scrollable.scrollPosition = 0;
      }, 0);
    });

    this.checkQuery = debounce(this._checkQuery, 200, true, true);

    this.addEventListener('hidden', () => {
      if(this.onChangeScreen) {
        mediaSizes.removeEventListener('changeScreen', this.onChangeScreen);
        this.onChangeScreen = undefined;
      }
    });
  }

  public _checkQuery = async(peerId: PeerId, username: string, query: string, canSendInline: boolean) => {
    const middleware = this.controller.getMiddleware();

    const peer = await this.managers.appUsersManager.resolveUsername(username);
    if(!middleware()) {
      throw 'PEER_CHANGED';
    }

    if(peer._ !== 'user' || !peer.pFlags.bot) {
      throw 'NOT_A_BOT';
    }

    if(!canSendInline) {
      if(!middleware()) {
        throw 'PEER_CHANGED';
      }

      if(this.init) {
        this.init();
        this.init = null;
      }

      this.container.classList.add('cant-send');
      this.toggle(false);
      throw 'NO_INLINES';
    }

    const botId = peer.id;

    const renderPromise = this.managers.appInlineBotsManager.getInlineResults(peerId, botId, query).then((botResults) => {
      if(!middleware()) {
        throw 'PEER_CHANGED';
      }

      if(this.init) {
        this.init();
        this.init = null;
      }

      const list = this.list.cloneNode() as HTMLElement;
      list.dataset.peerId = '' + peerId;
      list.dataset.botId = '' + botId;
      list.dataset.queryId = '' + botResults.query_id;

      const gifsMasonry = new GifsMasonry(null, ANIMATION_GROUP, this.scrollable, false);

      this.lazyLoadQueue.clear();
      this.superStickerRenderer.clear();

      const loadPromises: Promise<any>[] = [];
      const isGallery = !!botResults.pFlags.gallery;
      // botResults.results.length = 3;
      for(const item of botResults.results) {
        const container = document.createElement('div');
        container.classList.add('inline-helper-result');
        container.dataset.resultId = item.id;

        const preview = isGallery ? undefined : document.createElement('div');
        if(preview) {
          preview.classList.add('inline-helper-result-preview');

          container.append(preview);
        }

        list.append(container);

        if(!isGallery) {
          preview.classList.add('empty');
          setInnerHTML(preview, wrapEmojiText([...item.title.trim()][0]));

          const title = document.createElement('div');
          title.classList.add('inline-helper-result-title');
          setInnerHTML(title, wrapEmojiText(item.title));

          const description = document.createElement('div');
          description.classList.add('inline-helper-result-description');
          setInnerHTML(description, wrapRichText(item.description, {
            noCommands: true,
            noLinks: true
          }));

          container.append(title, description);

          const separator = document.createElement('div');
          separator.classList.add('inline-helper-separator');

          list.append(separator);
        } else {
          container.classList.add('grid-item');
        }

        if(item._ === 'botInlineResult') {
          // (preview || container).style.backgroundColor = '#ff00ff';
          if(item.thumb && item.thumb.mime_type.indexOf('image/') === 0) {
            let mediaContainer: HTMLElement;
            if(preview) {
              mediaContainer = document.createElement('div');
              preview.append(mediaContainer);
            } else {
              mediaContainer = container;
            }

            mediaContainer.classList.add('media-container');
            isGallery && mediaContainer.classList.add('no-border-radius');

            this.lazyLoadQueue.push({
              div: container,
              load: () => {
                return appDownloadManager.download({
                  dcId: 4,
                  location: {
                    _: 'inputWebFileLocation',
                    access_hash: (item.thumb as WebDocument.webDocument).access_hash,
                    url: item.thumb.url
                  },
                  size: item.thumb.size,
                  mimeType: item.thumb.mime_type
                }).then((blob) => {
                  const image = new Image();
                  image.classList.add('media-photo');
                  readBlobAsDataURL(blob).then((dataURL) => {
                    renderMediaWithFadeIn({
                      container: mediaContainer,
                      media: image,
                      url: dataURL,
                      needFadeIn: liteMode.isAvailable('animations')
                    });
                  });
                });
              }
            });
          }
        } else {
          const media = item.document as MyDocument || item.photo as MyPhoto;
          if((['sticker', 'gif'] as MyDocument['type'][]).includes((media as MyDocument)?.type) && isGallery) {
            assumeType<MyDocument>(media);

            if(media.type === 'gif') {
              gifsMasonry.add(media, container);
            } else if(media.type === 'sticker') {
              container.classList.add('super-sticker');
              this.superStickerRenderer.renderSticker(media, container, loadPromises);
              if(media.animated) {
                this.superStickerRenderer.observeAnimated(container);
              }
            }
          } else if(media) {
            const size = isGallery ? 48 : undefined;
            isGallery && container.classList.add('no-border-radius');
            wrapPhoto({
              photo: media,
              container: isGallery ? container : preview,
              boxWidth: size,
              boxHeight: size,
              middleware,
              lazyLoadQueue: this.lazyLoadQueue,
              loadPromises
            });
          }
        }
      }

      return Promise.all(loadPromises).then(() => {
        if(!middleware()) {
          gifsMasonry.clear();
          return;
        }

        list.classList.toggle('is-gallery', isGallery);
        list.classList.toggle('super-stickers', isGallery);
        this.container.classList.toggle('is-gallery', isGallery);

        /* if(isGallery) {
          list.style.gridTemplateColumns = `repeat(${Math.min(botResults.results.length, 4)}, 1fr)`;
        }

        this.container.style.setProperty('width', isGallery ? `${Math.min(botResults.results.length, 4) * 25}%` : '', 'important'); */

        const parent = this.list.parentElement;
        parent.textContent = '';
        const switchTo = botResults.switch_pm || botResults.switch_webview;
        if(switchTo) {
          const btnSwitchTo = Button('btn-primary btn-secondary btn-primary-transparent primary');
          setInnerHTML(btnSwitchTo, wrapEmojiText(switchTo.text));
          attachClickEvent(btnSwitchTo, async(e) => {
            if(switchTo._ === 'inlineBotSwitchPM') {
              await this.chat.appImManager.setInnerPeer({peerId});
              this.managers.appInlineBotsManager.switchToPM(peerId, botId, switchTo.start_param);
            } else {
              this.chat.openWebApp({
                botId,
                url: switchTo.url,
                isSimpleWebView: true,
                buttonText: switchTo.text,
                fromSwitchWebView: true
              });
            }
          });
          parent.append(btnSwitchTo);
        }
        parent.append(this.list = list);
        this.container.classList.remove('cant-send');

        this.gifsMasonry?.detach();
        this.gifsMasonry = gifsMasonry;
        gifsMasonry.attach();

        if(!this.onChangeScreen) {
          this.onChangeScreen = () => {
            if(this.list.classList.contains('is-gallery')) {
              const width = (this.list.childElementCount * mediaSizes.active.popupSticker.width) + (this.list.childElementCount - 1 * 1);
              this.list.style.width = width + 'px';
            } else {
              this.list.style.width = '';
            }
          };
          mediaSizes.addEventListener('changeScreen', this.onChangeScreen);
        }

        this.onChangeScreen();

        this.toggle(!botResults.results.length && !switchTo);
        this.scrollable.scrollPosition = 0;
      });
    });

    return {user: peer, renderPromise};
  };

  public init() {
    this.list = document.createElement('div');
    this.list.classList.add('inline-helper-results');

    this.container.append(this.list);

    this.scrollable = new Scrollable(this.container);
    this.lazyLoadQueue = new LazyLoadQueue();
    this.superStickerRenderer = new SuperStickerRenderer({
      regularLazyLoadQueue: this.lazyLoadQueue,
      group: ANIMATION_GROUP,
      managers: this.managers
    });

    const span = i18n(POSTING_NOT_ALLOWED_MAP['send_inline']);
    span.classList.add('inline-helper-cant-send');
    this.container.append(span);
  }
}
