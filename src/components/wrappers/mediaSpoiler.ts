/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import getImageFromStrippedThumb from '../../helpers/getImageFromStrippedThumb';
import {Middleware} from '../../helpers/middleware';
import {Document, Photo, PhotoSize} from '../../layer';
import {AnimationItemGroup} from '../animationIntersector';
import DotRenderer from '../dotRenderer';
import SetTransition from '../singleTransition';

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

export function wrapMediaSpoilerWithImage({
  middleware,
  width,
  height,
  animationGroup,
  image
}: {
  middleware: Middleware,
  width: number,
  height: number,
  animationGroup: AnimationItemGroup,
  image: Awaited<ReturnType<typeof getImageFromStrippedThumb>>['image']
}) {
  if(!middleware()) {
    return;
  }

  image.classList.add('media-spoiler-thumbnail');

  const container = document.createElement('div');
  container.classList.add('media-spoiler-container');
  container.middlewareHelper = middleware.create();

  const dotRenderer = DotRenderer.create({
    width,
    height,
    middleware: container.middlewareHelper.get(),
    animationGroup
  });

  container.append(image, dotRenderer.canvas);

  return container;
}

export default async function wrapMediaSpoiler(
  options: Omit<Parameters<typeof wrapMediaSpoilerWithImage>[0], 'image'> & {
    media: Document.document | Photo.photo
  }
) {
  const {media} = options;
  const sizes = (media as Photo.photo).sizes || (media as Document.document).thumbs;
  const thumb = sizes.find((size) => size._ === 'photoStrippedSize') as PhotoSize.photoStrippedSize;
  if(!thumb) {
    return;
  }

  const {image, loadPromise} = getImageFromStrippedThumb(media, thumb, true);
  await loadPromise;

  return wrapMediaSpoilerWithImage({
    ...options,
    image
  });
}
