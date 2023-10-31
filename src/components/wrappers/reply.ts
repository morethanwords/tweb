/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {hexToRgb} from '../../helpers/color';
import {Message} from '../../layer';
import getPeerColorById from '../../lib/appManagers/utils/peers/getPeerColorById';
import {WrapPinnedContainerOptions} from '../chat/pinnedContainer';
import ReplyContainer from '../chat/replyContainer';
import ripple from '../ripple';

export type WrapReplyOptions = WrapPinnedContainerOptions & {
  setColorPeerId?: PeerId,
  isStoryExpired?: boolean,
  isQuote?: boolean,
  noBorder?: boolean
} & WrapSomethingOptions;

export default function wrapReply(options: WrapReplyOptions) {
  const replyContainer = new ReplyContainer('reply');
  const fillPromise = replyContainer.fill(options);

  replyContainer.container.classList.add('quote-like', 'quote-like-hoverable', 'quote-like-border');
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
  if(setColorPeerId) {
    const hex = getPeerColorById(setColorPeerId, false);
    const [r, g, b] = hexToRgb(hex);
    replyContainer.container.style.setProperty('--override-color', `${r}, ${g}, ${b}`);
    replyContainer.container.classList.add('is-overriding-color');
    // replyContainer.border.style.backgroundColor = hex;
    // replyContainer.title.style.color = hex;
  }

  return {container: replyContainer.container, fillPromise};
}
