import {Photo, PhotoSize} from '@layer';
import {avatarNew, wrapPhotoToAvatar} from '@components/avatarNew';
import {attachClickEvent} from '@helpers/dom/clickEvent';
import Button from '@components/button';
import {LangPackKey} from '@lib/langPack';
import {Middleware} from '@helpers/middleware';
import type LazyLoadQueue from '@components/lazyLoadQueue';
import type ListenerSetter from '@helpers/listenerSetter';

const CLASS_NAME = 'bubble-service-media';

export type ServiceMediaBubbleButton = {
  text: LangPackKey,
  onClick: (e: MouseEvent) => void
};

export type WrapServiceMediaBubbleOptions = {
  // The `.service-msg` element to fill (column layout, centered).
  container: HTMLElement,
  middleware: Middleware,
  lazyLoadQueue?: LazyLoadQueue,
  listenerSetter?: ListenerSetter,
  // A standalone Photo (e.g. a suggested/fallback profile photo). Rendered via
  // wrapPhotoToAvatar so it works for any Photo, not only a peer's listed avatar
  // — animated photos play their looping muted video automatically.
  photo: Photo.photo,
  photoSize?: PhotoSize,
  // Round media diameter in px (defaults to 100, matching story-mention).
  size?: number,
  // The action text shown under the media.
  caption?: HTMLElement | DocumentFragment | string,
  // Click handler for the media itself (omit to make it non-clickable).
  onMediaClick?: (e: MouseEvent) => void,
  // Optional action button rendered under the caption.
  button?: ServiceMediaBubbleButton
};

/**
 * Renders a service-message bubble whose body is a centered round media (a
 * profile Photo) plus an optional caption and an optional action button — the
 * shape Telegram uses for the "suggested profile photo" service message.
 *
 * Kept generic on purpose: any media-carrying service action (suggested photo,
 * and future ones) can reuse this. Modeled on the story-mention service bubble.
 */
export default function wrapServiceMediaBubble(options: WrapServiceMediaBubbleOptions) {
  const {
    container,
    middleware,
    lazyLoadQueue,
    listenerSetter,
    photo,
    photoSize,
    size = 100,
    caption,
    onMediaClick,
    button
  } = options;

  container.classList.add(CLASS_NAME + '-wrapper');

  const avatarContainer = document.createElement('div');
  avatarContainer.classList.add(CLASS_NAME + '-avatar-container');

  const avatar = avatarNew({
    middleware,
    size,
    isDialog: false,
    lazyLoadQueue
  });
  avatar.node.classList.add(CLASS_NAME + '-avatar');

  const loadPromise = wrapPhotoToAvatar(avatar, photo, size, photoSize);

  avatarContainer.append(avatar.node);

  if(onMediaClick) {
    avatarContainer.classList.add('is-clickable');
    attachClickEvent(avatarContainer, onMediaClick, {listenerSetter});
  }

  container.append(avatarContainer);

  if(caption) {
    const text = document.createElement('div');
    text.classList.add(CLASS_NAME + '-text');
    text.append(caption);
    container.append(text);
  }

  if(button) {
    const buttonElement = Button('bubble-service-button ' + CLASS_NAME + '-button', {
      noRipple: true,
      text: button.text
    });
    attachClickEvent(buttonElement, button.onClick, {listenerSetter});
    container.append(buttonElement);
  }

  return {avatar, avatarContainer, loadPromise};
}
