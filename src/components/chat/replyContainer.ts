/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import replaceContent from '../../helpers/dom/replaceContent';
import limitSymbols from '../../helpers/string/limitSymbols';
import {Document, MessageMedia, Photo, WebPage} from '../../layer';
import appImManager, {CHAT_ANIMATION_GROUP} from '../../lib/appManagers/appImManager';
import choosePhotoSize from '../../lib/appManagers/utils/photos/choosePhotoSize';
import wrapEmojiText from '../../lib/richTextProcessor/wrapEmojiText';
import DivAndCaption from '../divAndCaption';
import {wrapPhoto, wrapSticker, wrapVideo} from '../wrappers';
import wrapMessageForReply from '../wrappers/messageForReply';

const MEDIA_SIZE = 32;

export async function wrapReplyDivAndCaption(options: {
  title: string | HTMLElement | DocumentFragment,
  titleEl: HTMLElement,
  subtitle: string | HTMLElement | DocumentFragment,
  subtitleEl: HTMLElement,
  message: any,
  mediaEl: HTMLElement,
  loadPromises?: Promise<any>[]
}) {
  let {title, titleEl, subtitle, subtitleEl, mediaEl, message, loadPromises} = options;
  if(title !== undefined) {
    if(typeof(title) === 'string') {
      title = limitSymbols(title, 140);
      title = wrapEmojiText(title);
    }

    replaceContent(titleEl, title);
  }

  if(!loadPromises) {
    loadPromises = [];
  }

  let messageMedia: MessageMedia | WebPage.webPage = message?.media;
  let setMedia = false, isRound = false;
  const mediaChildren = mediaEl ? Array.from(mediaEl.children).slice() : [];
  let middleware: () => boolean;
  if(messageMedia && mediaEl) {
    subtitleEl.textContent = '';
    subtitleEl.append(await wrapMessageForReply(message, undefined, undefined, undefined, undefined, true));

    messageMedia = (messageMedia as MessageMedia.messageMediaWebPage).webpage as WebPage.webPage || messageMedia;
    const photo = (messageMedia as MessageMedia.messageMediaPhoto).photo as Photo.photo;
    const document = (messageMedia as MessageMedia.messageMediaDocument).document as Document.document;
    if(photo || (document && document.thumbs?.length)/* ['video', 'sticker', 'gif', 'round', 'photo', 'audio'].indexOf(document.type) !== -1) */) {
      middleware = appImManager.chat.bubbles.getMiddleware();
      const lazyLoadQueue = appImManager.chat.bubbles.lazyLoadQueue;

      if(document?.type === 'sticker') {
        await wrapSticker({
          doc: document,
          div: mediaEl,
          lazyLoadQueue,
          group: CHAT_ANIMATION_GROUP,
          // onlyThumb: document.sticker === 2,
          width: MEDIA_SIZE,
          height: MEDIA_SIZE,
          middleware,
          loadPromises
        });
        setMedia = true;
      } else if(document?.type === 'gif' && document.video_thumbs) {
        setMedia = true;
        await wrapVideo({
          doc: document,
          container: mediaEl,
          boxWidth: MEDIA_SIZE,
          boxHeight: MEDIA_SIZE,
          lazyLoadQueue,
          noPlayButton: true,
          noInfo: true,
          middleware,
          loadPromises,
          withoutPreloader: true,
          videoSize: document.video_thumbs[0],
          group: CHAT_ANIMATION_GROUP
        });
      } else {
        const m = photo || document;
        isRound = document?.type === 'round';

        try {
          await wrapPhoto({
            photo: m,
            container: mediaEl,
            boxWidth: MEDIA_SIZE,
            boxHeight: MEDIA_SIZE,
            size: choosePhotoSize(m, MEDIA_SIZE, MEDIA_SIZE),
            middleware,
            lazyLoadQueue,
            noBlur: true,
            withoutPreloader: true,
            loadPromises
          });
          setMedia = true;
        } catch(err) {

        }
      }
    }
  } else {
    if(message) {
      subtitleEl.textContent = '';
      subtitleEl.append(await wrapMessageForReply(message));
    } else {
      if(typeof(subtitle) === 'string') {
        subtitle = limitSymbols(subtitle, 140);
        subtitle = wrapEmojiText(subtitle);
      }

      replaceContent(subtitleEl, subtitle || '');
    }
  }

  Promise.all(loadPromises).then(() => {
    if(middleware && !middleware()) return;
    mediaChildren.forEach((child) => child.remove());

    if(mediaEl) {
      mediaEl.classList.toggle('is-round', isRound);
    }
  });

  return setMedia;
}

export default class ReplyContainer extends DivAndCaption<(title: string | HTMLElement | DocumentFragment, subtitle: string | HTMLElement | DocumentFragment, message?: any) => Promise<void>> {
  private mediaEl: HTMLElement;

  constructor(protected className: string) {
    super(className, async(title, subtitle = '', message?) => {
      if(!this.mediaEl) {
        this.mediaEl = document.createElement('div');
        this.mediaEl.classList.add(this.className + '-media');
      }

      const isMediaSet = await wrapReplyDivAndCaption({
        title,
        titleEl: this.title,
        subtitle,
        subtitleEl: this.subtitle,
        mediaEl: this.mediaEl,
        message
      });

      this.container.classList.toggle('is-media', isMediaSet);
      if(isMediaSet) {
        this.content.prepend(this.mediaEl);
      } else {
        this.mediaEl.remove();
      }
    });
  }
}
