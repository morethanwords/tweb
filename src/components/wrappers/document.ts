/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import MEDIA_MIME_TYPES_SUPPORTED from "../../environment/mediaMimeTypesSupport";
import { clearBadCharsAndTrim } from "../../helpers/cleanSearchText";
import { formatFullSentTime } from "../../helpers/date";
import { simulateClickEvent, attachClickEvent } from "../../helpers/dom/clickEvent";
import formatBytes from "../../helpers/formatBytes";
import { MediaSizeType } from "../../helpers/mediaSizes";
import { Message, MessageMedia, WebPage } from "../../layer";
import { MyDocument } from "../../lib/appManagers/appDocsManager";
import appDownloadManager, { DownloadBlob } from "../../lib/appManagers/appDownloadManager";
import appImManager from "../../lib/appManagers/appImManager";
import { AppManagers } from "../../lib/appManagers/managers";
import choosePhotoSize from "../../lib/appManagers/utils/photos/choosePhotoSize";
import { joinElementsWith } from "../../lib/langPack";
import wrapPlainText from "../../lib/richTextProcessor/wrapPlainText";
import rootScope from "../../lib/rootScope";
import { MediaSearchContext } from "../appMediaPlaybackController";
import AudioElement from "../audio";
import LazyLoadQueue from "../lazyLoadQueue";
import { MiddleEllipsisElement } from "../middleEllipsis";
import ProgressivePreloader from "../preloader";
import wrapPhoto from './photo';
import wrapSenderToPeer from "./senderToPeer";
import wrapSentTime from "./sentTime";

rootScope.addEventListener('download_start', (docId) => {
  const elements = Array.from(document.querySelectorAll(`.document[data-doc-id="${docId}"]`)) as HTMLElement[];
  elements.forEach(element => {
    if(element.querySelector('.preloader-container.manual')) {
      simulateClickEvent(element);
    }
  });
});

export default function wrapDocument({message, withTime, fontWeight, voiceAsMusic, showSender, searchContext, loadPromises, autoDownloadSize, lazyLoadQueue, sizeType, managers = rootScope.managers}: {
  message: Message.message, 
  withTime?: boolean,
  fontWeight?: number,
  voiceAsMusic?: boolean,
  showSender?: boolean,
  searchContext?: MediaSearchContext,
  loadPromises?: Promise<any>[],
  autoDownloadSize?: number,
  lazyLoadQueue?: LazyLoadQueue,
  sizeType?: MediaSizeType,
  managers?: AppManagers
}): HTMLElement {
  if(!fontWeight) fontWeight = 500;
  if(!sizeType) sizeType = '' as any;
  const noAutoDownload = autoDownloadSize === 0;

  const doc = ((message.media as MessageMedia.messageMediaDocument).document || ((message.media as MessageMedia.messageMediaWebPage).webpage as WebPage.webPage).document) as MyDocument;
  const uploading = message.pFlags.is_outgoing && (message.media as any)?.preloader;
  if(doc.type === 'audio' || doc.type === 'voice' || doc.type === 'round') {
    const audioElement = new AudioElement();
    audioElement.withTime = withTime;
    audioElement.message = message;
    audioElement.noAutoDownload = noAutoDownload;
    audioElement.lazyLoadQueue = lazyLoadQueue;
    audioElement.loadPromises = loadPromises;
    
    if(voiceAsMusic) audioElement.voiceAsMusic = voiceAsMusic;
    if(searchContext) audioElement.searchContext = searchContext;
    if(showSender) audioElement.showSender = showSender;
    if(uploading) audioElement.preloader = (message.media as any).preloader;

    audioElement.dataset.fontWeight = '' + fontWeight;
    audioElement.dataset.sizeType = sizeType;
    audioElement.render();
    return audioElement;
  }

  let extSplitted = doc.file_name ? doc.file_name.split('.') : '';
  let ext = '';
  ext = extSplitted.length > 1 && Array.isArray(extSplitted) ? 
    clearBadCharsAndTrim(extSplitted.pop().split(' ', 1)[0].toLowerCase()) : 
    'file';

  let docDiv = document.createElement('div');
  docDiv.classList.add('document', `ext-${ext}`);
  docDiv.dataset.docId = '' + doc.id;

  const icoDiv = document.createElement('div');
  icoDiv.classList.add('document-ico');

  const cacheContext = appDownloadManager.getCacheContext(doc);
  if((doc.thumbs?.length || (message.pFlags.is_outgoing && cacheContext.url && doc.type === 'photo'))/*  && doc.mime_type !== 'image/gif' */) {
    docDiv.classList.add('document-with-thumb');

    let imgs: (HTMLImageElement | HTMLCanvasElement)[] = [];
    // ! WARNING, use thumbs for check when thumb will be generated for media
    if(message.pFlags.is_outgoing && ['photo', 'video'].includes(doc.type)) {
      icoDiv.innerHTML = `<img src="${cacheContext.url}">`;
      imgs.push(icoDiv.firstElementChild as HTMLImageElement);
    } else {
      const wrapped = wrapPhoto({
        photo: doc, 
        message: null, 
        container: icoDiv, 
        boxWidth: 54, 
        boxHeight: 54,
        loadPromises,
        withoutPreloader: true,
        lazyLoadQueue,
        size: choosePhotoSize(doc, 54, 54, true),
        managers
      });
      icoDiv.style.width = icoDiv.style.height = '';
      if(wrapped.images.thumb) imgs.push(wrapped.images.thumb);
      if(wrapped.images.full) imgs.push(wrapped.images.full);
    }

    imgs.forEach(img => img.classList.add('document-thumb'));
  } else {
    icoDiv.innerText = ext;
  }

  //let fileName = stringMiddleOverflow(doc.file_name || 'Unknown.file', 26);
  let fileName = doc.file_name ? wrapPlainText(doc.file_name) : 'Unknown.file';
  const descriptionEl = document.createElement('div');
  descriptionEl.classList.add('document-description');
  const descriptionParts: (HTMLElement | string | DocumentFragment)[] = [formatBytes(doc.size)];
  
  if(withTime) {
    descriptionParts.push(formatFullSentTime(message.date));
  }

  if(showSender) {
    descriptionParts.push(wrapSenderToPeer(message));
  }

  docDiv.innerHTML = `
  ${(cacheContext.downloaded && !uploading) || !message.mid ? '' : `<div class="document-download"></div>`}
  <div class="document-name"></div>
  <div class="document-size"></div>
  `;

  const nameDiv = docDiv.querySelector('.document-name') as HTMLElement;
  const middleEllipsisEl = new MiddleEllipsisElement();
  middleEllipsisEl.dataset.fontWeight = '' + fontWeight;
  middleEllipsisEl.dataset.sizeType = sizeType;
  middleEllipsisEl.textContent = fileName;
  // setInnerHTML(middleEllipsisEl, fileName);

  nameDiv.append(middleEllipsisEl);

  if(showSender) {
    nameDiv.append(wrapSentTime(message));
  }

  const sizeDiv = docDiv.querySelector('.document-size') as HTMLElement;
  sizeDiv.append(...joinElementsWith(descriptionParts, ' · '));

  docDiv.prepend(icoDiv);

  if(!uploading && message.pFlags.is_outgoing && !message.mid) {
    return docDiv;
  }

  let downloadDiv: HTMLElement, preloader: ProgressivePreloader = null;
  const onLoad = () => {
    if(downloadDiv) {
      downloadDiv.classList.add('downloaded');
      const _downloadDiv = downloadDiv;
      setTimeout(() => {
        _downloadDiv.remove();
      }, 200);
      downloadDiv = null;
    }

    if(preloader) {
      preloader = null;
    }
  };

  const load = (e?: Event) => {
    const save = !e || e.isTrusted;
    const doc = managers.appDocsManager.getDoc(docDiv.dataset.docId);
    let download: DownloadBlob;
    const queueId = appImManager.chat.bubbles ? appImManager.chat.bubbles.lazyLoadQueue.queueId : undefined;
    if(!save) {
      download = managers.appDocsManager.downloadDoc(doc, queueId);
    } else if(doc.type === 'pdf') {
      const canOpenAfter = managers.appDocsManager.downloading.has(doc.id) || cacheContext.downloaded;
      download = managers.appDocsManager.downloadDoc(doc, queueId);
      if(canOpenAfter) {
        download.then(() => {
          setTimeout(() => { // wait for preloader animation end
            const url = appDownloadManager.getCacheContext(doc).url;
            window.open(url);
          }, rootScope.settings.animationsEnabled ? 250 : 0);
        });
      }
    } else if(MEDIA_MIME_TYPES_SUPPORTED.has(doc.mime_type) && doc.thumbs?.length) {
      download = managers.appDocsManager.downloadDoc(doc, queueId);
    } else {
      download = managers.appDocsManager.saveDocFile(doc, queueId);
    }

    if(downloadDiv) {
      download.then(onLoad);
      preloader.attach(downloadDiv, true, download);
    }

    return {download};
  };

  if(managers.appDocsManager.downloading.has(doc.id)) {
    downloadDiv = docDiv.querySelector('.document-download');
    preloader = new ProgressivePreloader();
    preloader.attach(downloadDiv, false, managers.appDocsManager.downloading.get(doc.id));
  } else if(!cacheContext.downloaded || uploading) {
    downloadDiv = docDiv.querySelector('.document-download');
    preloader = (message.media as any).preloader as ProgressivePreloader;

    if(!preloader) {
      preloader = new ProgressivePreloader();

      preloader.construct();
      preloader.setManual();
      preloader.attach(downloadDiv);
      preloader.setDownloadFunction(load);

      if(autoDownloadSize !== undefined && autoDownloadSize >= doc.size) {
        simulateClickEvent(preloader.preloader);
      }
    } else {
      preloader.attach(downloadDiv);
      (message.media as any).promise.then(onLoad);
    }
  }

  attachClickEvent(docDiv, (e) => {
    if(preloader) {
      preloader.onClick(e);
    } else {
      load(e);
    }
  });

  return docDiv;
}
