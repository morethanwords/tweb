/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import setInnerHTML from '../../helpers/dom/setInnerHTML';
import {MediaSizeType} from '../../helpers/mediaSizes';
import {Message} from '../../layer';
import {AppManagers} from '../../lib/appManagers/managers';
import getMediaDurationFromMessage from '../../lib/appManagers/utils/messages/getMediaDurationFromMessage';
import wrapRichText from '../../lib/richTextProcessor/wrapRichText';
import {MediaSearchContext} from '../appMediaPlaybackController';
import Chat from '../chat/chat';
import LazyLoadQueue from '../lazyLoadQueue';
import TranslatableMessage from '../translatableMessage';
import wrapDocument from './document';

export default async function wrapGroupedDocuments({
  albumMustBeRenderedFull,
  message,
  bubble,
  messageDiv,
  chat,
  loadPromises,
  autoDownloadSize,
  lazyLoadQueue,
  searchContext,
  useSearch,
  sizeType,
  managers,
  fontWeight,
  fontSize,
  richTextFragment,
  richTextOptions,
  canTranscribeVoice,
  translatableParams,
  factCheckBox,
  isOut
}: {
  albumMustBeRenderedFull: boolean,
  message: any,
  messageDiv: HTMLElement,
  bubble: HTMLElement,
  uploading?: boolean,
  chat: Chat,
  loadPromises?: Promise<any>[],
  autoDownloadSize?: number,
  lazyLoadQueue?: LazyLoadQueue,
  searchContext?: MediaSearchContext,
  useSearch?: boolean,
  sizeType?: MediaSizeType,
  managers?: AppManagers,
  fontWeight?: number,
  fontSize?: number,
  richTextFragment?: DocumentFragment | HTMLElement,
  richTextOptions?: Parameters<typeof wrapRichText>[1]
  canTranscribeVoice?: boolean,
  translatableParams: Parameters<typeof TranslatableMessage>[0],
  factCheckBox?: HTMLElement,
  isOut?: boolean
}) {
  let nameContainer: HTMLElement;
  const {peerId} = message;
  const mids = albumMustBeRenderedFull ? await chat.getMidsByMid(message.peerId, message.mid) : [message.mid];
  /* if(isPending) {
    mids.reverse();
  } */

  const promises = mids.map(async(mid, idx, arr) => {
    const message = chat.getMessageByPeer(peerId, mid) as Message.message;
    const div = await wrapDocument({
      message,
      loadPromises,
      autoDownloadSize,
      lazyLoadQueue,
      searchContext,
      sizeType,
      managers,
      fontWeight,
      fontSize,
      canTranscribeVoice,
      isOut
    });

    const container = document.createElement('div');
    container.classList.add('document-container');
    container.dataset.mid = '' + mid;
    container.dataset.peerId = '' + message.peerId;

    const wrapper = document.createElement('div');
    wrapper.classList.add('document-wrapper');

    const isFirst = idx === 0;
    const isLast = idx === (arr.length - 1);

    if(isFirst) container.classList.add('is-first');
    if(isLast) container.classList.add('is-last');
    // if(!(isFirst && isLast)) container.classList.add('has-sibling');

    let messageDiv: HTMLElement;
    if(message.message || (isLast && factCheckBox)) {
      messageDiv = document.createElement('div');
      messageDiv.classList.add('document-message');
    }

    if(message.message) {
      let fragment = richTextFragment;
      if(!fragment) {
        if(translatableParams) {
          fragment = TranslatableMessage({
            ...translatableParams,
            message,
            richTextOptions: {
              ...translatableParams.richTextOptions,
              maxMediaTimestamp: getMediaDurationFromMessage(message)
            }
          });
        } else {
          fragment = wrapRichText(message.message, {
            ...richTextOptions,
            entities: message.totalEntities,
            maxMediaTimestamp: getMediaDurationFromMessage(message)
          });
        }
      }

      setInnerHTML(messageDiv, fragment);
    }

    if(factCheckBox && messageDiv && isLast) {
      messageDiv.append(factCheckBox);
    }

    if(mids.length > 1) {
      const selection = document.createElement('div');
      selection.classList.add('document-selection');
      container.append(selection);

      container.classList.add('grouped-item');

      if(idx === 0) {
        nameContainer = wrapper;
      }
    }

    wrapper.append(...[div, messageDiv].filter(Boolean));
    container.append(wrapper);
    return container;
  });

  const containers = await Promise.all(promises);
  messageDiv.append(...containers);

  if(mids.length > 1) {
    bubble.classList.add('is-multiple-documents', 'is-grouped');
  }

  return nameContainer;
}
