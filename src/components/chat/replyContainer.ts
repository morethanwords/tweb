/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {Middleware} from '../../helpers/middleware';
import {Document, Message, MessageMedia, Photo, WebPage, VideoSize, StoryItem, MessageReplyHeader, MessageEntity} from '../../layer';
import choosePhotoSize from '../../lib/appManagers/utils/photos/choosePhotoSize';
import DivAndCaption from '../divAndCaption';
import wrapMessageForReply from '../wrappers/messageForReply';
import wrapPhoto from '../wrappers/photo';
import wrapSticker from '../wrappers/sticker';
import wrapVideo from '../wrappers/video';
import wrapRichText, {WrapRichTextOptions} from '../../lib/richTextProcessor/wrapRichText';
import {WrapReplyOptions} from '../wrappers/reply';
import {Modify} from '../../types';
import {i18n} from '../../lib/langPack';
import Icon from '../icon';
import LazyLoadQueue from '../lazyLoadQueue';
import replaceContent from '../../helpers/dom/replaceContent';
import limitSymbols from '../../helpers/string/limitSymbols';
import wrapEmojiText from '../../lib/richTextProcessor/wrapEmojiText';

const MEDIA_SIZE = 32;

export async function wrapReplyDivAndCaption(options: {
  title?: string | HTMLElement | DocumentFragment,
  titleEl: HTMLElement,
  subtitle?: string | HTMLElement | DocumentFragment,
  subtitleEl: HTMLElement,
  message: Message.message | Message.messageService,
  storyItem?: StoryItem.storyItem,
  mediaEl: HTMLElement,
  isStoryExpired?: boolean,
  middleware?: Middleware,
  lazyLoadQueue?: false | LazyLoadQueue,
  replyHeader?: MessageReplyHeader,
  quote?: {text: string, entities?: MessageEntity[]},
  withoutMediaType?: boolean,
  canTranslate?: boolean
} & WrapRichTextOptions) {
  options.loadPromises ||= [];

  const {titleEl, subtitleEl, mediaEl, message, loadPromises, animationGroup, middleware, lazyLoadQueue, replyHeader} = options;
  let {storyItem, quote} = options;

  let wrappedTitle = options.title;
  if(wrappedTitle !== undefined) {
    if(typeof(wrappedTitle) === 'string') {
      wrappedTitle = limitSymbols(wrappedTitle, 140);
      wrappedTitle = wrapEmojiText(wrappedTitle);
    }

    replaceContent(titleEl, wrappedTitle);
  } else if(options.isStoryExpired) {
    const icon = Icon('bomb', 'expired-story-icon');
    titleEl.append(icon, i18n('ExpiredStory'));
  }

  const isMessageReply = replyHeader?._ === 'messageReplyHeader';

  if(isMessageReply && replyHeader.quote_text) {
    quote ??= {
      text: replyHeader.quote_text,
      entities: replyHeader.quote_entities
    };
  }

  let messageMedia: MessageMedia | WebPage.webPage = storyItem?.media ||
    (message as Message.message)?.media ||
    (isMessageReply && replyHeader.reply_media);

  if(messageMedia?._ === 'messageMediaStory') {
    storyItem = messageMedia.story as StoryItem.storyItem;
    messageMedia = storyItem?.media;
  }

  let setMedia = false, isRound = false;
  const mediaChildren = mediaEl ? Array.from(mediaEl.children).slice() : [];
  if(messageMedia && mediaEl) {
    messageMedia = (messageMedia as MessageMedia.messageMediaWebPage).webpage as WebPage.webPage || messageMedia;
    const photo = (messageMedia as MessageMedia.messageMediaPhoto).photo as Photo.photo;
    const document = (messageMedia as MessageMedia.messageMediaDocument).document as Document.document;
    if(photo || (document && document.thumbs?.length)/* ['video', 'sticker', 'gif', 'round', 'photo', 'audio'].indexOf(document.type) !== -1) */) {
      if(document?.type === 'sticker') {
        await wrapSticker({
          doc: document,
          div: mediaEl,
          lazyLoadQueue: lazyLoadQueue || undefined,
          group: animationGroup,
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
          lazyLoadQueue: lazyLoadQueue || undefined,
          noPlayButton: true,
          noInfo: true,
          middleware,
          loadPromises,
          withoutPreloader: true,
          videoSize: document.video_thumbs[0] as Extract<VideoSize, VideoSize.videoSize>,
          group: animationGroup
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
  }

  if(options.subtitle !== undefined) {
    let wrappedSubtitle = options.subtitle;
    if(typeof(wrappedSubtitle) === 'string') {
      wrappedSubtitle = limitSymbols(wrappedSubtitle, 140);
      wrappedSubtitle = wrapEmojiText(wrappedSubtitle);
    }

    replaceContent(subtitleEl, wrappedSubtitle || '');
  } else if(storyItem && options.storyItem) {
    subtitleEl.replaceChildren(i18n('Story'));
  } else if(options.isStoryExpired) {
    const icon = Icon('bomb', 'expired-story-icon');
    subtitleEl.replaceChildren(icon, i18n('ExpiredStory'));
  } else if(quote) {
    const fragment = wrapRichText(limitSymbols(quote.text, 200), {
      ...options,
      noLinebreaks: true,
      entities: quote.entities,
      noLinks: true
      // noTextFormat: true
    });

    subtitleEl.replaceChildren(fragment);
  } else if(message) {
    const fragment = await wrapMessageForReply(options);
    subtitleEl.replaceChildren(fragment);
  }

  // if(options.isStoryExpired) {
  //   setMedia = true;
  // }

  Promise.all(loadPromises).then(() => {
    if(middleware && !middleware()) return;
    mediaChildren.forEach((child) => child.remove());

    if(mediaEl) {
      mediaEl.classList.toggle('is-round', isRound);
    }
  });

  return setMedia;
}

export default class ReplyContainer extends DivAndCaption<(options: WrapReplyOptions) => Promise<void>> {
  private mediaEl: HTMLElement;

  constructor(protected className: string) {
    super(className, async(options) => {
      if(!this.mediaEl) {
        this.mediaEl = document.createElement('div');
        this.mediaEl.classList.add(this.className + '-media');
      }

      const isMediaSet = await wrapReplyDivAndCaption({
        ...(options as Modify<typeof options, {message: Message.message | Message.messageService}>),
        titleEl: this.title,
        subtitleEl: this.subtitle,
        mediaEl: this.mediaEl
      });

      if(options.isStoryExpired) {
        // this.mediaEl.classList.add('is-expired-story', 'tgico-clock');
        this.container.classList.add('is-expired-story');
      }

      this.container.classList.toggle('is-media', isMediaSet);
      if(isMediaSet) {
        this.content.prepend(this.mediaEl);
      } else {
        this.mediaEl.remove();
      }
    });
  }
}
