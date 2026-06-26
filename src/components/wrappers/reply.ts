import {setDirection} from '@helpers/dom/setInnerHTML';
import {Message, MessageEntity, MessageReplyHeader, StoryItem} from '@layer';
import ReplyContainer from '@components/chat/replyContainer';
import {setPeerColorToElement} from '@components/peerColors';
import ripple from '@components/ripple';
import wrapPeerColorPattern from '@components/wrappers/peerColorPattern';

export type WrapPinnedContainerOptions = {
  title: string | HTMLElement | DocumentFragment,
  subtitle?: WrapPinnedContainerOptions['title'],
  message?: Message.message | Message.messageService,
  storyItem?: StoryItem.storyItem,
  isChatSensitive?: boolean,
  savedMusicDocId?: DocId
};

export type WrapReplyOptions = WrapPinnedContainerOptions & {
  setColorPeerId?: PeerId,
  useHighlightingColor?: boolean,
  colorAsOut?: boolean,
  isStoryExpired?: boolean,
  isQuote?: boolean,
  noBorder?: boolean,
  replyHeader?: MessageReplyHeader,
  quote?: {text: string, entities?: MessageEntity[]},
  canTranslate?: boolean
} & WrapSomethingOptions;

export default function wrapReply(options: WrapReplyOptions) {
  const replyContainer = new ReplyContainer('reply');
  const fillPromise = replyContainer.fill(options);

  replyContainer.container.classList.add('quote-like', 'quote-like-hoverable', 'quote-like-border');
  setDirection(replyContainer.container);
  // replyContainer.border.classList.add('quote-like-border');
  replyContainer.border.remove();
  ripple(replyContainer.container);

  if(options.isQuote) {
    replyContainer.container.classList.add('quote-like-icon');
    replyContainer.container.classList.add('reply-multiline');
  }

  if(options.noBorder) {
    replyContainer.container.classList.remove('quote-like-border');
  }

  const {setColorPeerId} = options;
  if(setColorPeerId !== undefined) {
    setPeerColorToElement({
      peerId: setColorPeerId,
      element: replyContainer.container,
      messageHighlighting: options.useHighlightingColor,
      colorAsOut: options.colorAsOut
    });

    wrapPeerColorPattern({
      peerId: setColorPeerId,
      container: replyContainer.container,
      middleware: options.middleware,
      colorAsOut: options.colorAsOut,
      useHighlightingColor: options.useHighlightingColor,
      canvasClassName: 'reply-background-canvas',
      withCollectible: true
    });
  }

  if(!options.subtitle && !options.message) {
    replyContainer.container.classList.add('reply-no-subtitle');
    replyContainer.subtitle.remove();
  }

  return {container: replyContainer.container, fillPromise};
}
