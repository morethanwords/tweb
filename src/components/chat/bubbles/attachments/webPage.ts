import type {BubbleContextState} from '@components/chat/bubbles/context';
import {Message, MessageMedia, Photo, WebPage, WebPageAttribute} from '@layer';
import wrapPhoto from '@components/wrappers/photo';
import wrapVideo from '@components/wrappers/video';
import wrapDocument from '@components/wrappers/document';
import WebPageBox from '@components/wrappers/webPage';
import wrapUrl from '@lib/richTextProcessor/wrapUrl';
import {UNSAFE_ANCHOR_LINK_TYPES} from '@helpers/addAnchorListener';
import {i18n} from '@lib/langPack';
import wrapEmojiText from '@lib/richTextProcessor/wrapEmojiText';
import wrapRichText from '@lib/richTextProcessor/wrapRichText';
import htmlToDocumentFragment from '@helpers/dom/htmlToDocumentFragment';
import setBlankToAnchor from '@lib/richTextProcessor/setBlankToAnchor';
import cancelClickOrNextIfNotClick from '@helpers/dom/cancelClickOrNextIfNotClick';
import cancelEvent from '@helpers/dom/cancelEvent';
import mediaSizes from '@helpers/mediaSizes';
import setAttachmentSize from '@helpers/setAttachmentSize';
import {openInstantViewInAppBrowser} from '@components/browser';
import Icon from '@components/icon';
import getPeerId from '@appManagers/utils/peers/getPeerId';
import type {MyDocument} from '@appManagers/appDocsManager';

function wrapWebPageTitle(webPage: WebPage.webPage) {
  const el = document.createElement('span');
  if(webPage.title) {
    el.append(wrapEmojiText(webPage.title));
  }
  return el;
}

function wrapWebPageDescription(webPage: WebPage.webPage) {
  const el = document.createElement('span');
  if(webPage.description) {
    el.append(wrapRichText(webPage.description, {entities: webPage.entities}));
  }
  return el;
}

/**
 * Renders a webPage preview. Returns props for WebPageBox + boxRefs.
 * Extracted from ChatBubbles.renderMessage case 'messageMediaWebPage'.
 */
export function renderWebPage(
  message: Message.message,
  media: MessageMedia.messageMediaWebPage,
  ctx: BubbleContextState
) {
  const webPage = media.webpage;
  if(!webPage || webPage._ !== 'webPage') return;

  const bubbles = ctx.bubbles;
  const middleware = ctx.middleware;
  const isOut = ctx.isOut();
  const invertMedia = ctx.invertMedia();
  const loadPromises = ctx.loadPromises;

  const storyAttribute = webPage.attributes?.find((a) => a._ === 'webPageAttributeStory') as WebPageAttribute.webPageAttributeStory;
  const starGiftAttribute = webPage.attributes?.find((a) => a._ === 'webPageAttributeUniqueStarGift');
  const starGiftCollectionAttribute = webPage.attributes?.find((a) => a._ === 'webPageAttributeStarGiftCollection');

  const wrapped = wrapUrl(webPage.url);

  const props: Parameters<typeof WebPageBox>[0] = {};
  const boxRefs: ((box: HTMLAnchorElement) => void)[] = [];

  const hasSafeUrl = wrapped.onclick && !UNSAFE_ANCHOR_LINK_TYPES.has(wrapped.onclick);
  if(webPage.cached_page) {
    const span = document.createElement('span');
    span.append(Icon('boost', 'inline-icon', 'inline-icon-left'), i18n('WebPage.InstantView'));
    props.footer = {content: span};

    boxRefs.push((box) => {
      bubbles.webPageClickCallbacks?.set(box, (e: MouseEvent) => {
        if(e.metaKey || e.ctrlKey) return;
        cancelClickOrNextIfNotClick(e);
        openInstantViewInAppBrowser({
          webPageId: webPage.id,
          cachedPage: webPage.cached_page,
          anchor: new URL(wrapped.url).hash,
          HotReloadGuardProvider: ctx.HotReloadGuard
        });
      });
    });
  } else if(hasSafeUrl) {
    boxRefs.push((box) => box.setAttribute('safe', '1'));
    const webPageTypes: Record<string, string> = {
      telegram_channel: 'Chat.Message.ViewChannel',
      telegram_megagroup: 'OpenGroup',
      telegram_bot: 'Chat.Message.ViewBot',
      telegram_user: 'Chat.Message.SendMessage',
      telegram_chatlist: 'OpenChatlist',
      telegram_story: 'OpenStory'
    };
    const langPackKey = webPageTypes[webPage.type] || 'OpenMessage';
    props.footer = {content: i18n(langPackKey as any)};
    boxRefs.push((box) => {
      box.dataset.callback = wrapped.onclick;
    });
  } else {
    const isUnsafe = !media.pFlags.safe;
    boxRefs.push((box) => {
      setBlankToAnchor(box);
      if(isUnsafe) box.dataset.callback = 'showMaskedAlert';
    });
  }

  if(wrapped?.url) {
    boxRefs.push((box) => {
      box.href = wrapped.url;
    });
  }

  const doc = webPage.document as MyDocument;
  const photo = webPage.photo as Photo.photo;
  const hasLargeMedia = !!webPage.pFlags.has_large_media;
  const hasSmallMedia = !!(hasLargeMedia && media.pFlags.force_small_media);
  const willHaveMedia = !!(photo || doc || storyAttribute || starGiftAttribute || starGiftCollectionAttribute);

  let preview: HTMLDivElement;
  if(willHaveMedia) {
    preview = document.createElement('div');
    props.media = {content: preview, position: 'top'};
  }

  // media inside webPage
  if(doc) {
    if(doc.type === 'gif' || doc.type === 'video' || doc.type === 'round') {
      const mediaSize = doc.type === 'round' ? mediaSizes.active.round : mediaSizes.active.webpage;
      wrapVideo({
        doc,
        container: preview,
        message,
        boxWidth: mediaSize.width,
        boxHeight: mediaSize.height,
        lazyLoadQueue: ctx.lazyLoadQueue,
        middleware,
        isOut,
        group: ctx.wrapOptions.animationGroup,
        loadPromises,
        autoDownload: ctx.chat.autoDownload,
        noInfo: message.mid < 0
      });
    } else {
      wrapDocument({
        message,
        middleware,
        autoDownloadSize: ctx.chat.autoDownload.file,
        lazyLoadQueue: ctx.lazyLoadQueue,
        loadPromises,
        sizeType: 'documentName'
      }).then((docDiv) => {
        if(docDiv) preview.append(docDiv);
      });
      if(props.media) props.media.hasDocument = true;
    }
  }

  // site name
  if(webPage.site_name) {
    let smth: HTMLElement | DocumentFragment = wrapEmojiText(webPage.site_name);
    const html = wrapRichText(webPage.url);
    const a = htmlToDocumentFragment(html).firstElementChild as any;
    if(a) {
      a.replaceChildren(smth);
      smth = a;
    }
    props.name = {content: smth};
  }

  // title & description
  const title = wrapWebPageTitle(webPage);
  if(title.textContent) props.title = title;

  const description = wrapWebPageDescription(webPage);
  if(description.textContent) props.text = description;

  // photo
  let isSquare = false;
  if(photo && !doc && !starGiftAttribute) {
    const squareBoxSize = 48;
    const size = photo.sizes?.[photo.sizes.length - 1] as any;
    if((!size || (size.w === size.h && !hasLargeMedia) || hasSmallMedia) && (props.name || props.title || props.text)) {
      isSquare = true;
      if(props.media) props.media.photoSize = 'square';
      preview.style.width = preview.style.height = `${squareBoxSize}px`;
    } else if(size?.h > size?.w && !hasLargeMedia) {
      if(props.media) props.media.photoSize = 'vertical';
    }

    wrapPhoto({
      photo,
      message,
      container: preview,
      boxWidth: isSquare ? 0 : mediaSizes.active.webpage.width,
      boxHeight: isSquare ? 0 : mediaSizes.active.webpage.height,
      isOut,
      lazyLoadQueue: ctx.lazyLoadQueue,
      middleware,
      loadPromises,
      withoutPreloader: isSquare,
      autoDownloadSize: ctx.chat.autoDownload.photo
    });
  }

  // story inside webPage
  if(storyAttribute) {
    const storyPeerId = getPeerId(storyAttribute.peer);
    const storyId = storyAttribute.id;
    const size = mediaSizes.active.webpage;

    setAttachmentSize({
      photo: {
        _: 'photo', id: 0,
        sizes: [{_: 'photoSize', w: 180, h: 320, type: 'q', size: 0}],
        pFlags: {}, access_hash: 0, file_reference: [], date: 0, dc_id: 0
      },
      element: preview,
      boxWidth: size.width,
      boxHeight: size.height,
      message
    });

    bubbles.wrapStory?.({
      message,
      bubble: preview.closest('.bubble') || preview,
      storyPeerId,
      storyId,
      container: preview,
      middleware,
      loadPromises,
      boxWidth: size.width,
      boxHeight: size.height
    });
  }

  // star gift inside webPage
  if(starGiftAttribute && preview) {
    preview.style.width = '240px';
    preview.style.height = '240px';
    // async: load and render star gift
    ctx.bubbles.managers?.appGiftsManager?.wrapGiftFromWebPage?.(starGiftAttribute).then((gift: any) => {
      if(!gift) return;
      const {UniqueStarGiftWebPageBox} = require('@components/chat/bubbles/starGift');
      ctx.bubbles.wrapSomeSolid?.(() => UniqueStarGiftWebPageBox({
        gift,
        wrapStickerOptions: {
          play: true,
          loop: false,
          middleware,
          lazyLoadQueue: ctx.lazyLoadQueue,
          group: ctx.wrapOptions.animationGroup
        }
      }), preview, middleware);
    });
    props.text = undefined;
  }

  // star gift collection inside webPage
  if(starGiftCollectionAttribute && preview) {
    const icons = (starGiftCollectionAttribute as any).icons;
    if(icons?.[0]) {
      ctx.bubbles.managers?.appDocsManager?.saveDoc?.(icons[0]).then((savedDoc: any) => {
        if(!savedDoc) return;
        import('@components/wrappers/sticker').then(({default: wrapStickerFn}) => {
          wrapStickerFn({
            doc: savedDoc,
            div: preview,
            middleware,
            lazyLoadQueue: ctx.lazyLoadQueue,
            play: true,
            loop: false,
            group: ctx.wrapOptions.animationGroup
          });
        });
      });
      preview.style.width = '48px';
      preview.style.height = '48px';
      if(props.media) props.media.photoSize = 'square';
      isSquare = true;
    }
  }

  if(preview && props.media) {
    props.media.position = invertMedia || isSquare ? 'top' : 'bottom';
  }

  // CSS classes that the caller should apply to the bubble element
  const bubbleClasses: string[] = ['has-webpage', 'single-media'];
  if(photo && !doc && !starGiftAttribute) bubbleClasses.push('photo');
  if(isSquare) bubbleClasses.push('is-square-photo');
  if(!isSquare && photo && !doc && !starGiftAttribute) {
    const size = photo.sizes?.[photo.sizes.length - 1] as any;
    if(size?.h > size?.w && !hasLargeMedia) bubbleClasses.push('is-vertical-photo');
  }
  if(doc?.type === 'round') bubbleClasses.push('round');
  else if(doc && (doc.type === 'video' || doc.type === 'gif')) bubbleClasses.push('video');
  if(storyAttribute) bubbleClasses.push('photo', 'story');
  if(starGiftAttribute) bubbleClasses.push('gift');

  return {props, boxRefs, clickable: true, bubbleClasses};
}
