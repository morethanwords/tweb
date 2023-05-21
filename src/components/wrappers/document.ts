/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import MEDIA_MIME_TYPES_SUPPORTED from '../../environment/mediaMimeTypesSupport';
import {CancellablePromise} from '../../helpers/cancellablePromise';
import {clearBadCharsAndTrim} from '../../helpers/cleanSearchText';
import {formatFullSentTime} from '../../helpers/date';
import {simulateClickEvent, attachClickEvent} from '../../helpers/dom/clickEvent';
import findUpClassName from '../../helpers/dom/findUpClassName';
import formatBytes from '../../helpers/formatBytes';
import liteMode from '../../helpers/liteMode';
import {MediaSizeType} from '../../helpers/mediaSizes';
import noop from '../../helpers/noop';
import {Message, MessageMedia, WebPage} from '../../layer';
import {MyDocument} from '../../lib/appManagers/appDocsManager';
import appDownloadManager, {Progress} from '../../lib/appManagers/appDownloadManager';
import appImManager from '../../lib/appManagers/appImManager';
import {AppManagers} from '../../lib/appManagers/managers';
import getDownloadMediaDetails from '../../lib/appManagers/utils/download/getDownloadMediaDetails';
import choosePhotoSize from '../../lib/appManagers/utils/photos/choosePhotoSize';
import {joinElementsWith} from '../../lib/langPack';
import {MAX_FILE_SAVE_SIZE} from '../../lib/mtproto/mtproto_config';
import wrapPlainText from '../../lib/richTextProcessor/wrapPlainText';
import rootScope from '../../lib/rootScope';
import type {ThumbCache} from '../../lib/storages/thumbs';
import {MediaSearchContext} from '../appMediaPlaybackController';
import AudioElement from '../audio';
import LazyLoadQueue from '../lazyLoadQueue';
import {MiddleEllipsisElement} from '../middleEllipsis';
import ProgressivePreloader from '../preloader';
import wrapPhoto from './photo';
import wrapSenderToPeer from './senderToPeer';
import wrapSentTime from './sentTime';

rootScope.addEventListener('document_downloading', (docId) => {
  const elements = Array.from(document.querySelectorAll(`.document[data-doc-id="${docId}"]`)) as HTMLElement[];
  elements.forEach((element) => {
    if(element.querySelector('.preloader-container.manual')) {
      simulateClickEvent(element);
    }
  });
});

export default async function wrapDocument({message, withTime, fontWeight, voiceAsMusic, showSender, searchContext, loadPromises, autoDownloadSize, lazyLoadQueue, sizeType, managers = rootScope.managers, cacheContext, fontSize, getSize, canTranscribeVoice}: {
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
  cacheContext?: ThumbCache,
  fontSize?: number,
  getSize?: () => number,
  canTranscribeVoice?: boolean
}): Promise<HTMLElement> {
  fontWeight ??= 500;
  sizeType ??= '' as any;
  fontSize ??= 16;
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
    if(canTranscribeVoice && doc.type === 'voice') audioElement.transcriptionState = 0;
    (audioElement as any).getSize = getSize;

    if(voiceAsMusic) audioElement.voiceAsMusic = voiceAsMusic;
    if(searchContext) audioElement.searchContext = searchContext;
    if(showSender) audioElement.showSender = showSender;

    audioElement.dataset.fontWeight = '' + fontWeight;
    audioElement.dataset.fontSize = '' + fontSize;
    audioElement.dataset.sizeType = sizeType;
    await audioElement.render();
    return audioElement;
  }

  const extSplitted = doc.file_name ? doc.file_name.split('.') : '';
  let ext = '';
  ext = extSplitted.length > 1 && Array.isArray(extSplitted) ?
    clearBadCharsAndTrim(extSplitted.pop().split(' ', 1)[0].toLowerCase()) :
    'file';

  const docDiv = document.createElement('div');
  docDiv.classList.add('document', `ext-${ext}`);
  docDiv.dataset.docId = '' + doc.id;
  (docDiv as any).doc = doc;

  // return docDiv;

  const icoDiv = document.createElement('div');
  icoDiv.classList.add('document-ico');
  let icoTextEl: HTMLElement;

  const hadContext = !!cacheContext;
  const getCacheContext = () => {
    return hadContext ? cacheContext : managers.thumbsStorage.getCacheContext(doc);
  };

  cacheContext = await getCacheContext();
  let hasThumb = false;
  if((doc.thumbs?.length || (message.pFlags.is_outgoing && cacheContext.url && doc.type === 'photo'))/*  && doc.mime_type !== 'image/gif' */) {
    docDiv.classList.add('document-with-thumb');
    hasThumb = true;

    const imgs: (HTMLImageElement | HTMLCanvasElement | HTMLVideoElement)[] = [];
    // ! WARNING, use thumbs for check when thumb will be generated for media
    if(message.pFlags.is_outgoing && ['photo', 'video'].includes(doc.type) && cacheContext.url) {
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
    icoTextEl = document.createElement('span');
    icoTextEl.classList.add('document-ico-text');
    icoTextEl.innerText = ext;
    icoDiv.append(icoTextEl);
  }

  // let fileName = stringMiddleOverflow(doc.file_name || 'Unknown.file', 26);
  const fileName = doc.file_name ? wrapPlainText(doc.file_name) : 'Unknown.file';
  const descriptionEl = document.createElement('div');
  descriptionEl.classList.add('document-description');
  const bytesContainer = document.createElement('span');
  const bytesEl = formatBytes(doc.size);
  const bytesJoiner = ' / ';

  const descriptionParts: (HTMLElement | string | DocumentFragment)[] = [bytesEl];

  if(withTime) {
    descriptionParts.push(formatFullSentTime(message.date));
  }

  if(showSender) {
    descriptionParts.push(await wrapSenderToPeer(message));
  }

  if(!withTime && !showSender) {
    const b = document.createElement('span');
    const bytesMaxEl = formatBytes(doc.size);
    b.append(bytesJoiner, bytesMaxEl);
    b.style.visibility = 'hidden';
    descriptionParts.push(b);
  }

  docDiv.innerHTML = `
  ${(cacheContext.downloaded && !uploadFileName) || !message.mid || !hasThumb ? '' : `<div class="document-download"></div>`}
  <div class="document-name"></div>
  <div class="document-size"></div>
  `;

  const nameDiv = docDiv.querySelector('.document-name') as HTMLElement;
  const middleEllipsisEl = new MiddleEllipsisElement();
  middleEllipsisEl.dataset.fontWeight = '' + fontWeight;
  middleEllipsisEl.dataset.fontSize = '' + fontSize;
  middleEllipsisEl.dataset.sizeType = sizeType;
  (middleEllipsisEl as any).getSize = getSize;
  middleEllipsisEl.textContent = fileName;
  // setInnerHTML(middleEllipsisEl, fileName);

  // * new media popup
  if(!message.mid) {
    docDiv.classList.add('downloaded');
  }

  nameDiv.append(middleEllipsisEl);

  if(showSender) {
    nameDiv.append(wrapSentTime(message));
  }

  const sizeDiv = docDiv.querySelector('.document-size') as HTMLElement;
  bytesContainer.append(...joinElementsWith(descriptionParts, ' · '));
  sizeDiv.append(bytesContainer);

  docDiv.prepend(icoDiv);

  if(!uploadFileName && message.pFlags.is_outgoing && !message.mid) {
    return docDiv;
  }

  let downloadDiv: HTMLElement, preloader: ProgressivePreloader = null;
  const onLoad = () => {
    docDiv.classList.remove('downloading');

    if(/* !hasThumb ||  */(doc.size > MAX_FILE_SAVE_SIZE && !uploadFileName)) {
      preloader.setManual();
      preloader.attach(downloadDiv);
      preloader.preloader.classList.add('manual');
      preloader.setDownloadFunction(load);
      return;
    }

    if(doc.size <= MAX_FILE_SAVE_SIZE) {
      docDiv.classList.add('downloaded');
    }

    if(downloadDiv) {
      if(downloadDiv !== icoDiv) {
        const _downloadDiv = downloadDiv;
        setTimeout(() => {
          _downloadDiv.remove();
        }, 200);
      }

      downloadDiv = null;
    }

    if(preloader) {
      preloader = null;
    }
  };

  const addByteProgress = (promise: CancellablePromise<any>) => {
    docDiv.classList.add('downloading');

    const sizeContainer = document.createElement('span');
    const _bytesContainer = formatBytes(doc.size);
    sizeContainer.style.position = 'absolute';
    sizeContainer.style.left = '0';
    promise.then(onLoad, noop).finally(() => {
      // sizeContainer.replaceWith(bytesContainer);
      bytesContainer.style.visibility = '';
      sizeContainer.remove();
      // b && b.classList.remove('hide');
    });

    // b && b.classList.add('hide');

    const format = (bytes: number) => formatBytes(bytes);
    let d = format(0);
    bytesContainer.style.visibility = 'hidden';
    // bytesContainer.replaceWith(sizeContainer);
    sizeContainer.append(d, bytesJoiner, _bytesContainer);
    bytesContainer.parentElement.append(sizeContainer);
    promise.addNotifyListener((progress: Progress) => {
      const _d = format(progress.done);
      d.replaceWith(_d);
      d = _d;
    });
  };

  // ! DO NOT USE ASYNC/AWAIT HERE ! SAFARI WON'T LET DOWNLOAD THE FILE BECAUSE OF ASYNC
  const load = (e?: Event) => {
    const save = !e || e.isTrusted;
    const doc = (docDiv as any).doc;
    // const doc = await managers.appDocsManager.getDoc(docDiv.dataset.docId);
    let download: CancellablePromise<any>;
    const queueId = appImManager.chat.bubbles ? appImManager.chat.bubbles.lazyLoadQueue.queueId : undefined;
    if(!save) {
      download = appDownloadManager.downloadToDisc({media: doc, queueId}, true);
    } else if(doc.type === 'pdf' && false) {
      const canOpenAfter = /* managers.appDocsManager.downloading.has(doc.id) ||  */!preloader || preloader.detached;
      download = appDownloadManager.downloadMediaURL({media: doc, queueId});
      if(canOpenAfter) {
        download.then(() => {
          setTimeout(async() => { // wait for preloader animation end
            const url = (await getCacheContext()).url;
            window.open(url);
          }, liteMode.isAvailable('animations') ? 250 : 0);
        });
      }
    } else if(MEDIA_MIME_TYPES_SUPPORTED.has(doc.mime_type) && doc.thumbs?.length) {
      download = appDownloadManager.downloadMediaURL({media: doc, queueId});
    } else {
      download = appDownloadManager.downloadToDisc({media: doc, queueId});
    }

    download.catch(() => {
      docDiv.classList.remove('downloading');
    });

    if(downloadDiv) {
      preloader.attach(downloadDiv, true, download);
      addByteProgress(download);
    }
  };

  const {fileName: downloadFileName} = getDownloadMediaDetails({media: doc, downloadId: '1'});
  if(await managers.apiFileManager.isDownloading(downloadFileName)) {
    downloadDiv = docDiv.querySelector('.document-download') || icoDiv;
    const promise = appDownloadManager.downloadToDisc({media: doc}, true);

    preloader = new ProgressivePreloader();
    preloader.attach(downloadDiv, false, promise);
    preloader.setDownloadFunction(load);
    addByteProgress(promise);
  } else if(!cacheContext.downloaded || uploadFileName) {
    downloadDiv = docDiv.querySelector('.document-download') || icoDiv;
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
      addByteProgress(uploadPromise);
    }
  }

  attachClickEvent(docDiv, (e) => {
    if(findUpClassName(e.target, 'time')) { // prevent downloading by clicking on time
      return;
    }

    if(preloader) {
      preloader.onClick(e);
    } else {
      load(e);
    }
  });

  return docDiv;
}
