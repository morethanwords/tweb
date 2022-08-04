/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import calcImageInBox from './calcImageInBox';

export class MediaSize {
  constructor(public width = 0, public height = width) {

  }

  public aspect(boxSize: MediaSize, fitted: boolean) {
    return calcImageInBox(this.width, this.height, boxSize.width, boxSize.height, fitted);
  }

  public aspectFitted(boxSize: MediaSize) {
    return this.aspect(boxSize, true);
  }

  public aspectCovered(boxSize: MediaSize) {
    return this.aspect(boxSize, false);
  }
}

export function makeMediaSize(width?: number, height?: number): MediaSize {
  return new MediaSize(width, height);
}
