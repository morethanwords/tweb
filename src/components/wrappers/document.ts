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
import noop from "../../helpers/noop";
import { Message, MessageMedia, WebPage } from "../../layer";
import { MyDocument } from "../../lib/appManagers/appDocsManager";
import appDownloadManager from "../../lib/appManagers/appDownloadManager";
import appImManager from "../../lib/appManagers/appImManager";
import { AppManagers } from "../../lib/appManagers/managers";
import getDownloadMediaDetails from "../../lib/appManagers/utils/download/getDownloadMediaDetails";
import choosePhotoSize from "../../lib/appManagers/utils/photos/choosePhotoSize";
import { joinElementsWith } from "../../lib/langPack";
import wrapPlainText from "../../lib/richTextProcessor/wrapPlainText";
import rootScope from "../../lib/rootScope";
import type { ThumbCache } from "../../lib/storages/thumbs";
import { MediaSearchContext } from "../appMediaPlaybackController";
import AudioElement from "../audio";
import LazyLoadQueue from "../lazyLoadQueue";
import { MiddleEllipsisElement } from "../middleEllipsis";
import ProgressivePreloader from "../preloader";
import wrapPhoto from './photo';
import wrapSenderToPeer from "./senderToPeer";
import wrapSentTime from "./sentTime";

rootScope.addEventListener('document_downloading', (docId) => {
  const elements = Array.from(document.querySelectorAll(`.document[data-doc-id="${docId}"]`)) as HTMLElement[];
  elements.forEach((element) => {
    if(element.querySelector('.preloader-container.manual')) {
      simulateClickEvent(element);
    }
  });
});

export default async function wrapDocument({message, withTime, fontWeight, voiceAsMusic, showSender, searchContext, loadPromises, autoDownloadSize, lazyLoadQueue, sizeType, managers = rootScope.managers, cacheContext}: {
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
  managers?: AppManagers,
  cacheContext?: ThumbCache
}): Promise<HTMLElement> {
  if(!fontWeight) fontWeight = 500;
  if(!sizeType) sizeType = '' as any;
  const noAutoDownload = autoDownloadSize === 0;

  const doc = ((message.media as MessageMedia.messageMediaDocument).document || ((message.media as MessageMedia.messageMediaWebPage).webpage as WebPage.webPage).document) as MyDocument;
  const uploadFileName = message?.uploadingFileName;
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

    audioElement.dataset.fontWeight = '' + fontWeight;
    audioElement.dataset.sizeType = sizeType;
    await audioElement.render();
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

  // return docDiv;

  const icoDiv = document.createElement('div');
  icoDiv.classList.add('document-ico');

  const hadContext = !!cacheContext;
  const getCacheContext = () => {
    return hadContext ? cacheContext : managers.thumbsStorage.getCacheContext(doc);
  };

  cacheContext = await getCacheContext();
  if((doc.thumbs?.length || (message.pFlags.is_outgoing && cacheContext.url && doc.type === 'photo'))/*  && doc.mime_type !== 'image/gif' */) {
    docDiv.classList.add('document-with-thumb');

    let imgs: (HTMLImageElement | HTMLCanvasElement)[] = [];
    // ! WARNING, use thumbs for check when thumb will be generated for media
    if(message.pFlags.is_outgoing && ['photo', 'video'].includes(doc.type)) {
      icoDiv.innerHTML = `<img src="${cacheContext.url}">`;
      imgs.push(icoDiv.firstElementChild as HTMLImageElement);
    } else {
      const perf = performance.now();
      const wrapped = await wrapPhoto({
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
      // console.log('was wrapping photo', performance.now() - perf);
      icoDiv.style.width = icoDiv.style.height = '';
      if(wrapped.images.thumb) imgs.push(wrapped.images.thumb);
      if(wrapped.images.full) imgs.push(wrapped.images.full);
    }

    imgs.forEach((img) => img.classList.add('document-thumb'));
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
    descriptionParts.push(await wrapSenderToPeer(message));
  }

  docDiv.innerHTML = `
  ${(cacheContext.downloaded && !uploadFileName) || !message.mid ? '' : `<div class="document-download"></div>`}
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

  if(!uploadFileName && message.pFlags.is_outgoing && !message.mid) {
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

  const load = async(e?: Event) => {
    const save = !e || e.isTrusted;
    const doc = await managers.appDocsManager.getDoc(docDiv.dataset.docId);
    let download: Promise<any>;
    const queueId = appImManager.chat.bubbles ? appImManager.chat.bubbles.lazyLoadQueue.queueId : undefined;
    if(!save) {
      download = appDownloadManager.downloadMediaVoid({media: doc, queueId});
    } else if(doc.type === 'pdf') {
      const canOpenAfter = /* managers.appDocsManager.downloading.has(doc.id) ||  */!preloader || preloader.detached;
      download = appDownloadManager.downloadMediaURL({media: doc, queueId});
      if(canOpenAfter) {
        download.then(() => {
          setTimeout(async() => { // wait for preloader animation end
            const url = (await getCacheContext()).url;
            window.open(url);
          }, rootScope.settings.animationsEnabled ? 250 : 0);
        });
      }
    } else if(MEDIA_MIME_TYPES_SUPPORTED.has(doc.mime_type) && doc.thumbs?.length) {
      download = appDownloadManager.downloadMediaURL({media: doc, queueId});
    } else {
      download = appDownloadManager.downloadToDisc({media: doc, queueId});
    }

    if(downloadDiv) {
      download.then(onLoad, noop);
      preloader.attach(downloadDiv, true, download);
    }
  };

  const {fileName: downloadFileName} = getDownloadMediaDetails({media: doc});
  if(await managers.apiFileManager.isDownloading(downloadFileName)) {
    downloadDiv = docDiv.querySelector('.document-download');
    const promise = appDownloadManager.downloadMediaVoid({media: doc});

    preloader = new ProgressivePreloader();
    preloader.attach(downloadDiv, false, promise);
    preloader.setDownloadFunction(load);
  } else if(!cacheContext.downloaded || uploadFileName) {
    downloadDiv = docDiv.querySelector('.document-download');
    preloader = new ProgressivePreloader({
      isUpload: !!uploadFileName
    });

    if(!uploadFileName) {
      preloader.construct();
      preloader.setManual();
      preloader.attach(downloadDiv);
      preloader.setDownloadFunction(load);

      if(autoDownloadSize !== undefined && autoDownloadSize >= doc.size) {
        simulateClickEvent(preloader.preloader);
      }
    } else {
      const uploadPromise = appDownloadManager.getUpload(uploadFileName);
      preloader.attachPromise(uploadPromise);
      preloader.attach(downloadDiv);
      uploadPromise.then(onLoad, noop);
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
