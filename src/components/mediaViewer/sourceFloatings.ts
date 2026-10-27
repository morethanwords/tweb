import findUpClassName from '@helpers/dom/findUpClassName';
import liteMode from '@helpers/liteMode';

// Floating overlays on the source a media flies out of (e.g. .video-time, .time.is-floating)
// should not show while it is away — they'd overlap the silhouette of the media viewer's mover,
// or of a peek's item, at the thumb position. On open: hide instantly. On close: fade them back.
//
// Each context is keyed by a `trigger` class found in the source's ancestry; the matching
// context's layers each pick their own ancestor (containerClass) and run a querySelectorAll
// inside it for the floating selectors. This lets a single context hide elements at multiple
// DOM levels — e.g. profile avatars need to hide both the info/gradient overlays inside
// .profile-avatars-container AND the .sidebar-header that's a sibling of .sidebar-content
// several levels up.
const FLOATING_CONTEXTS: ReadonlyArray<{
  readonly trigger: string,
  readonly layers: ReadonlyArray<{readonly containerClass: string, readonly selectors: string}>
}> = [{
    trigger: 'profile-avatars-container',
    layers: [
      {containerClass: 'profile-avatars-container', selectors: '.profile-avatars-info, .profile-avatars-gradient, .profile-music-container'},
      {containerClass: 'sidebar-slider-item', selectors: ':scope > .sidebar-header'}
    ]
  }, {
    trigger: 'bubble',
    layers: [{containerClass: 'bubble', selectors: '.video-time, .time.is-floating, .video-play'}]
  }, {
    trigger: 'grid-item',
    layers: [{containerClass: 'grid-item', selectors: '.video-time, .time.is-floating, .video-play'}]
  }];

// How many viewers and peeks hold each overlay hidden. They can overlap - a click right after a
// peek is released opens the viewer on the same photo while the peek is still flying home - and
// the overlay comes back only when the last of them lets go.
const holders = new Map<HTMLElement, number>();

/**
 * The overlays the sources above float over their media, for as long as something taken out of
 * one of them is shown over the page. `duration` is how long they take to fade back.
 */
export default function createSourceFloatings(duration: number) {
  const hidden = new Set<HTMLElement>();

  return {
    hide(target: HTMLElement) {
      if(!target) return;
      const context = FLOATING_CONTEXTS.find(({trigger}) => findUpClassName(target, trigger));
      if(!context) return;
      // In an album each item carries its own floating overlays (.video-time, .video-play),
      // but the container query spans the whole bubble. Only the media taken out of the clicked
      // item moves, so skip overlays that belong to a sibling album item. Bubble-level floatings
      // (e.g. .time.is-floating, which has no .album-item ancestor) are still hidden.
      const targetAlbumItem = findUpClassName(target, 'album-item');
      for(const {containerClass, selectors} of context.layers) {
        const container = findUpClassName(target, containerClass);
        if(!container) continue;
        container.querySelectorAll<HTMLElement>(selectors).forEach((el) => {
          if(hidden.has(el)) return;
          const albumItem = findUpClassName(el, 'album-item');
          if(albumItem && albumItem !== targetAlbumItem) return;
          el.style.transition = 'none';
          el.style.opacity = '0';
          hidden.add(el);
          holders.set(el, (holders.get(el) || 0) + 1);
        });
      }
    },

    // Called once the media has landed back, so the source is no longer obscured and its
    // overlays can fade in immediately.
    reveal() {
      if(!hidden.size) return;
      const elements = Array.from(hidden).filter((el) => {
        const count = holders.get(el) - 1;
        if(count) holders.set(el, count);
        else holders.delete(el);
        return !count;
      });
      hidden.clear();
      if(!elements.length) return;
      // A fade has no distance to follow, so it stays even with the motion effects off; with
      // every animation off the overlays are simply back.
      const time = liteMode.isAvailable('animations') ? duration : 0;
      elements.forEach((el) => {
        // Literal duration: the viewer's --open-duration is scoped to .media-viewer-whole and
        // these floating overlays live in the chat bubble (outside that scope).
        el.style.transition = time ? `opacity ${time}ms` : '';
        el.style.opacity = '';
      });

      if(!time) return;
      setTimeout(() => {
        elements.forEach((el) => {
          // hidden again by whatever came next: it is holding the transition now
          if(!holders.has(el)) {
            el.style.transition = '';
          }
        });
      }, time);
    }
  };
}
