/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import cancelEvent from '../../helpers/dom/cancelEvent';
import safePlay from '../../helpers/dom/safePlay';
import getImageFromStrippedThumb from '../../helpers/getImageFromStrippedThumb';
import {Document, Photo, PhotoSize} from '../../layer';
import {SensitiveContentSettings} from '../../lib/appManagers/appPrivacyManager';
import {i18n} from '../../lib/langPack';
import rootScope from '../../lib/rootScope';
import confirmationPopup from '../confirmationPopup';
import DotRenderer from '../dotRenderer';
import Icon from '../icon';
import {AgeVerificationPopup} from '../popups/ageVerification';
import SetTransition from '../singleTransition';
import {toastNew} from '../toast';

const sensitiveSpoilers = new Set<HTMLElement>();

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
        mediaSpoiler.remove();
        mediaSpoiler.middlewareHelper.destroy();
      }
    }
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
    mediaSpoiler?.remove?.();
    mediaSpoiler?.middlewareHelper?.destroy?.();
  });
}

export function onMediaSpoilerClick(options: {
  mediaSpoiler: HTMLElement,
  sensitiveSettings: SensitiveContentSettings,
  event: Event
}) {
  const {mediaSpoiler, event, sensitiveSettings} = options;
  cancelEvent(event);

  if(mediaSpoiler.classList.contains('is-revealing') || mediaSpoiler.dataset.isRevealing) {
    return;
  }

  if(mediaSpoiler.dataset.isSensitive) {
    if(!sensitiveSettings.sensitiveCanChange) {
      toastNew({langPackKey: 'SensitiveContentUnavailable'})
      return
    }

    if(sensitiveSettings.needAgeVerification && !sensitiveSettings.ageVerified) {
      AgeVerificationPopup.create().then((verified) => {
        if(verified) {
          clearSensitiveSpoilers()
        }
      })
      return;
    }

    confirmationPopup({
      titleLangKey: '18Plus',
      descriptionLangKey: 'SensitiveContentDesc',
      button: {
        langKey: 'SensitiveContentConfirm'
      },
      checkbox: {
        text: 'SensitiveContentRemember'
      }
    }).then((remember) => {
      if(remember) {
        rootScope.managers.appPrivacyManager.setContentSettings({sensitive_enabled: true});
        clearSensitiveSpoilers()
        return
      }

      delete mediaSpoiler.dataset.isSensitive
      onMediaSpoilerClick(options);
    })
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

function wrapMediaSpoilerWithImage(options: {
  image: Awaited<ReturnType<typeof getImageFromStrippedThumb>>['image']
} & Parameters<typeof DotRenderer['create']>[0]) {
  const {middleware, image} = options;
  if(!middleware()) {
    return;
  }

  image.classList.add('media-spoiler-thumbnail');

  const container = document.createElement('div');
  container.classList.add('media-spoiler-container');
  container.middlewareHelper = middleware.create();

  const {canvas, readyResult} = DotRenderer.create({
    ...options,
    middleware: container.middlewareHelper.get()
  });

  container.append(image, canvas);

  return {container, readyResult};
}

export function hasSensitiveSpoiler(container: HTMLElement) {
  return container.querySelector('.media-spoiler-container[data-is-sensitive]') != null;
}

export default async function wrapMediaSpoiler(
  options: Omit<Parameters<typeof wrapMediaSpoilerWithImage>[0], 'image'> & {
    media: Document.document | Photo.photo,
    sensitive?: boolean
  }
) {
  const {media, sensitive} = options;
  const sizes = (media as Photo.photo).sizes || (media as Document.document).thumbs;
  const thumb = sizes.find((size) => size._ === 'photoStrippedSize') as PhotoSize.photoStrippedSize;
  if(!thumb) {
    return;
  }

  const {image, loadPromise} = getImageFromStrippedThumb(media, thumb, true);
  await loadPromise;

  const {container, readyResult} = wrapMediaSpoilerWithImage({
    ...options,
    image
  });

  if(sensitive) {
    const div = document.createElement('div');
    div.classList.add('sensitive-content-warning');
    div.replaceChildren(Icon('eyecross_outline'), i18n('18Plus'));
    container.prepend(div);
    container.dataset.isSensitive = 'true';
    sensitiveSpoilers.add(container);
    options.middleware.onClean(() => {
      sensitiveSpoilers.delete(container);
    });
  }

  if(readyResult instanceof Promise) {
    await readyResult;
  }

  return container;
}
