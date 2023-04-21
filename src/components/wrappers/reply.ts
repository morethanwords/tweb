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

export type WrapReplyOptions = WrapPinnedContainerOptions & {
  setColorPeerId?: PeerId
} & WrapSomethingOptions;

export default function wrapReply(options: WrapReplyOptions) {
  const replyContainer = new ReplyContainer('reply');
  const fillPromise = replyContainer.fill(options);

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
