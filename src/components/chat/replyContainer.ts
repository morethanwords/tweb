/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import renderImageFromUrl from "../../helpers/dom/renderImageFromUrl";
import replaceContent from "../../helpers/dom/replaceContent";
import { limitSymbols } from "../../helpers/string";
import appDownloadManager from "../../lib/appManagers/appDownloadManager";
import appImManager, { CHAT_ANIMATION_GROUP } from "../../lib/appManagers/appImManager";
import appMessagesManager from "../../lib/appManagers/appMessagesManager";
import appPhotosManager from "../../lib/appManagers/appPhotosManager";
import { RichTextProcessor } from "../../lib/richtextprocessor";
import DivAndCaption from "../divAndCaption";
import { wrapSticker } from "../wrappers";

export function wrapReplyDivAndCaption(options: {
  title: string | HTMLElement,
  titleEl: HTMLElement,
  subtitle: string | HTMLElement,
  subtitleEl: HTMLElement,
  message: any,
  mediaEl: HTMLElement
}) {
  let {title, titleEl, subtitle, subtitleEl, mediaEl, message} = options;
  if(title !== undefined) {
    if(typeof(title) === 'string') {
      title = limitSymbols(title, 140);
      title = RichTextProcessor.wrapEmojiText(title);
    }

    replaceContent(titleEl, title);
  }

  let media = message && message.media;
  let setMedia = false;
  if(media && mediaEl) {
    subtitleEl.textContent = '';
    subtitleEl.append(appMessagesManager.wrapMessageForReply(message));

    //console.log('wrap reply', media);

    if(media.webpage) {
      media = media.webpage;
    }
    
    if(media.photo || (media.document && ['video', 'sticker', 'gif'].indexOf(media.document.type) !== -1)) {
      /* const middlewareOriginal = appImManager.chat.bubbles.getMiddleware();
      const middleware = () => {
        
      }; */

      const boxSize = 32;
      if(media.document?.type === 'sticker') {
        if(mediaEl.style.backgroundImage) {
          mediaEl.style.backgroundImage = ''; 
        }

        setMedia = true;
        wrapSticker({
          doc: media.document,
          div: mediaEl,
          lazyLoadQueue: appImManager.chat.bubbles.lazyLoadQueue,
          group: CHAT_ANIMATION_GROUP,
          //onlyThumb: media.document.sticker === 2,
          width: boxSize,
          height: boxSize
        });
      } else {
        if(mediaEl.firstElementChild) {
          mediaEl.innerHTML = '';
        }

        const photo = media.photo || media.document;

        const size = appPhotosManager.choosePhotoSize(photo, boxSize, boxSize/* mediaSizes.active.regular.width, mediaSizes.active.regular.height */);
        const cacheContext = appDownloadManager.getCacheContext(photo, size.type);

        if(!cacheContext.downloaded) {
          const sizes = photo.sizes || photo.thumbs;
          if(sizes && sizes[0].bytes) {
            setMedia = true;
            renderImageFromUrl(mediaEl, appPhotosManager.getPreviewURLFromThumb(photo, sizes[0]));
          }
        }

        if(size._ !== 'photoSizeEmpty') {
          setMedia = true;
          appPhotosManager.preloadPhoto(photo, size)
          .then(() => {
            renderImageFromUrl(mediaEl, cacheContext.url);
          });
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
