import type {BubbleContextState} from '@components/chat/bubbles/context';
import {Message, MessageMedia, MessageExtendedMedia, Photo, Document, WebDocument} from '@layer';
import wrapPhoto from '@components/wrappers/photo';
import wrapVideo from '@components/wrappers/video';
import wrapAlbum from '@components/wrappers/album';
import paymentsWrapCurrencyAmount from '@helpers/paymentsWrapCurrencyAmount';
import {i18n} from '@lib/langPack';
import NBSP from '@helpers/string/nbsp';
import Icon from '@components/icon';
import setInnerHTML from '@helpers/dom/setInnerHTML';
import wrapEmojiText from '@lib/richTextProcessor/wrapEmojiText';
import mediaSizes from '@helpers/mediaSizes';
import toHHMMSS from '@helpers/string/toHHMMSS';
import getMediaFromMessage from '@appManagers/utils/messages/getMediaFromMessage';
import generatePhotoForExtendedMediaPreview from '@lib/appManagers/utils/photos/generatePhotoForExtendedMediaPreview';

const STARS_CURRENCY = 'XTR';

/**
 * Renders invoice/paidMedia content inside the attachment container.
 */
export function renderInvoice(
  container: HTMLDivElement,
  message: Message.message,
  media: MessageMedia.messageMediaInvoice | MessageMedia.messageMediaPaidMedia,
  ctx: BubbleContextState
) {
  type I = MessageMedia.messageMediaInvoice;
  type P = MessageMedia.messageMediaPaidMedia;
  type M = Photo.photo | Document.document | WebDocument;

  const isOut = ctx.isOut();
  const pFlags = (media as I).pFlags || {};
  const isTest = pFlags.test;
  const isInvoice = media._ === 'messageMediaInvoice';
  const extendedMedia = (Array.isArray(media.extended_media) ? media.extended_media : [media.extended_media]).filter(Boolean);
  const isAlreadyPaid = extendedMedia[0]?._ === 'messageExtendedMedia';
  const isNotPaid = extendedMedia[0]?._ === 'messageExtendedMediaPreview';

  let innerMedia: M | M[];
  let videoTimes: HTMLElement[];
  if(isInvoice) {
    innerMedia = (media as I).photo;
  } else if(isAlreadyPaid) {
    innerMedia = extendedMedia.map((m) => getMediaFromMessage(m as any) as M);
  }

  const wrappedPrice = isInvoice ?
    paymentsWrapCurrencyAmount((media as I).total_amount, (media as I).currency) :
    paymentsWrapCurrencyAmount((media as P).stars_amount, STARS_CURRENCY);

  let priceEl: HTMLElement;
  if(!extendedMedia.length || (!isInvoice && isAlreadyPaid)) {
    priceEl = document.createElement(innerMedia ? 'span' : 'div');
    const f = document.createDocumentFragment();
    const l = i18n((media as I).receipt_msg_id ? 'PaymentReceipt' : (isTest ? 'PaymentTestInvoice' : 'PaymentInvoice'));
    l.classList.add('text-uppercase');
    const joiner = ' ' + NBSP;
    const p = document.createElement('span');
    p.classList.add('text-bold');
    p.append(wrappedPrice);
    f.append(p);
    if(isInvoice) {
      p.append(joiner);
      f.append(l);
    } else {
      priceEl.classList.add('other-side');
    }
    if(isTest && (media as I).receipt_msg_id) {
      const a = document.createElement('span');
      a.classList.add('text-uppercase', 'pre-wrap');
      a.append(joiner + '(Test)');
      f.append(a);
    }
    setInnerHTML(priceEl, f);
  } else if(isNotPaid) {
    container.classList.add('is-buy');
    priceEl = document.createElement('span');
    priceEl.classList.add('extended-media-buy');
    if(isInvoice) {
      priceEl.append(
        Icon('premium_lock', 'extended-media-buy-icon'),
        i18n('Checkout.PayPrice', [wrappedPrice])
      );
    } else {
      priceEl.append(i18n('PaidMedia.Unlock', [wrappedPrice]));
    }

    videoTimes = extendedMedia.map((ext) => {
      const videoDuration = (ext as MessageExtendedMedia.messageExtendedMediaPreview).video_duration;
      if(videoDuration === undefined) return;
      const videoTime = document.createElement('span');
      videoTime.classList.add('video-time');
      videoTime.textContent = toHHMMSS(videoDuration, false);
      return videoTime;
    });

    if(videoTimes.length === 1 && videoTimes[0]) {
      container.append(videoTimes[0]);
    }
  }

  if(isNotPaid) {
    type P = MessageExtendedMedia.messageExtendedMediaPreview;
    innerMedia = extendedMedia.map((ext) => generatePhotoForExtendedMediaPreview(ext as P));
  }

  if(Array.isArray(innerMedia) && innerMedia.length === 1) {
    innerMedia = innerMedia[0];
  }

  if(innerMedia) {
    const mediaSize = extendedMedia.length ? mediaSizes.active.extendedInvoice : mediaSizes.active.invoice;
    if(Array.isArray(innerMedia)) {
      wrapAlbum({
        media: innerMedia as (Photo.photo | Document.document)[],
        attachmentDiv: container,
        middleware: ctx.middleware,
        isOut,
        lazyLoadQueue: ctx.lazyLoadQueue,
        chat: ctx.chat,
        loadPromises: ctx.loadPromises,
        autoDownload: ctx.chat.autoDownload,
        spoilered: !isAlreadyPaid,
        videoTimes
      });
    } else if((innerMedia as any)._ === 'document') {
      wrapVideo({
        doc: innerMedia as Document.document,
        container,
        withTail: false,
        isOut,
        lazyLoadQueue: ctx.lazyLoadQueue,
        middleware: ctx.middleware,
        loadPromises: ctx.loadPromises,
        boxWidth: mediaSize.width,
        boxHeight: mediaSize.height,
        group: ctx.wrapOptions.animationGroup,
        message
      });
    } else {
      wrapPhoto({
        photo: innerMedia as Photo.photo,
        container,
        withTail: false,
        isOut,
        lazyLoadQueue: ctx.lazyLoadQueue,
        middleware: ctx.middleware,
        loadPromises: ctx.loadPromises,
        boxWidth: mediaSize.width,
        boxHeight: mediaSize.height,
        message: isAlreadyPaid ? message : undefined
      });
    }

    if(priceEl) {
      if(!extendedMedia.length || (!isInvoice && isAlreadyPaid)) {
        priceEl.classList.add('video-time');
      }
      container.append(priceEl);
    }
  } else if(priceEl) {
    container.append(priceEl);
  }

  // unpaid media: register for polling and add dot renderer
  if(isNotPaid && innerMedia) {
    const {mid} = message;
    const bubbles = ctx.bubbles;
    bubbles.extendedMediaMessages?.add(mid);
    ctx.middleware.onClean(() => {
      bubbles.extendedMediaMessages?.delete(mid);
    });
    bubbles.setExtendedMediaMessagesPollInterval?.();

    if(extendedMedia.length === 1) {
      const {width, height} = container.style;
      import('@components/dotRenderer').then(({default: DotRenderer}) => {
        const {canvas, readyResult} = DotRenderer.create({
          width: parseInt(width),
          height: parseInt(height),
          middleware: ctx.middleware,
          animationGroup: ctx.wrapOptions.animationGroup
        });
        ctx.loadPromises?.push(readyResult as Promise<any>);
        container.append(canvas);
      });
    }
  }

  // invoice-specific CSS and content
  const bubble = container.closest('.bubble') as HTMLElement;
  if(isInvoice) {
    bubble?.classList.add('is-invoice');

    // title
    const titleDiv = document.createElement('div');
    titleDiv.classList.add('bubble-primary-color');
    titleDiv.append(wrapEmojiText((media as MessageMedia.messageMediaInvoice).title));
    container.prepend(titleDiv);

    // description (if not already paid/extended)
    if(!isAlreadyPaid) {
      const desc = wrapEmojiText((media as MessageMedia.messageMediaInvoice).description);
      if(desc) {
        const descEl = document.createElement('div');
        descEl.append(desc);
        titleDiv.after(descEl);
      }
    }
  }

  // paid media album CSS
  if(!isInvoice && Array.isArray(innerMedia)) {
    bubble?.classList.add('is-album', 'photo');
  } else if(!isInvoice && innerMedia) {
    const isVideo = (innerMedia as any)._ === 'document';
    bubble?.classList.add(isVideo ? 'video' : 'photo');
  }
}
