import {hasLoadedURL} from '@helpers/dom/loadedUrlCache';
import {isObjectURL} from '@helpers/objectUrlUtils';

export type SnapshotImageSource = Pick<
  HTMLImageElement,
  'complete' | 'currentSrc' | 'naturalWidth' | 'src'
>;

// * The mover normally reuses a rendered <img> by copying its src into a fresh
// * Image(), which costs nothing because the browser already decoded that
// * resource. That breaks for a worker-owned blob URL the LRU has dropped: the
// * source element keeps painting its decoded bitmap, but the URL no longer
// * resolves, so the copy stays empty for the whole opening transition. The
// * decoded bitmap outlives revocation — snapshot it onto a canvas instead
// * whenever the URL is not provably still alive.
export default function shouldSnapshotImage(image: SnapshotImageSource) {
  const url = image.currentSrc || image.src;
  if(!isObjectURL(url) || hasLoadedURL(url)) {
    return false;
  }

  // * nothing to snapshot yet (or ever) — a copy of the src is no worse
  return image.complete && image.naturalWidth > 0;
}
