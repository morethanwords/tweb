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
import makeMediaPreviewsAccessible, {MEDIA_PREVIEW_SELECTOR} from '@helpers/dom/mediaPreviewAccessibility';
import {doubleRaf} from '@helpers/schedulers';
import {bindManagersToSession} from '@lib/accounts/bindManagersToAccount';
import {getAccountSession} from '@lib/accounts/getCurrentAccount';

// * the dot canvas is decoration on top of an already-covering blurred thumbnail; never let it
// * hold up the message batch for longer than this
const SPOILER_READY_TIMEOUT = 2000;

const sensitiveSpoilers = new Set<HTMLElement>();

function removeSpoiler(mediaSpoiler: HTMLElement) {
  const restoreFocus = Modes.a11y && mediaSpoiler.contains(mediaSpoiler.ownerDocument.activeElement);
  const preview = mediaSpoiler.closest<HTMLElement>(MEDIA_PREVIEW_SELECTOR);
  mediaSpoiler.remove();
  mediaSpoiler.middlewareHelper?.destroy();
  if(preview) {
    makeMediaPreviewsAccessible(preview);
    if(restoreFocus) {
      (preview.matches('button, [role="button"]') ? preview : preview.querySelector<HTMLElement>('button, [role="button"]'))?.focus();
    }
  }
}

export function clearSensitiveSpoilers() {
  for(const spoiler of sensitiveSpoilers) {
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

  if(!controls || !thumbnailCanvas) return false;

  const result = controls.revealWithAnimation(event, thumbnailCanvas);
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

  const video = mediaSpoiler.parentElement.querySelector('video');
  if(video && !mediaSpoiler.parentElement.querySelector('.video-play')) {
    video.autoplay = true;
    safePlay(video);
  }

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
  decorative?: boolean
} & Parameters<typeof DotRenderer['create']>[0]) {
  const {middleware, image, decorative} = options;
  if(!middleware()) {
    return;
  }

  image.classList.add('media-spoiler-thumbnail');

  let container: HTMLElement;
  // without the a11y layer the spoiler is a plain box again, revealed by its owner's delegated click
  if(decorative || !Modes.a11y) {
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

  const {canvas, readyResult} = DotRenderer.create({
    ...options,
    middleware: container.middlewareHelper.get()
  });

  container.append(image, canvas);

  return {container, readyResult};
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
    waitForReady?: boolean
  }
) {
  const {media, previewUrl, sensitive, waitForReady = true} = options;
  const sizes = media && (
    (media as Photo.photo).sizes ||
    (media as Document.document).thumbs
  );
  const thumb = sizes?.find((size) => (
    size._ === 'photoStrippedSize'
  )) as PhotoSize.photoStrippedSize;
  let image: HTMLCanvasElement | HTMLImageElement;
  if(thumb) {
    const result = getImageFromStrippedThumb(media, thumb, true);
    image = result.image;
    await result.loadPromise;
  } else if(previewUrl) {
    image = new Image();
    image.classList.add('thumbnail', 'media-spoiler-thumbnail-preview');
    await renderImageFromUrlPromise(image, previewUrl);
  } else {
    return;
  }

  const result = wrapMediaSpoilerWithImage({
    ...options,
    image
  });
  if(!result) return;
  const {container, readyResult} = result;

  if(sensitive) {
    const div = document.createElement('div');
    div.classList.add('sensitive-content-warning');
    div.replaceChildren(Icon('eyecross'), i18n('18Plus'));
    container.prepend(div);
    container.dataset.isSensitive = 'true';
    sensitiveSpoilers.add(container);
    options.middleware.onClean(() => {
      sensitiveSpoilers.delete(container);
    });
  }

  if(waitForReady && readyResult instanceof Promise) {
    // Waiting here only avoids a blank first frame of the dot canvas — the media is already covered
    // by the blurred thumbnail underneath. The bubble's render promise is awaited by the message
    // batch processor, so blocking on this indefinitely stalls the whole chat: bail out after a
    // deadline and let the dots appear late if the renderer wakes up later.
    await withTimeout<unknown>(readyResult, SPOILER_READY_TIMEOUT);
  }

  return container;
}
