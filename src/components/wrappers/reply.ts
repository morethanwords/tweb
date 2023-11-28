/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import customProperties from '../../helpers/dom/customProperties';
import {setDirection} from '../../helpers/dom/setInnerHTML';
import noop from '../../helpers/noop';
import pause from '../../helpers/schedulers/pause';
import {MessageEntity, MessageReplyHeader, User} from '../../layer';
import appImManager from '../../lib/appManagers/appImManager';
import {getPeerColorsByPeer} from '../../lib/appManagers/utils/peers/getPeerColorById';
import apiManagerProxy from '../../lib/mtproto/mtprotoworker';
import {applyColorOnContext} from '../../lib/rlottie/rlottiePlayer';
import rootScope from '../../lib/rootScope';
import {WrapPinnedContainerOptions} from '../chat/pinnedContainer';
import ReplyContainer from '../chat/replyContainer';
import ripple from '../ripple';
import wrapSticker from './sticker';

export type WrapReplyOptions = WrapPinnedContainerOptions & {
  setColorPeerId?: PeerId,
  useHighlightingColor?: boolean,
  colorAsOut?: boolean,
  isStoryExpired?: boolean,
  isQuote?: boolean,
  noBorder?: boolean,
  replyHeader?: MessageReplyHeader,
  quote?: {text: string, entities?: MessageEntity[]}
} & WrapSomethingOptions;

export default function wrapReply(options: WrapReplyOptions) {
  const replyContainer = new ReplyContainer('reply');
  const fillPromise = replyContainer.fill(options);

  replyContainer.container.classList.add('quote-like', 'quote-like-hoverable', 'quote-like-border');
  setDirection(replyContainer.container);
  // replyContainer.border.classList.add('quote-like-border');
  replyContainer.border.remove();
  ripple(replyContainer.container, undefined, undefined, true);

  if(options.isQuote) {
    replyContainer.container.classList.add('quote-like-icon');
    replyContainer.container.classList.add('reply-multiline');
  }

  if(options.noBorder) {
    replyContainer.container.classList.remove('quote-like-border');
  }

  const {setColorPeerId} = options;
  if(setColorPeerId !== undefined) {
    appImManager.setPeerColorToElement(
      setColorPeerId,
      replyContainer.container,
      options.useHighlightingColor,
      options.colorAsOut
    );

    const peer = apiManagerProxy.getPeer(setColorPeerId);
    const docId = (peer as User.user)?.color?.background_emoji_id;
    if(docId) {
      rootScope.managers.appEmojiManager.getCustomEmojiDocument(docId).then((doc) => {
        const CANVAS_WIDTH = 117;
        const CANVAS_HEIGHT = 54;
        const positions: [x: number, y: number, size: number, alpha: number][] = [
          [104.5, 34.5, 12, .35],
          [9.3, 33.3, 10.4, .2],
          [51.3, 0.3, 10.4, .2],
          [0.6, 7.6, 12.8, .1],
          [28.9, 12.9, 15.2, .2],
          [65.5, 18.5, 12, .25],
          [48.9, 37.9, 15.2, .25],
          [91.9, 7.9, 15.2, .3]
        ];
        const d = document.createElement('div');
        wrapSticker({
          doc,
          div: d,
          middleware: options.middleware,
          width: 16,
          height: 16,
          // onlyThumb: true,
          static: true,
          withThumb: false
        }).then(({render}) => {
          return render;
        }).then((result) => {
          const image = (result as HTMLImageElement[])[0];
          if(!image.naturalWidth) {
            return pause(100).then(() => image);
          }
          return image;
        }).then((image) => {
          const canvas = document.createElement('canvas');
          canvas.classList.add('reply-background-canvas');
          canvas.style.width = `${CANVAS_WIDTH}px`;
          canvas.style.height = `${CANVAS_HEIGHT}px`;
          const ctx = canvas.getContext('2d');
          const dpr = canvas.dpr = window.devicePixelRatio;
          canvas.width = CANVAS_WIDTH * dpr;
          canvas.height = CANVAS_HEIGHT * dpr;
          positions.forEach(([x, y, size, alpha]) => {
            ctx.globalAlpha = alpha;
            ctx.drawImage(image, x * dpr, y * dpr, size * dpr, size * dpr);
          });
          ctx.globalAlpha = 1;

          let color: string;
          if(options.useHighlightingColor) {
            color = '#ffffff';
          } else if(options.colorAsOut) {
            color = customProperties.getProperty('message-out-primary-color');
          } else {
            color = getPeerColorsByPeer(peer)[0];
          }

          applyColorOnContext(ctx, color, 0, 0, canvas.width, canvas.height);
          replyContainer.container.prepend(canvas);
        }).catch(noop);
      });
    }
  }

  return {container: replyContainer.container, fillPromise};
}
