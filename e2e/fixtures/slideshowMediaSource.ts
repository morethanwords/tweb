import {render} from 'solid-js/web';
import {InstantViewBlocks} from '@components/instantView';
import {instantViewStyles as styles} from '@components/instantViewFormatting';
import {getMediaSourceClip} from '@components/mediaViewer/clipPath';
import HotReloadGuard from '@lib/solidjs/hotReloadGuardProvider';
import type {Page, PageBlock, Photo} from '@layer';

export type SlideshowSurface = 'instant-view' | 'message';
const SURFACES: SlideshowSurface[] = ['instant-view', 'message'];
const PHOTO_IDS = [1, 2, 3];
const EMPTY_CAPTION: PageBlock.pageBlockPhoto['caption'] = {_: 'pageCaption', text: {_: 'textEmpty'}, credit: {_: 'textEmpty'}};

/**
 * A slideshow of three photos drawn the two ways it is seen - an Instant View page, and a rich message
 * in a bubble, where it gets a frame - in the app's own styles inside a scrolling area, for a spec to
 * ask what the media viewer would close back into: the slide it was paged to may be one the
 * slideshow does not show.
 */
export function mountSlideshowMediaSource() {
  const scrollable = document.createElement('div');
  scrollable.className = 'scrollable scrollable-y';
  // * one under the other: a bubble's row reaches across the whole width, over anything beside it
  scrollable.style.cssText = 'position:absolute;inset:0;z-index:2;display:flex;flex-direction:column;align-items:center;gap:40px;padding:20px;background:white;';
  document.body.append(scrollable);

  const page: Page.page = {
    _: 'page',
    pFlags: {},
    url: '',
    blocks: [{
      _: 'pageBlockSlideshow',
      items: PHOTO_IDS.map((id): PageBlock => ({_: 'pageBlockPhoto', pFlags: {}, photo_id: id, caption: EMPTY_CAPTION})),
      caption: EMPTY_CAPTION
    }],
    photos: PHOTO_IDS.map((id): Photo.photo => ({
      _: 'photo',
      pFlags: {},
      id,
      access_hash: 0,
      file_reference: [],
      date: id,
      sizes: [{_: 'photoSize', type: 'x', w: 800, h: 600, size: 1000}],
      dc_id: 2
    })),
    documents: [],
    views: 0
  };

  const hosts = {} as Record<SlideshowSurface, HTMLElement>;
  const disposers = SURFACES.map((surface) => {
    const host = hosts[surface] = document.createElement('section');
    host.dataset.slideshowSurface = surface;
    host.style.cssText = 'width:480px;flex:0 0 480px;';
    let parent = host;
    if(surface === 'message') {
      // * as a chat draws it: the blocks of a rich message in a bubble
      const bubble = document.createElement('div');
      bubble.className = 'bubble';
      parent = document.createElement('div');
      parent.className = styles.RichMessageWrapper;
      // * the width a bubble's own layout gives it in a chat
      parent.style.width = '100%';
      bubble.append(parent);
      host.append(bubble);
    }

    scrollable.append(host);
    return render(() => HotReloadGuard({
      get children() {
        return InstantViewBlocks({
          webPageId: '0',
          page,
          class: surface === 'message' ? styles.RichMessage : undefined,
          paddings: surface === 'message' ? 0 : undefined,
          openNewPage: () => {},
          collapse: () => {}
        });
      }
    }), parent);
  });

  // * the press targets of the photos, in page order: what a click on one hands the viewer
  const media = (surface: SlideshowSurface) => [...hosts[surface].querySelectorAll<HTMLElement>('[role="button"]')];

  return {
    count: (surface: SlideshowSurface) => media(surface).length,
    /** For each photo, what the media viewer would do on closing with it current: fly into it, or fade. */
    closesInto(surface: SlideshowSurface) {
      return media(surface).map((ref) => {
        // * the viewer's target and source, as instantView's onMediaClick and setMoverToTarget pick them
        const target = (ref.querySelector(':scope > .media-container-aspecter') || ref.lastElementChild) as HTMLElement;
        return !!getMediaSourceClip(target.parentElement, target.getBoundingClientRect()).canCloseInto;
      });
    },
    destroy() {
      disposers.forEach((dispose) => dispose());
      scrollable.remove();
    }
  };
}

export type SlideshowMediaSourceHarness = ReturnType<typeof mountSlideshowMediaSource>;
