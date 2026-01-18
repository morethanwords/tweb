/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {rgbIntToHex} from '@helpers/color';
import {setDirection} from '@helpers/dom/setInnerHTML';
import themeController from '@helpers/themeController';
import {MessageEntity, MessageReplyHeader, Peer, PeerColor, User} from '@layer';
import {getPeerColorsByPeer} from '@appManagers/utils/peers/getPeerColorById';
import apiManagerProxy from '@lib/apiManagerProxy';
import rootScope from '@lib/rootScope';
import {WrapPinnedContainerOptions} from '@components/chat/pinnedContainer';
import ReplyContainer from '@components/chat/replyContainer';
import {setPeerColorToElement} from '@components/peerColors';
import ripple from '@components/ripple';
import wrapEmojiPattern from '@components/wrappers/emojiPattern';
import wrapSticker from '@components/wrappers/sticker';

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

    const peer = apiManagerProxy.getPeer(setColorPeerId);
    const color = (peer as User.user)?.color as PeerColor.peerColor | PeerColor.peerColorCollectible;
    const docId = color?.background_emoji_id;
    if(docId) {
      let emojiColor: string;
      if(color?._ === 'peerColorCollectible') {
        let val = color.accent_color;
        if(themeController.isNight() && color.dark_accent_color) val = color.dark_accent_color;
        emojiColor = rgbIntToHex(val);
      } else {
        emojiColor = getPeerColorsByPeer(peer)[0];
      }

      wrapEmojiPattern({
        docId,
        container: replyContainer.container,
        middleware: options.middleware,
        color: emojiColor,
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

    if(color?._ === 'peerColorCollectible') {
      const div = document.createElement('div');
      div.classList.add('reply-collectible');
      replyContainer.container.classList.add('has-collectible');
      replyContainer.container.appendChild(div);

      rootScope.managers.appEmojiManager.getCustomEmojiDocument(color.gift_emoji_id).then((doc) => {
        if(options.middleware && !options.middleware()) return;
        if(!doc) return;

        return wrapSticker({
          doc,
          div,
          middleware: options.middleware,
          width: 24,
          height: 24
        });
      });
    }
  }

  if(!options.subtitle && !options.message) {
    replyContainer.container.classList.add('reply-no-subtitle');
    replyContainer.subtitle.remove();
  }

  return {container: replyContainer.container, fillPromise};
}
