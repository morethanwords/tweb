import renderImageFromUrl from "../../helpers/dom/renderImageFromUrl";
import { limitSymbols } from "../../helpers/string";
import appImManager, { CHAT_ANIMATION_GROUP } from "../../lib/appManagers/appImManager";
import appMessagesManager from "../../lib/appManagers/appMessagesManager";
import appPhotosManager from "../../lib/appManagers/appPhotosManager";
import { RichTextProcessor } from "../../lib/richtextprocessor";
import DivAndCaption from "../divAndCaption";
import { wrapSticker } from "../wrappers";

export function wrapReplyDivAndCaption(options: {
  title: string,
  titleEl: HTMLElement,
  subtitle: string,
  subtitleEl: HTMLElement,
  message: any,
  mediaEl: HTMLElement
}) {
  let {title, titleEl, subtitle, subtitleEl, mediaEl, message} = options;
  if(title !== undefined) {
    limitSymbols(title, 140);

    title = title ? RichTextProcessor.wrapEmojiText(title) : '';
    titleEl.innerHTML = title;
  }

  const media = message && message.media;
  let setMedia = false;
  if(media && mediaEl) {
    subtitleEl.textContent = '';
    subtitleEl.append(appMessagesManager.wrapMessageForReply(message));

    //console.log('wrap reply', media);
    
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

        const cacheContext = appPhotosManager.getCacheContext(photo);

        if(!cacheContext.downloaded) {
          const sizes = photo.sizes || photo.thumbs;
          if(sizes && sizes[0].bytes) {
            setMedia = true;
            renderImageFromUrl(mediaEl, appPhotosManager.getPreviewURLFromThumb(sizes[0]));
          }
        }

        const size = appPhotosManager.choosePhotoSize(photo, boxSize, boxSize/* mediaSizes.active.regular.width, mediaSizes.active.regular.height */);
        if(size._ !== 'photoSizeEmpty') {
          setMedia = true;
          appPhotosManager.preloadPhoto(photo, size)
          .then(() => {
            renderImageFromUrl(mediaEl, photo._ === 'photo' ? photo.url : appPhotosManager.getDocumentCachedThumb(photo.id).url);
          });
        }
      }
    }
  } else {
    subtitle = limitSymbols(subtitle, 140);
    subtitle = subtitle ? RichTextProcessor.wrapEmojiText(subtitle) : '';
    subtitleEl.innerHTML = subtitle;
  }
  
  return setMedia;
}

export default class ReplyContainer extends DivAndCaption<(title: string, subtitle: string, message?: any) => void> {
  private mediaEl: HTMLElement;

  constructor(protected className: string) {
    super(className, (title: string, subtitle: string = '', message?: any) => {
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