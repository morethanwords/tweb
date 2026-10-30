import cancelEvent from '@helpers/dom/cancelEvent';
import safePlay from '@helpers/dom/safePlay';
import {renderImageFromUrlPromise} from '@helpers/dom/renderImageFromUrl';
import getImageFromStrippedThumb from '@helpers/getImageFromStrippedThumb';
import withTimeout from '@helpers/schedulers/withTimeout';
import {Document, Photo, PhotoSize} from '@layer';
import {i18n} from '@lib/langPack';
import DotRenderer from '@components/dotRenderer';
import Icon from '@components/icon';
import SetTransition from '@components/singleTransition';
import Button from '@components/button';
import Modes from '@config/modes';
import {attachClickEvent} from '@helpers/dom/clickEvent';
import makeMediaPreviewsAccessible, {getSpoilerMediaPreview} from '@helpers/dom/mediaPreviewAccessibility';
import {doubleRaf} from '@helpers/schedulers';
import {bindManagersToSession} from '@lib/accounts/bindManagersToAccount';
import {getAccountSession} from '@lib/accounts/getCurrentAccount';
import {Middleware} from '@helpers/middleware';
import noop from '@helpers/noop';
import animationIntersector from '@components/animationIntersector';

// * the dot canvas is decoration on top of an already-covering blurred thumbnail; never let it
// * hold up the message batch for longer than this
const SPOILER_READY_TIMEOUT = 2000;

// * nothing to blur under the dots: the colour of a dim photo
const SPOILER_FALLBACK_COLOR = '#4b4f55';

const sensitiveSpoilers = new Set<HTMLElement>();
const revealCallbacks = new WeakMap<HTMLElement, () => void>();
// * a video that joins the page only once it has loaded, after its spoiler
const spoilerVideos = new WeakMap<HTMLElement, HTMLVideoElement>();
// * a link with a spoiler in it: the button beside it that reveals the spoiler from the keyboard
const linkRevealButtons = new WeakMap<HTMLElement, HTMLElement>();

function removeSpoiler(mediaSpoiler: HTMLElement) {
  const restoreFocus = Modes.a11y && mediaSpoiler.contains(mediaSpoiler.ownerDocument.activeElement);
  const preview = getSpoilerMediaPreview(mediaSpoiler);
  const link = mediaSpoiler.closest<HTMLElement>('a');
  if(link) linkRevealButtons.get(link)?.remove();
  mediaSpoiler.remove();
  mediaSpoiler.middlewareHelper?.destroy();
  if(preview) {
    makeMediaPreviewsAccessible(preview);
    if(restoreFocus) {
      (preview.matches('button, [role="button"]') ? preview : preview.querySelector<HTMLElement>('button, [role="button"]'))?.focus();
    }
  }
}

// * as a spoiler starts to reveal, what waited under it goes on: its own callback, or a video that plays by itself -
// * as the intersector lets it, in sight and once loaded, and at once for the one a click revealed
function onSpoilerReveal(mediaSpoiler: HTMLElement, clicked?: boolean) {
  const callback = revealCallbacks.get(mediaSpoiler);
  if(callback) {
    revealCallbacks.delete(mediaSpoiler);
    callback();
    return;
  }

  const parent = mediaSpoiler.parentElement;
  const video = spoilerVideos.get(mediaSpoiler) || parent?.querySelector('video');
  if(!video || parent?.querySelector('.video-play')) {
    return;
  }

  video.autoplay = true;
  const animation = animationIntersector.getAnimations(video)[0];
  if(animation) animationIntersector.checkAnimation(animation);
  else if(clicked && video.isConnected) safePlay(video);
}

export function clearSensitiveSpoilers() {
  for(const spoiler of sensitiveSpoilers) {
    onSpoilerReveal(spoiler);
    toggleMediaSpoiler({
      mediaSpoiler: spoiler,
      reveal: true,
      destroyAfter: true
    });
  }
  sensitiveSpoilers.clear();
}

export function toggleMediaSpoiler(options: {
  mediaSpoiler: HTMLElement,
  reveal: boolean,
  destroyAfter?: boolean
}) {
  const {mediaSpoiler, reveal, destroyAfter} = options;
  SetTransition({
    element: mediaSpoiler,
    forwards: reveal,
    className: 'is-revealing',
    duration: 250,
    onTransitionEnd: () => {
      if(reveal && destroyAfter) {
        removeSpoiler(mediaSpoiler);
      }
    }
  });
}

export async function concealMediaSpoilerWithAnimation(options: {
  mediaSpoiler: HTMLElement,
  canAnimate?: () => boolean
}) {
  const {mediaSpoiler, canAnimate} = options;
  mediaSpoiler.classList.add('is-revealing', 'forwards');
  await doubleRaf();
  if(
    !mediaSpoiler.isConnected ||
    canAnimate && !canAnimate()
  ) return;
  toggleMediaSpoiler({
    mediaSpoiler,
    reveal: false
  });
}


function revealSpoilerWithAnimation(options: {
  mediaSpoiler: HTMLElement,
  event: Event
}) {
  const {mediaSpoiler, event} = options;

  const thumbnailCanvas = mediaSpoiler.querySelector('canvas.media-spoiler-thumbnail') as HTMLCanvasElement;
  const canvas = mediaSpoiler.querySelector('canvas.canvas-dots') as HTMLElement;

  const controls = DotRenderer.getImageSpoilerByElement(canvas);

  if(!controls || !thumbnailCanvas || !('clientX' in event)) return false;

  // * from where it was clicked; a keyboard's click comes at no point of it (at 0, 0, from which the reveal never
  // * ended), and the reveal starts at its middle
  const {clientX, clientY} = event as MouseEvent;
  const rect = canvas.getBoundingClientRect();
  const isInside = clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom;
  const from = isInside ? event : {clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2} as MouseEvent;
  const result = controls.revealWithAnimation(from, thumbnailCanvas);
  if(!result) return false;

  return result.then(() => {
    removeSpoiler(mediaSpoiler);
  });
}

export function onMediaSpoilerClick(options: {
  mediaSpoiler: HTMLElement,
  event: Event
}) {
  const {mediaSpoiler, event} = options;
  cancelEvent(event);

  if(mediaSpoiler.classList.contains('is-revealing') || mediaSpoiler.dataset.isRevealing) {
    return;
  }

  if(mediaSpoiler.dataset.isSensitive) {
    void onSensitiveMediaSpoilerClick(options).catch((error) => {
      console.error('sensitive media spoiler error', error);
    });
    return;
  }

  onSpoilerReveal(mediaSpoiler, true);

  if(revealSpoilerWithAnimation({mediaSpoiler, event})) {
    mediaSpoiler.dataset.isRevealing = 'true';
    return;
  }

  toggleMediaSpoiler({
    mediaSpoiler,
    reveal: true,
    destroyAfter: true
  });
}

async function onSensitiveMediaSpoilerClick(options: {
  mediaSpoiler: HTMLElement,
  event: Event
}) {
  // * the account session the media was opened on: rootScope comes with the rest, once loaded
  const session = getAccountSession();
  const {mediaSpoiler} = options;
  const [
    {default: useContentSettings},
    {default: confirmationPopup},
    {default: createAgeVerification},
    {toastNew},
    {default: rootScope}
  ] = await Promise.all([
    import('@stores/contentSettings'),
    import('@components/confirmationPopup'),
    import('@components/popups/ageVerification'),
    import('@components/toast'),
    import('@lib/rootScope')
  ]);
  if(session.ended || !mediaSpoiler.isConnected || !mediaSpoiler.dataset.isSensitive) return;
  // oxlint-disable-next-line tweb/managers-before-await -- read in the session the click was made in, just checked
  const managers = bindManagersToSession(rootScope.managers);
  const contentSettings = useContentSettings();

  // * drawn before the switch was turned on, in this tab or another one: there is nothing left to ask
  if(contentSettings.sensitiveEnabled()) {
    clearSensitiveSpoilers();
    return;
  }

  const canChange = contentSettings.sensitiveCanChange();
  // * the age comes first, by the server's word (a mark kept on this device could be set by anyone), and only an
  // * account that may turn the filter off can get past it
  if(contentSettings.needAgeVerification()) {
    if(!canChange) {
      toastNew({langPackKey: 'SensitiveContentUnavailable'});
      return;
    }

    createAgeVerification().then((verified) => {
      if(verified) {
        clearSensitiveSpoilers();
      }
    });
    return;
  }

  // * an account that may not turn the filter off still opens one media at a time, with nothing to remember
  confirmationPopup({
    titleLangKey: '18Plus',
    descriptionLangKey: 'SensitiveContentDesc',
    button: {
      langKey: 'SensitiveContentConfirm'
    },
    checkbox: canChange ? {
      text: 'SensitiveContentRemember'
    } : undefined
  }).then(async(remember) => {
    if(remember) {
      // * all of them only once the server has accepted the switch: it may refuse it
      try {
        await managers.appPrivacyManager.setContentSettings({sensitive_enabled: true});
        clearSensitiveSpoilers();
        return;
      } catch(err) {
        toastNew({langPackKey: 'Error.AnError'});
      }
    }

    // * this one was asked for either way
    delete mediaSpoiler.dataset.isSensitive;
    onMediaSpoilerClick(options);
  });
}

function wrapMediaSpoilerWithImage(options: {
  image: Awaited<ReturnType<typeof getImageFromStrippedThumb>>['image'],
  // only covers the media, never reveals it: the composer shows where a spoiler will be and has
  // its own control to take it off
  decorative?: boolean,
  // in a link (a web page's preview), which may hold no control of its own: a plain box, revealed by
  // its owner's delegated click, while the keyboard has the link
  inLink?: boolean
} & Parameters<typeof DotRenderer['create']>[0]) {
  const {middleware, image, decorative, inLink} = options;
  if(!middleware()) {
    return;
  }

  image.classList.add('media-spoiler-thumbnail');

  const container = createSpoilerContainer(middleware, decorative || inLink);
  const {canvas, readyResult} = DotRenderer.create({
    ...options,
    middleware: container.middlewareHelper.get()
  });

  container.append(image, canvas);

  return {container, readyResult};
}

function createSpoilerContainer(middleware: Middleware, plain?: boolean) {
  let container: HTMLElement;
  // without the a11y layer the spoiler is a plain box again, revealed by its owner's delegated click
  if(plain || !Modes.a11y) {
    container = document.createElement('div');
    container.classList.add('media-spoiler-container');
    container.middlewareHelper = middleware.create();
  } else {
    container = Button('media-spoiler-container', {noRipple: true, ariaLabel: 'AccDescr.RevealMedia'});
    container.middlewareHelper = middleware.create();
    container.middlewareHelper.get().onClean(attachClickEvent(container, (event) => {
      onMediaSpoilerClick({mediaSpoiler: container, event});
    }));
  }

  return container;
}

function markSensitive(container: HTMLElement, middleware: Middleware) {
  const div = document.createElement('div');
  div.classList.add('sensitive-content-warning');
  div.replaceChildren(Icon('eyecross'), i18n('18Plus'));
  container.prepend(div);
  container.dataset.isSensitive = 'true';
  sensitiveSpoilers.add(container);
  middleware.onClean(() => {
    sensitiveSpoilers.delete(container);
  });
}

/**
 * A sticker has no box to hide it in: it stands blurred and still where it is, as in tdesktop, under the warning
 * alone, and `onReveal` lets it go
 */
export function wrapSensitiveStickerSpoiler(options: {
  middleware: Middleware,
  onReveal: () => void
}) {
  const container = createSpoilerContainer(options.middleware);
  container.classList.add('is-sticker');
  markSensitive(container, options.middleware);
  revealCallbacks.set(container, options.onReveal);
  return container;
}

/**
 * A spoiler in a link is a plain box, the link being the one control there (WebPageBox): with the a11y layer a button
 * beside the link, out of sight until it has the focus, reveals it from the keyboard, and goes with it
 */
export function attachLinkSpoilerRevealButton(link: HTMLElement, middleware: Middleware) {
  if(!Modes.a11y) {
    return;
  }

  const button = document.createElement('button');
  button.type = 'button';
  button.classList.add('sr-only', 'sr-only-focusable');
  button.append(i18n('AccDescr.RevealMedia'));
  middleware.onClean(attachClickEvent(button, (event) => {
    const mediaSpoiler = link.querySelector<HTMLElement>('.media-spoiler-container');
    if(!mediaSpoiler) {
      return;
    }

    // * the confirmation gives the focus back to the link: this button goes with the spoiler
    link.focus({preventScroll: true});
    onMediaSpoilerClick({mediaSpoiler, event});
  }));
  middleware.onClean(() => button.remove());
  linkRevealButtons.set(link, button);
  link.after(button);
}

// * for whoever takes the link elsewhere (a poll's link preview), to take the button along
export function getLinkSpoilerRevealButton(link: HTMLElement) {
  return linkRevealButtons.get(link);
}

// * still hidden behind a spoiler: a revealed one is removed
export function hasMediaSpoiler(container: HTMLElement) {
  return container.querySelector('.media-spoiler-container') != null;
}

export function hasSensitiveSpoiler(container: HTMLElement) {
  return container.querySelector('.media-spoiler-container[data-is-sensitive]') != null;
}

export default async function wrapMediaSpoiler(
  options: Omit<Parameters<typeof wrapMediaSpoilerWithImage>[0], 'image'> & {
    media?: Document.document | Photo.photo,
    previewUrl?: string,
    sensitive?: boolean,
    waitForReady?: boolean,
    // * the video it covers: it may join the page only once loaded
    video?: HTMLVideoElement
  }
) {
  const {media, previewUrl, sensitive, waitForReady = true, video} = options;
  const sizes = media && (
    (media as Photo.photo).sizes ||
    (media as Document.document).thumbs
  );
  // * what the media carries in itself, to draw the cover at once
  const thumb = (
    sizes?.find((size) => size._ === 'photoStrippedSize') ||
    sizes?.find((size) => size._ === 'photoCachedSize')
  ) as PhotoSize.photoStrippedSize | PhotoSize.photoCachedSize;
  let image: HTMLCanvasElement | HTMLImageElement;
  try {
    if(thumb) {
      const result = getImageFromStrippedThumb(media, thumb, true);
      image = result.image;
      await result.loadPromise;
    } else if(previewUrl) {
      image = new Image();
      image.classList.add('thumbnail', 'media-spoiler-thumbnail-preview');
      await renderImageFromUrlPromise(image, previewUrl);
    }
  } catch(err) {
    image = undefined;
  }

  if(!image) {
    // * with nothing to blur, or what there was failed to load, it still covers the media: the dots over a plain fill
    image = document.createElement('canvas');
    image.width = image.height = 1;
    const context = image.getContext('2d');
    context.fillStyle = SPOILER_FALLBACK_COLOR;
    context.fillRect(0, 0, 1, 1);
  }

  const result = wrapMediaSpoilerWithImage({
    ...options,
    image
  });
  if(!result) return;
  const {container, readyResult} = result;

  if(sensitive) {
    markSensitive(container, options.middleware);
  }

  if(video) {
    spoilerVideos.set(container, video);
  }

  if(waitForReady && readyResult instanceof Promise) {
    // Waiting here only avoids a blank first frame of the dot canvas — the media is already covered
    // by the blurred thumbnail underneath. The bubble's render promise is awaited by the message
    // batch processor, so blocking on this indefinitely stalls the whole chat: bail out after a
    // deadline and let the dots appear late if the renderer wakes up later.
    // * and the thumbnail covers it whether the dots come or fail
    await withTimeout<unknown>(readyResult, SPOILER_READY_TIMEOUT).catch(noop);
  }

  return container;
}
