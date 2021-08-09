/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import replaceContent from "../../helpers/dom/replaceContent";
import { getMiddleware } from "../../helpers/middleware";
import { limitSymbols } from "../../helpers/string";
import appImManager, { CHAT_ANIMATION_GROUP } from "../../lib/appManagers/appImManager";
import appMessagesManager from "../../lib/appManagers/appMessagesManager";
import appPhotosManager from "../../lib/appManagers/appPhotosManager";
import { RichTextProcessor } from "../../lib/richtextprocessor";
import DivAndCaption from "../divAndCaption";
import { wrapPhoto, wrapSticker } from "../wrappers";

const MEDIA_SIZE = 32;

export function wrapReplyDivAndCaption(options: {
  title: string | HTMLElement,
  titleEl: HTMLElement,
  subtitle: string | HTMLElement,
  subtitleEl: HTMLElement,
  message: any,
  mediaEl: HTMLElement,
  loadPromises?: Promise<any>[]
}) {
  let {title, titleEl, subtitle, subtitleEl, mediaEl, message, loadPromises} = options;
  if(title !== undefined) {
    if(typeof(title) === 'string') {
      title = limitSymbols(title, 140);
      title = RichTextProcessor.wrapEmojiText(title);
    }

    replaceContent(titleEl, title);
  }

  if(!loadPromises) {
    loadPromises = [];
  }

  let media = message && message.media;
  let setMedia = false, isRound = false;
  const mediaChildren = mediaEl ? Array.from(mediaEl.children) : [];
  let middleware: () => boolean;
  if(media && mediaEl) {
    subtitleEl.textContent = '';
    subtitleEl.append(appMessagesManager.wrapMessageForReply(message));

    //console.log('wrap reply', media);

    if(media.webpage) {
      media = media.webpage;
    }
    
    if(media.photo || (media.document && ['video', 'sticker', 'gif', 'round'].indexOf(media.document.type) !== -1)) {
      middleware = appImManager.chat.bubbles.getMiddleware();
      const lazyLoadQueue = appImManager.chat.bubbles.lazyLoadQueue;

      if(media.document?.type === 'sticker') {
        setMedia = true;
        wrapSticker({
          doc: media.document,
          div: mediaEl,
          lazyLoadQueue,
          group: CHAT_ANIMATION_GROUP,
          //onlyThumb: media.document.sticker === 2,
          width: MEDIA_SIZE,
          height: MEDIA_SIZE,
          middleware,
          loadPromises
        });
      } else {
        const photo = media.photo || media.document;

        isRound = photo.type === 'round';

        try {
          wrapPhoto({
            photo,
            container: mediaEl,
            boxWidth: MEDIA_SIZE,
            boxHeight: MEDIA_SIZE,
            size: appPhotosManager.choosePhotoSize(photo, MEDIA_SIZE, MEDIA_SIZE),
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
      subtitleEl.append(appMessagesManager.wrapMessageForReply(message, message.message && limitSymbols(message.message, 140)));
    } else if(typeof(subtitle) === 'string') {
      subtitle = limitSymbols(subtitle, 140);
      subtitle = RichTextProcessor.wrapEmojiText(subtitle);
      replaceContent(subtitleEl, subtitle);
    }
  }

  Promise.all(loadPromises).then(() => {
    if(middleware && !middleware()) return;
    mediaChildren.forEach(child => child.remove());

    if(mediaEl) {
      mediaEl.classList.toggle('is-round', isRound);
    }
  });

  return setMedia;
}

export default class ReplyContainer extends DivAndCaption<(title: string | HTMLElement, subtitle: string | HTMLElement, message?: any) => void> {
  private mediaEl: HTMLElement;

  constructor(protected className: string) {
    super(className, (title: string | HTMLElement, subtitle: string | HTMLElement = '', message?: any) => {
      if(!this.mediaEl) {
        this.mediaEl = document.createElement('div');
        this.mediaEl.classList.add(this.className + '-media');
      }

      const isMediaSet = wrapReplyDivAndCaption({
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
