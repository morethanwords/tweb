/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import ListLoader from '@helpers/listLoader';
import {Message} from '@layer';
import type {
  MediaItem,
  MediaListLoader,
  MediaListLoaderFactory,
  MediaListLoaderOptions
} from './appMediaPlaybackController';

/**
 * A `MediaListLoader` implementation that exposes an always-empty playlist.
 *
 * Intended for media that should play in isolation (e.g. a poll's
 * description / explanation audio) — the playback controller still
 * tracks the media as the currently-playing one, but `next` / `previous`
 * navigation does nothing because there is nothing to navigate to.
 *
 * Use the exported `emptyMediaListLoaderFactory` as the
 * `listLoaderFactory` on an `AudioElement`.
 */
export class EmptyMediaListLoader extends ListLoader<MediaItem, Message.message> implements MediaListLoader {
  public onEmptied?: () => void;

  constructor() {
    super({
      loadMore: async() => ({count: 0, items: []})
    });

    // No prev / no next — we're loaded "to the ends" in both directions.
    this.setLoaded(true, true);
    this.setLoaded(false, true);
  }

  public setOptions(options: MediaListLoaderOptions) {
    this.processItem = options.processItem;
    this.loadCount = options.loadCount ?? 50;
    this.loadWhenLeft = options.loadWhenLeft ?? 20;
    this.onJump = options.onJump;
    this.onEmptied = options.onEmptied;
    this.onLoadedMore = options.onLoadedMore;
  }

  public goRound(_length: number, _dispatchJump?: boolean): void {
    // Empty playlist: navigation is a no-op.
  }

  public getPrevious(_withOtherSide?: boolean): MediaItem[] {
    return [];
  }

  public getNext(_withOtherSide?: boolean): MediaItem[] {
    return [];
  }

  public setCurrent(item: MediaItem) {
    this.current = item;
  }

  public cleanup() {
    // No external resources to release.
  }
}

export const emptyMediaListLoaderFactory: MediaListLoaderFactory = (options) => {
  const loader = new EmptyMediaListLoader();
  loader.setOptions(options);
  return loader;
};
