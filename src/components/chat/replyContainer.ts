/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {Middleware} from '@helpers/middleware';
import {Document, Message, MessageMedia, Photo, WebPage, VideoSize, StoryItem, MessageReplyHeader, MessageEntity} from '@layer';
import choosePhotoSize from '@appManagers/utils/photos/choosePhotoSize';
import DivAndCaption from '@components/divAndCaption';
import wrapMessageForReply from '@components/wrappers/messageForReply';
import wrapPhoto from '@components/wrappers/photo';
import wrapSticker from '@components/wrappers/sticker';
import wrapVideo from '@components/wrappers/video';
import wrapRichText, {WrapRichTextOptions} from '@lib/richTextProcessor/wrapRichText';
import {WrapReplyOptions} from '@components/wrappers/reply';
import {Modify} from '@types';
import {i18n} from '@lib/langPack';
import Icon from '@components/icon';
import LazyLoadQueue from '@components/lazyLoadQueue';
import replaceContent from '@helpers/dom/replaceContent';
import limitSymbols from '@helpers/string/limitSymbols';
import wrapEmojiText from '@lib/richTextProcessor/wrapEmojiText';
import wrapMediaSpoiler from '@components/wrappers/mediaSpoiler';
import {isMessageSensitive} from '@appManagers/utils/messages/isMessageRestricted';
import compareUint8Arrays from '@helpers/bytes/compareUint8Arrays';

const MEDIA_SIZE = 32;

export type WrapReplyMediaOptions = {
  message?: Message.message | Message.messageService,
  storyItem?: StoryItem.storyItem,
  replyHeader?: MessageReplyHeader,
  mediaEl: HTMLElement,
  size?: number,
  isSensitive?: boolean,
  middleware?: Middleware,
  lazyLoadQueue?: false | LazyLoadQueue,
  loadPromises?: Promise<any>[],
  animationGroup?: WrapRichTextOptions['animationGroup']
};

/**
 * Render a small thumbnail of the media attached to a message (or story item)
 * into `mediaEl`. Handles photos, videos (via thumbs), stickers, gifs, and
 * round videos. Returns `{setMedia, isRound}` describing whether anything was
 * inserted and whether it should be drawn as a circle.
 *
 * Extracted from `wrapReplyDivAndCaption` so the same render can be reused
 * outside of reply-style previews (e.g. day cells in the date-picker calendar).
 */
export async function wrapReplyMedia({
  message,
  storyItem,
  replyHeader,
  mediaEl,
  size = MEDIA_SIZE,
  isSensitive,
  middleware,
  lazyLoadQueue,
  loadPromises,
  animationGroup
}: WrapReplyMediaOptions): Promise<{setMedia: boolean, isRound: boolean}> {
  loadPromises ??= [];

  let messageMedia: MessageMedia | WebPage.webPage = storyItem?.media ||
    (message as Message.message)?.media ||
    (replyHeader?._ === 'messageReplyHeader' && replyHeader.reply_media);

  if(messageMedia?._ === 'messageMediaStory') {
    storyItem = messageMedia.story as StoryItem.storyItem;
    messageMedia = storyItem?.media;
  }

  let setMedia = false, isRound = false;
  if(!messageMedia || !mediaEl || (messageMedia as MessageMedia.messageMediaPhoto).ttl_seconds) {
    return {setMedia, isRound};
  }

  messageMedia = (messageMedia as MessageMedia.messageMediaWebPage).webpage as WebPage.webPage || messageMedia;
  const photo = (messageMedia as MessageMedia.messageMediaPhoto).photo as Photo.photo;
  const document = (messageMedia as MessageMedia.messageMediaDocument).document as Document.document;
  const spoiler = (messageMedia as MessageMedia.messageMediaPhoto | MessageMedia.messageMediaDocument)?.pFlags?.spoiler;

  if(!photo && !(document && document.thumbs?.length)) {
    return {setMedia, isRound};
  }

  if(document?.type === 'sticker') {
    await wrapSticker({
      doc: document,
      div: mediaEl,
      lazyLoadQueue: lazyLoadQueue || undefined,
      group: animationGroup,
      width: size,
      height: size,
      middleware,
      loadPromises
    });
    setMedia = true;
  } else if(document?.type === 'gif' && document.video_thumbs) {
    setMedia = true;
    await wrapVideo({
      doc: document,
      container: mediaEl,
      boxWidth: size,
      boxHeight: size,
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
        boxWidth: size,
        boxHeight: size,
        size: choosePhotoSize(m, size, size),
        middleware,
        lazyLoadQueue,
        noBlur: true,
        withoutPreloader: true,
        loadPromises
      });

      if(spoiler || isSensitive) {
        const spoilerEl = await wrapMediaSpoiler({
          media: m,
          width: size,
          height: size,
          multiply: 0.1,
          middleware,
          animationGroup
        });
        mediaEl.append(spoilerEl);
      }

      setMedia = true;
    } catch(err) {

    }
  }

  return {setMedia, isRound};
}

export async function wrapReplyDivAndCaption(options: {
  title?: string | HTMLElement | DocumentFragment,
  titleEl: HTMLElement,
  subtitle?: string | HTMLElement | DocumentFragment,
  subtitleEl: HTMLElement,
  message: Message.message | Message.messageService,
  storyItem?: StoryItem.storyItem,
  mediaEl: HTMLElement,
  isStoryExpired?: boolean,
  isSensitive?: boolean,
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
  let quoteIcon: HTMLElement | undefined;

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

  if(isMessageReply && replyHeader.poll_option && message?._ === 'message' && message.media?._ === 'messageMediaPoll') {
    const pollOption = message.media.poll.answers.find(answer => answer._ === 'pollAnswer' && compareUint8Arrays(replyHeader.poll_option, answer.option));
    if(pollOption) {
      quoteIcon = Icon('checkround_filled');
      quote ??= {
        text: pollOption.text.text,
        entities: pollOption.text.entities
      };
    }
  }

  const mediaChildren = mediaEl ? Array.from(mediaEl.children).slice() : [];
  const {setMedia, isRound} = await wrapReplyMedia({
    message,
    storyItem,
    replyHeader,
    mediaEl,
    isSensitive: options.isSensitive,
    middleware,
    lazyLoadQueue,
    loadPromises,
    animationGroup
  });

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

    subtitleEl.classList.add('with-icon');
    subtitleEl.replaceChildren(...[quoteIcon, fragment].filter(Boolean));
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
        isSensitive: options.isChatSensitive || (options.message && isMessageSensitive(options.message)),
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
