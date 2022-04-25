/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import setInnerHTML from "../../helpers/dom/setInnerHTML";
import { MediaSizeType } from "../../helpers/mediaSizes";
import { AppManagers } from "../../lib/appManagers/managers";
import wrapRichText from "../../lib/richTextProcessor/wrapRichText";
import { MediaSearchContext } from "../appMediaPlaybackController";
import Chat from "../chat/chat";
import LazyLoadQueue from "../lazyLoadQueue";
import wrapDocument from "./document";

export default function wrapGroupedDocuments({albumMustBeRenderedFull, message, bubble, messageDiv, chat, loadPromises, autoDownloadSize, lazyLoadQueue, searchContext, useSearch, sizeType, managers}: {
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
  managers?: AppManagers
}) {
  let nameContainer: HTMLElement;
  const mids = albumMustBeRenderedFull ? chat.getMidsByMid(message.mid) : [message.mid];
  /* if(isPending) {
    mids.reverse();
  } */

  mids.forEach((mid, idx) => {
    const message = chat.getMessage(mid);
    const div = wrapDocument({
      message,
      loadPromises,
      autoDownloadSize,
      lazyLoadQueue,
      searchContext,
      sizeType,
      managers
    });

    const container = document.createElement('div');
    container.classList.add('document-container');
    container.dataset.mid = '' + mid;
    container.dataset.peerId = '' + message.peerId;

    const wrapper = document.createElement('div');
    wrapper.classList.add('document-wrapper');
    
    if(message.message) {
      const messageDiv = document.createElement('div');
      messageDiv.classList.add('document-message');

      const richText = wrapRichText(message.message, {
        entities: message.totalEntities
      });

      setInnerHTML(messageDiv, richText);
      wrapper.append(messageDiv);
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

    wrapper.append(div);
    container.append(wrapper);
    messageDiv.append(container);
  });

  if(mids.length > 1) {
    bubble.classList.add('is-multiple-documents', 'is-grouped');
  }

  return nameContainer;
}
