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

export default async function wrapMediaSpoiler({
  media,
  middleware,
  width,
  height,
  animationGroup
}: {
  media: Document.document | Photo.photo,
  middleware: Middleware,
  width: number,
  height: number,
  animationGroup: AnimationItemGroup
}) {
  const sizes = (media as Photo.photo).sizes || (media as Document.document).thumbs;
  const thumb = sizes.find((size) => size._ === 'photoStrippedSize') as PhotoSize.photoStrippedSize;
  if(!thumb) {
    return;
  }

  const {image, loadPromise} = getImageFromStrippedThumb(media, thumb, true);
  await loadPromise;

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
