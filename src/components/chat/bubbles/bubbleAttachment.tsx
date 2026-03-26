import {onMount} from 'solid-js';
import {useBubble, BubbleContextState} from '@components/chat/bubbles/context';
import {Message, MessageMedia, Photo} from '@layer';
import wrapPhoto from '@components/wrappers/photo';
import wrapVideo from '@components/wrappers/video';
import wrapDocument from '@components/wrappers/document';
import wrapSticker from '@components/wrappers/sticker';
import wrapAlbum from '@components/wrappers/album';
import wrapGeo from '@components/wrappers/geo';
import mediaSizes from '@helpers/mediaSizes';
import setAttachmentSize from '@helpers/setAttachmentSize';
import wrapDice from '@components/chat/bubbleParts/dice';
import Giveaway, {onGiveawayClick} from '@components/chat/giveaway';
import {attachClickEvent} from '@helpers/dom/clickEvent';
import getPeerId from '@appManagers/utils/peers/getPeerId';
import {createRoot} from 'solid-js';
import {render} from 'solid-js/web';
import WebPageBox from '@components/wrappers/webPage';
import rootScope from '@lib/rootScope';
import type {MyDocument} from '@appManagers/appDocsManager';
import type {BubbleContext} from '@components/chat/bubbles';
import {renderWebPage} from '@components/chat/bubbles/attachments/webPage';
import {renderInvoice} from '@components/chat/bubbles/attachments/invoice';
import classNames from '@helpers/string/classNames';

/**
 * Bubble.Attachment — renders media attachments.
 * Routes by messageMedia._ type.
 */
export default function Attachment() {
  const ctx = useBubble();
  const message = ctx.message();

  if(message._ !== 'message') {
    return ctx.register('attachment', undefined);
  }

  const media = message.media;
  if(!media || media._ === 'messageMediaEmpty') {
    return ctx.register('attachment', undefined);
  }

  const doc = (media as MessageMedia.messageMediaDocument)?.document as MyDocument;

  // media types that render inside messageDiv (handled by Bubble.Text)
  const noAttachmentDiv = media._ === 'messageMediaCall' ||
    media._ === 'messageMediaContact' ||
    media._ === 'messageMediaPoll' ||
    media._ === 'messageMediaToDo';

  if(noAttachmentDiv) {
    return ctx.register('attachment', undefined);
  }

  return ctx.register('attachment', (() => {
    let ref: HTMLDivElement;

    onMount(() => {
      renderMedia(ref, message, media, doc, ctx);

      // apply border-radius and margin classes when attachment coexists with text
      if(!ctx.isMessageEmpty()) {
        ref.classList.add(ctx.invertMedia() ? 'no-brt' : 'no-brb');
      }
    });

    return <div ref={ref!} class="attachment" />;
  })());
}

/**
 * Creates a lightweight old-style BubbleContext for bridging to imperative wrappers.
 */
function makeLegacyContext(
  container: HTMLDivElement,
  ctx: BubbleContextState,
  message: Message.message
): BubbleContext {
  const bubble = container.closest('.bubble') as HTMLElement || container;
  const bubbleContainer = bubble.querySelector('.bubble-content') as HTMLElement || container;
  return {
    bubble,
    bubbleContainer,
    bubbles: ctx.bubbles,
    attachmentDiv: container,
    isInUnread: false,
    isOutgoing: ctx.isOutgoing(),
    middleware: ctx.middleware,
    messageMessage: message.message || '',
    messageMedia: message.media,
    loadPromises: ctx.loadPromises,
    isOut: ctx.isOut(),
    canHaveTail: ctx.canHaveTail(),
    isStandaloneMedia: ctx.isStandaloneMedia(),
    mediaRequiresMessageDiv: false
  };
}

function renderMedia(
  container: HTMLDivElement,
  message: Message.message,
  media: MessageMedia,
  doc: MyDocument | undefined,
  ctx: BubbleContextState
) {
  const isOut = ctx.isOut();
  const bubble = container.closest('.bubble') as HTMLElement;
  const sensitive = ctx.chat.isSensitive || (ctx.bubbles as any).isMessageSensitive?.(message);
  const classNamesArr: string[] = [];
  let canHideName = false;

  switch(media._) {
    case 'messageMediaPhoto':
    case 'messageMediaPhotoExternal': {
      const photo = media.photo as Photo.photo;
      if(!photo) break;

      classNamesArr.push('photo');
      canHideName = true;

      // album (grouped messages)
      const grouped = ctx.groupedMessages();
      if(grouped && grouped.length > 1) {
        classNamesArr.push('is-album', 'is-grouped');
        wrapAlbum({
          messages: grouped,
          attachmentDiv: container,
          middleware: ctx.middleware,
          isOut,
          lazyLoadQueue: ctx.lazyLoadQueue,
          chat: ctx.chat,
          loadPromises: ctx.loadPromises,
          autoDownload: ctx.chat.autoDownload
        });
        break;
      }

      const p = wrapPhoto({
        photo,
        message,
        container,
        withTail: false,
        isOut,
        lazyLoadQueue: ctx.lazyLoadQueue,
        middleware: ctx.middleware,
        loadPromises: ctx.loadPromises,
        autoDownloadSize: ctx.chat.autoDownload.photo
      });

      // spoiler overlay for photos
      if((media as MessageMedia.messageMediaPhoto).pFlags?.spoiler || sensitive) {
        ctx.loadPromises.push(ctx.bubbles.wrapMediaSpoiler({
          media: photo,
          promise: p,
          middleware: ctx.middleware,
          attachmentDiv: container,
          sensitive
        }));
      }

      // plain media tail for photos without text
      if((ctx.isMessageEmpty() || ctx.invertMedia()) && !bubble?.classList.contains('with-replies')) {
        classNamesArr.push('has-plain-media-tail');
      }
      break;
    }

    case 'messageMediaDocument': {
      if(!doc) break;

      // album for video/gif
      const grouped = ctx.groupedMessages();
      if(grouped && grouped.length > 1 && (doc.type === 'video' || doc.type === 'gif')) {
        classNamesArr.push('is-album', 'is-grouped', 'video');
        canHideName = true;
        wrapAlbum({
          messages: grouped,
          attachmentDiv: container,
          middleware: ctx.middleware,
          isOut,
          lazyLoadQueue: ctx.lazyLoadQueue,
          chat: ctx.chat,
          loadPromises: ctx.loadPromises,
          autoDownload: ctx.chat.autoDownload
        });
        break;
      }

      if(doc.sticker) {
        const sizes = mediaSizes.active;
        const isAnimated = doc.animated;
        const boxSize = isAnimated ? sizes.animatedSticker : sizes.staticSticker;
        setAttachmentSize({
          photo: doc,
          element: container,
          boxWidth: boxSize.width,
          boxHeight: boxSize.height
        });

        wrapSticker({
          doc,
          div: container,
          lazyLoadQueue: ctx.lazyLoadQueue,
          group: ctx.wrapOptions.animationGroup,
          play: true,
          loop: true,
          middleware: ctx.middleware,
          loadPromises: ctx.loadPromises,
          liteModeKey: 'stickers_chat',
          isOut
        });
      } else if(doc.type === 'video' || doc.type === 'gif' || doc.type === 'round') {
        classNamesArr.push(doc.type === 'round' ? 'round' : 'video');
        canHideName = true;

        const videoP = wrapVideo({
          doc,
          container,
          message,
          boxWidth: mediaSizes.active.regular.width,
          boxHeight: mediaSizes.active.regular.height,
          withTail: false,
          isOut,
          lazyLoadQueue: ctx.lazyLoadQueue,
          middleware: ctx.middleware,
          group: ctx.wrapOptions.animationGroup,
          loadPromises: ctx.loadPromises,
          autoDownload: ctx.chat.autoDownload,
          noInfo: message.mid <= 0
        });

        // video spoiler
        if((media as MessageMedia.messageMediaDocument).pFlags?.spoiler) {
          ctx.loadPromises.push(ctx.bubbles.wrapMediaSpoiler({
            media: doc,
            promise: videoP,
            middleware: ctx.middleware,
            attachmentDiv: container
          }));
        }
      } else {
        // document type CSS classes
        const addClassName = (!(['photo', 'pdf'] as MyDocument['type'][]).includes(doc.type) ? doc.type || 'document' : 'document') + '-message';
        classNamesArr.push(addClassName);
        if(addClassName !== 'document-message') classNamesArr.push('min-content');

        // background element for documents
        const bubbleContent = bubble?.querySelector('.bubble-content');
        if(bubbleContent) {
          const bubbleBackground = document.createElement('div');
          bubbleBackground.classList.add('bubble-content-background');
          bubbleContent.prepend(bubbleBackground);
        }

        // search context for audio/voice navigation
        const searchContext = (doc.type === 'voice' || doc.type === 'audio') ? {
          peerId: ctx.bubbles.peerId,
          inputFilter: {_: doc.type === 'voice' ? 'inputMessagesFilterRoundVoice' as const : 'inputMessagesFilterMusic' as const},
          threadId: ctx.chat.threadId,
          useSearch: !(message as Message.message).pFlags.is_scheduled,
          isScheduled: (message as Message.message).pFlags.is_scheduled
        } : undefined;

        wrapDocument({
          message,
          withTime: true,
          fontWeight: 400,
          voiceAsMusic: false,
          showSender: false,
          searchContext,
          loadPromises: ctx.loadPromises,
          lazyLoadQueue: ctx.lazyLoadQueue,
          middleware: ctx.middleware,
          sizeType: 'documentName',
          autoDownloadSize: ctx.chat.autoDownload.file,
          canTranscribeVoice: true
        }).then((docEl) => {
          if(docEl) container.append(docEl);
        });

        classNamesArr.push('is-single-document');
      }
      break;
    }

    case 'messageMediaGeo':
    case 'messageMediaVenue':
    case 'messageMediaGeoLive': {
      const bubble = container.closest('.bubble') as HTMLElement;
      const messageDiv = bubble?.querySelector('.message') as HTMLElement;
      const timeSpan = bubble?.querySelector('.time') as HTMLElement;
      wrapGeo({
        attachmentDiv: container,
        bubble: bubble || container,
        loadPromises: ctx.loadPromises,
        message,
        messageDiv: messageDiv || container,
        messageMedia: media as any,
        middleware: ctx.middleware,
        timeSpan: timeSpan || document.createElement('span'),
        updateLocationOnEdit: ctx.bubbles.updateLocalOnEdit,
        wrapOptions: ctx.wrapOptions
      });
      break;
    }

    case 'messageMediaStory': {
      const storyId = (media as MessageMedia.messageMediaStory).id;
      const storyPeerId = getPeerId((media as MessageMedia.messageMediaStory).peer);

      // check for expired story
      const replyContainer = ctx.bubbles.getStoryReplyIfExpired?.(storyPeerId, storyId, false, true);
      if(replyContainer instanceof Promise) {
        replyContainer.then((rc: HTMLElement) => {
          if(rc) {
            bubble?.classList.add('is-expired-story');
            container.replaceWith(rc);
          }
        });
      } else if(replyContainer) {
        classNamesArr.push('is-expired-story');
        container.replaceWith(replyContainer);
        break;
      }

      classNamesArr.push('photo', 'story');
      ctx.bubbles.setStoryContainerDimensions(container);
      ctx.bubbles.wrapStory({
        message,
        bubble: bubble || container,
        storyPeerId,
        storyId,
        container,
        middleware: ctx.middleware,
        loadPromises: ctx.loadPromises
      });
      break;
    }

    case 'messageMediaDice': {
      const legacyCtx = makeLegacyContext(container, ctx, message);
      wrapDice(legacyCtx);
      break;
    }

    case 'messageMediaGiveaway':
    case 'messageMediaGiveawayResults': {
      const dispose = render(
        () => Giveaway({
          giveaway: media as any,
          loadPromises: ctx.loadPromises
        }),
        container
      );
      ctx.middleware.onClean(dispose);

      const button = ctx.bubbles.makeViewButton({text: 'BoostingHowItWork'});
      container.after(button);
      attachClickEvent(button, () => {
        onGiveawayClick(message);
      });
      break;
    }

    case 'messageMediaWebPage': {
      const result = renderWebPage(message, media as MessageMedia.messageMediaWebPage, ctx);
      if(result) {
        // apply CSS classes to bubble
        if(result.bubbleClasses?.length) {
          classNamesArr.push(...result.bubbleClasses);
        }

        createRoot((dispose) => {
          ctx.middleware.onDestroy(dispose);
          WebPageBox({
            ...result.props,
            ref: (box: HTMLAnchorElement) => {
              result.boxRefs.forEach((ref) => ref(box));
              const messageDiv = container.closest('.bubble')?.querySelector('.message');
              if(messageDiv) messageDiv.append(box);
            },
            clickable: result.clickable
          });
        });
      }
      container.remove();
      break;
    }

    case 'messageMediaPaidMedia':
    case 'messageMediaInvoice': {
      renderInvoice(container, message, media as any, ctx);
      break;
    }

    default: {
      const span = document.createElement('span');
      span.classList.add('message');
      span.textContent = `[${media._}]`;
      container.append(span);
      break;
    }
  }

  ctx.setState({
    mediaClass: classNames(...classNamesArr),
    mediaCanHideName: canHideName
  });
}
