/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {Accessor, createEffect, onCleanup} from 'solid-js';
import {observeWalletCards} from '@components/wallet/chatCard/observe';

/**
 * The next page of a list while its end is in sight or `margin` px below it. A scroll brings the end there, and so
 * does a page whose few shown rows do not fill the view (one of mostly hidden dust), which nothing would scroll: the
 * observer is made again whenever what `canLoad` reads changes (a page came, the tab changed), and a new observer
 * says at once whether the end is still near — so the list goes on filling the view as long as there is more
 * (Android loads after every update while its last rows show). Nothing is measured here.
 */
export default function watchWalletListEnd(options: {
  root: Accessor<HTMLElement>,
  /** where the list ends */
  end: Accessor<HTMLElement>,
  /** a page may be asked for now: the list is not loading, has more, and did not fail */
  canLoad: Accessor<boolean>,
  loadMore: () => void,
  margin: number
}) {
  createEffect(() => {
    const root = options.root(), end = options.end();
    if(!root || !end || !options.canLoad()) return;
    const observer = observeWalletCards((entries) => {
      if(entries[entries.length - 1].isIntersecting) options.loadMore();
    }, {root, rootMargin: `0px 0px ${options.margin}px`});
    observer.observe(end);
    onCleanup(() => observer.disconnect());
  });
}
