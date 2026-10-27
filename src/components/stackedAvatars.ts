import type LazyLoadQueue from '@components/lazyLoadQueue';
import type {ActiveAccountNumber} from '@lib/accounts/types';
import {getMiddleware, Middleware, MiddlewareHelper} from '@helpers/middleware';
import {avatarNew} from '@components/avatarNew';
import {createEffect, on, onCleanup} from 'solid-js';

const CLASS_NAME = 'stacked-avatars';
const AVATAR_CLASS_NAME = CLASS_NAME + '-avatar';
const AVATAR_CONTAINER_CLASS_NAME = AVATAR_CLASS_NAME + '-container';

export default class StackedAvatars {
  public container: HTMLElement;
  private lazyLoadQueue: LazyLoadQueue;
  private avatarSize: number;
  private accountNumber: ActiveAccountNumber;
  private middlewareHelper: MiddlewareHelper;
  private peerIdByContainer: WeakMap<HTMLElement, PeerId> = new WeakMap();

  constructor(options: {
    lazyLoadQueue?: StackedAvatars['lazyLoadQueue'],
    avatarSize: StackedAvatars['avatarSize'],
    middleware: Middleware,
    // * whose peers they are, when the tab may show another account meanwhile (a call's)
    accountNumber?: ActiveAccountNumber
  }) {
    this.lazyLoadQueue = options.lazyLoadQueue;
    this.avatarSize = options.avatarSize;
    this.accountNumber = options.accountNumber;
    this.middlewareHelper = options.middleware.create();

    this.container = document.createElement('div');
    this.container.classList.add(CLASS_NAME);

    this.container.style.setProperty('--avatar-size', options.avatarSize + 'px');
  }

  public setAccountNumber(accountNumber: ActiveAccountNumber) {
    this.accountNumber = accountNumber;
  }

  /**
   * MACOS, ANDROID - без реверса
   * WINDOWS DESKTOP - реверс
   * все приложения накладывают аватарку первую на вторую, а в макете зато вторая на первую, ЛОЛ!
   */
  public render(peerIds: PeerId[], loadPromises: Promise<any>[] = []) {
    const children = this.container.children;
    peerIds = peerIds.slice().reverse();
    if(peerIds.length > 3) {
      peerIds = peerIds.slice(-3);
    }

    peerIds.forEach((peerId, idx) => {
      let avatarContainer = children[idx] as HTMLElement;
      // * the same person in the same place keeps the avatar: it follows the photo by itself, and a new one put the
      // * thumbnail through loading again for every refresh of the list (a channel post's comments refresh on open)
      if(avatarContainer && this.peerIdByContainer.get(avatarContainer) === peerId) {
        avatarContainer.classList.toggle('is-first', idx === 0);
        avatarContainer.classList.toggle('is-last', idx === peerIds.length - 1);
        return;
      }

      if(!avatarContainer) {
        avatarContainer = document.createElement('div');
        avatarContainer.classList.add(AVATAR_CONTAINER_CLASS_NAME);
        avatarContainer.middlewareHelper = this.middlewareHelper.get().create();
      } else {
        avatarContainer.middlewareHelper.clean();
      }

      const avatarElem = avatarNew({
        middleware: avatarContainer.middlewareHelper.get(),
        size: this.avatarSize,
        isDialog: false,
        lazyLoadQueue: this.lazyLoadQueue,
        peerId,
        accountNumber: this.accountNumber
      });
      avatarElem.node.classList.add(AVATAR_CLASS_NAME);
      loadPromises?.push(avatarElem.readyThumbPromise);

      avatarContainer.replaceChildren(avatarElem.node);
      this.peerIdByContainer.set(avatarContainer, peerId);

      if(!avatarContainer.parentNode) {
        this.container.append(avatarContainer);
      }

      avatarContainer.classList.toggle('is-first', idx === 0);
      avatarContainer.classList.toggle('is-last', idx === peerIds.length - 1);
    });

    // if were 3 and became 2
    (Array.from(children) as HTMLElement[]).slice(peerIds.length).forEach((el) => {
      el.middlewareHelper.destroy();
      el.remove();
    });

    return Promise.all(loadPromises);
  }
}

export function StackedAvatarsTsx(props: {
  peerIds: PeerId[],
  avatarSize: number,
  lazyLoadQueue?: StackedAvatars['lazyLoadQueue'],
  accountNumber?: ActiveAccountNumber
}) {
  const middleware = getMiddleware()
  const stackedAvatars = new StackedAvatars({
    avatarSize: props.avatarSize,
    lazyLoadQueue: props.lazyLoadQueue,
    middleware: middleware.get()
  });

  onCleanup(() => middleware.destroy());

  createEffect(on(() => [props.peerIds, props.accountNumber] as const, ([peerIds, accountNumber]) => {
    stackedAvatars.setAccountNumber(accountNumber);
    stackedAvatars.render(peerIds);
  }));

  return stackedAvatars.container;
}
