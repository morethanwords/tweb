/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {setDirection} from '../../helpers/dom/setInnerHTML';
import {MessageEntity, MessageReplyHeader, User} from '../../layer';
import appImManager from '../../lib/appManagers/appImManager';
import {getPeerColorsByPeer} from '../../lib/appManagers/utils/peers/getPeerColorById';
import apiManagerProxy from '../../lib/mtproto/mtprotoworker';
import {WrapPinnedContainerOptions} from '../chat/pinnedContainer';
import ReplyContainer from '../chat/replyContainer';
import ripple from '../ripple';
import wrapEmojiPattern from './emojiPattern';

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
    appImManager.setPeerColorToElement({
      peerId: setColorPeerId,
      element: replyContainer.container,
      messageHighlighting: options.useHighlightingColor,
      colorAsOut: options.colorAsOut
    });

    const peer = apiManagerProxy.getPeer(setColorPeerId);
    const docId = (peer as User.user)?.color?.background_emoji_id;
    if(docId) {
      wrapEmojiPattern({
        docId,
        container: replyContainer.container,
        middleware: options.middleware,
        color: getPeerColorsByPeer(peer)[0],
        colorAsOut: options.colorAsOut,
        useHighlightingColor: options.useHighlightingColor,
        positions: [
          [104.5, 34.5, 12, .35],
          [9.3, 33.3, 10.4, .2],
          [51.3, 0.3, 10.4, .2],
          [0.6, 7.6, 12.8, .1],
          [28.9, 12.9, 15.2, .2],
          [65.5, 18.5, 12, .25],
          [48.9, 37.9, 15.2, .25],
          [91.9, 7.9, 15.2, .3]
        ],
        canvasWidth: 117,
        canvasHeight: 54,
        emojiSize: 16
      }).then((canvas) => {
        if(options.middleware && !options.middleware()) return;
        canvas.classList.add('reply-background-canvas');
      });
    }
  }

  return {container: replyContainer.container, fillPromise};
}
