/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import rootScope from '../lib/rootScope';
import {Message, MessageAction, Photo} from '../layer';
import type LazyLoadQueue from './lazyLoadQueue';
import {attachClickEvent} from '../helpers/dom/clickEvent';
import cancelEvent from '../helpers/dom/cancelEvent';
import AppMediaViewer from './appMediaViewer';
import AppMediaViewerAvatar from './appMediaViewerAvatar';
import isObject from '../helpers/object/isObject';
import {ArgumentTypes} from '../types';
import putPhoto from './putPhoto';
import {recordPromise} from '../helpers/recordPromise';
import {getMiddleware, MiddlewareHelper} from '../helpers/middleware';

const onAvatarUpdate = ({peerId, threadId}: {peerId: PeerId, threadId?: number}) => {
  let query = 'avatar-element[data-peer-id="' + peerId + '"]';
  if(threadId) {
    query += '[data-thread-id="' + threadId + '"]';
  }

  (Array.from(document.querySelectorAll(query)) as AvatarElement[]).forEach((elem) => {
    // console.log('updating avatar:', elem);
    elem.update();
  });
};

rootScope.addEventListener('avatar_update', onAvatarUpdate);
rootScope.addEventListener('peer_title_edit', async(data) => {
  if(!(await rootScope.managers.appAvatarsManager.isAvatarCached(data.peerId))) {
    onAvatarUpdate(data);
  }
});

export async function openAvatarViewer(
  target: HTMLElement,
  peerId: PeerId,
  middleware: () => boolean,
  message?: Message.messageService,
  prevTargets?: {element: HTMLElement, item: Photo.photo['id'] | Message.messageService}[],
  nextTargets?: typeof prevTargets
) {
  let photo = await rootScope.managers.appProfileManager.getFullPhoto(peerId);
  if(!middleware() || !photo) {
    return;
  }

  const getTarget = () => {
    const good = Array.from(target.querySelectorAll('img')).find((img) => !img.classList.contains('emoji'));
    return good ? target : null;
  };

  if(peerId.isAnyChat()) {
    const hadMessage = !!message;
    const inputFilter = 'inputMessagesFilterChatPhotos';
    if(!message) {
      message = await rootScope.managers.appMessagesManager.getHistory({
        peerId,
        inputFilter: {_: inputFilter},
        offsetId: 0,
        limit: 1
      }).then((value) => {
        return value.messages[0] as Message.messageService;
      });

      if(!middleware()) {
        return;
      }
    }

    if(message) {
      // ! гений в деле, костылируем (но это гениально)
      const messagePhoto = (message.action as MessageAction.messageActionChannelEditPhoto).photo;
      if(messagePhoto.id !== photo.id) {
        if(!hadMessage) {
          message = await rootScope.managers.appMessagesManager.generateFakeAvatarMessage(peerId, photo);
        } else {

        }
      }

      const f = (arr: typeof prevTargets) => arr.map((el) => ({
        element: el.element,
        mid: (el.item as Message.messageService).mid,
        peerId: (el.item as Message.messageService).peerId
      }));

      new AppMediaViewer()
      .setSearchContext({
        peerId,
        inputFilter: {_: inputFilter}
      })
      .openMedia({
        message,
        target: getTarget(),
        prevTargets: prevTargets ? f(prevTargets) : undefined,
        nextTargets: nextTargets ? f(nextTargets) : undefined
      });

      return;
    }
  }

  if(photo) {
    if(!isObject(message) && message) {
      photo = await rootScope.managers.appPhotosManager.getPhoto(message);
    }

    const f = (arr: typeof prevTargets) => arr.map((el) => ({
      element: el.element,
      photoId: el.item as string
    }));

    new AppMediaViewerAvatar(peerId).openMedia({
      photoId: photo.id,
      target: getTarget(),
      prevTargets: prevTargets ? f(prevTargets) : undefined,
      nextTargets: nextTargets ? f(nextTargets) : undefined
    });
  }
}

const believeMe: Map<string, Set<AvatarElement>> = new Map();
const seen: Set<PeerId> = new Set();

function getAvatarQueueKey(peerId: PeerId, threadId?: number) {
  return peerId + (threadId ? '_' + threadId : '');
}

export default class AvatarElement extends HTMLElement {
  public peerId: PeerId;
  public isDialog: boolean;
  public peerTitle: string;
  public loadPromises: Promise<any>[];
  public lazyLoadQueue: LazyLoadQueue;
  public isBig: boolean;
  public threadId: number;
  private addedToQueue = false;
  public wrapOptions: WrapSomethingOptions;

  public middlewareHelper: MiddlewareHelper;

  constructor() {
    super();
    this.classList.add('avatar-like');
    this.middlewareHelper = getMiddleware();
  }

  disconnectedCallback() {
    // браузер вызывает этот метод при удалении элемента из документа
    // (может вызываться много раз, если элемент многократно добавляется/удаляется)
    const key = getAvatarQueueKey(this.peerId, this.threadId);
    const set = believeMe.get(key);
    if(set?.has(this)) {
      set.delete(this);
      if(!set.size) {
        believeMe.delete(key);
      }
    }

    this.lazyLoadQueue?.delete({div: this});
  }

  public attachClickEvent() {
    let loading = false;
    attachClickEvent(this, async(e) => {
      cancelEvent(e);
      if(loading) return;
      const peerId = this.peerId;
      loading = true;
      await openAvatarViewer(this, this.peerId, () => this.peerId === peerId);
      loading = false;
    });
  }

  public updateOptions(options: Partial<ArgumentTypes<AvatarElement['updateWithOptions']>[0]>) {
    for(const i in options) {
      // @ts-ignore
      this[i] = options[i];
    }
  }

  public updateWithOptions(options: {
    peerId: PeerId,
    threadId?: number,
    isDialog?: boolean,
    isBig?: boolean,
    peerTitle?: string,
    lazyLoadQueue?: LazyLoadQueue | false,
    loadPromises?: Promise<any>[],
    wrapOptions?: WrapSomethingOptions
  }) {
    const wasPeerId = this.peerId;
    const wasThreadId = this.threadId;
    this.updateOptions(options);
    const newPeerId = this.peerId;
    const threadId = this.threadId;

    if(wasPeerId === newPeerId && wasThreadId === threadId) {
      return;
    }

    this.dataset.peerId = '' + newPeerId;

    if(threadId) {
      this.dataset.threadId = '' + threadId;
    } else if(wasThreadId) {
      delete this.dataset.threadId;
    }

    if(wasPeerId) {
      const key = getAvatarQueueKey(wasPeerId, wasThreadId);
      const set = believeMe.get(key);
      if(set) {
        set.delete(this);
        if(!set.size) {
          believeMe.delete(key);
        }
      }
    }

    const middleware = options.wrapOptions?.middleware;
    this.middlewareHelper.destroy();
    if(middleware) {
      this.middlewareHelper = middleware.create();
    } else {
      this.middlewareHelper.destroy();
    }

    return this.update();
  }

  public remove() {
    this.middlewareHelper.destroy();
    super.remove();
  }

  private r(onlyThumb = false) {
    const promise = putPhoto({
      div: this,
      peerId: this.peerId,
      isDialog: this.isDialog,
      title: this.peerTitle,
      onlyThumb,
      isBig: this.isBig,
      threadId: this.threadId,
      wrapOptions: {
        middleware: this.middlewareHelper.get(),
        ...(this.wrapOptions || {})
      }
    });
    // recordPromise(promise, 'avatar putPhoto-' + this.peerId);

    if(this.loadPromises) {
      this.loadPromises.push(promise);

      promise.finally(() => {
        this.loadPromises = undefined;
      });
    }

    return promise;
  }

  public update() {
    if(this.lazyLoadQueue) {
      if(!seen.has(this.peerId)) {
        if(this.addedToQueue) return;
        this.addedToQueue = true;

        const key = getAvatarQueueKey(this.peerId, this.threadId);
        let set = believeMe.get(key);
        if(!set) {
          believeMe.set(key, set = new Set());
        }

        set.add(this);

        this.lazyLoadQueue.push({
          div: this,
          load: () => {
            seen.add(this.peerId);
            return this.update();
          }
        });

        return this.r(true);
      } else if(this.addedToQueue) {
        this.lazyLoadQueue.delete({div: this});
      }
    }

    seen.add(this.peerId);

    const promise = this.r();

    if(this.addedToQueue) {
      promise.finally(() => {
        this.addedToQueue = false;
      });
    }

    const key = getAvatarQueueKey(this.peerId, this.threadId);
    const set = believeMe.get(key);
    if(set) {
      set.delete(this);
      const arr = Array.from(set);
      believeMe.delete(key);

      for(let i = 0, length = arr.length; i < length; ++i) {
        arr[i].update();
      }
    }

    return promise;
  }
}

customElements.define('avatar-element', AvatarElement);
