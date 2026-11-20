import {ObjectURLScope} from '@helpers/objectUrlScope';
import getFileMimeType from '@helpers/files/getFileMimeType';
import {
  isAllowedStaticImageMime,
  validStaticImageSize,
  validateStaticImageLayerBlob
} from '@components/mediaEditor/imageLayer/source';
import type {StaticImageLayerPayloadV1, StaticImageSourceInfoV1} from '@components/mediaEditor/imageLayer/source';

export type StaticImageLayerResource = {
  bitmap: ImageBitmap;
  /** Ephemeral only. Preview/export should draw bitmap, the identical oriented decode. */
  url: string;
};

/** One instance per editor session, disposed with it. Undo/delete does NOT release
 * an entry: redo/history/checkpoints can still reference its Blob. A reopened
 * editor builds a new instance from the saved payloads, not the old URLs/bitmaps.
 */
export function createStaticImageLayerResources(
  decode: (blob: Blob) => Promise<ImageBitmap> = blob => createImageBitmap(blob, {imageOrientation: 'from-image'})
) {
  const urls = new ObjectURLScope();
  const pending = new WeakMap<Blob, {mimeType: string; work: Promise<StaticImageLayerResource>}>();
  // History uses structuredClone: equal Blobs come back as different JS objects.
  // Key decoded resources by bytes too, so repeated undo/redo does not retain a
  // fresh bitmap each time. Hashing/validation is per edit/load, never per frame.
  const contents = new Map<string, Promise<StaticImageLayerResource>>();
  const live = new Set<StaticImageLayerResource>();
  let disposed = false;
  const checkAlive = () => {
    if(disposed) throw new DOMException('Image layer session ended', 'AbortError');
  };
  const load = (blob: Blob, mimeType: string): Promise<StaticImageLayerResource> => {
    checkAlive();
    if(!isAllowedStaticImageMime(mimeType)) return Promise.reject(new TypeError('Unsupported local image'));
    const previous = pending.get(blob);
    if(previous) {
      if(previous.mimeType !== mimeType) return Promise.reject(new TypeError('Image layer MIME changed'));
      return previous.work;
    }
    const work = (async() => {
      const bytes = await validateStaticImageLayerBlob(blob, mimeType);
      checkAlive();
      const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
      const key = mimeType + ':' + Array.from(hash, byte => byte.toString(16)).join('.');
      checkAlive();
      let shared = contents.get(key);
      if(!shared) {
        shared = (async() => {
          const bitmap = await decode(blob);
          let retained = false;
          try {
            checkAlive();
            if(!validStaticImageSize(bitmap.width, bitmap.height)) throw new RangeError('Invalid image layer dimensions');
            const resource = {bitmap, url: urls.create(blob)};
            live.add(resource);
            retained = true;
            return resource;
          } finally {
            if(!retained) bitmap.close();
          }
        })();
        contents.set(key, shared);
        void shared.catch(() => contents.delete(key));
      }
      return shared;
    })();
    pending.set(blob, {mimeType, work});
    void work.catch(() => pending.delete(blob));
    return work;
  };

  return {
    async prepare(blob: Blob, source: StaticImageSourceInfoV1): Promise<StaticImageLayerPayloadV1> {
      const mimeType = getFileMimeType(blob);
      if(!isAllowedStaticImageMime(mimeType)) throw new TypeError('Unsupported local image');
      const {bitmap} = await load(blob, mimeType);
      checkAlive();
      // Copy only the declared source metadata. Never persist caller-supplied URLs or handles.
      return {
        version: 1, blob, mimeType, width: bitmap.width, height: bitmap.height,
        source: {kind: source.kind, ...(source.name === undefined ? {} : {name: source.name}),
          ...(source.lastModified === undefined ? {} : {lastModified: source.lastModified})}
      };
    },
    async resolve(payload: StaticImageLayerPayloadV1): Promise<StaticImageLayerResource> {
      if(payload?.version !== 1 || !validStaticImageSize(payload.width, payload.height)) throw new TypeError('Invalid image layer payload');
      const resource = await load(payload.blob, payload.mimeType);
      checkAlive();
      if(resource.bitmap.width !== payload.width || resource.bitmap.height !== payload.height) {
        throw new TypeError('Image layer dimensions changed');
      }
      return resource;
    },
    dispose() {
      if(disposed) return;
      disposed = true;
      for(const {bitmap} of live) bitmap.close();
      live.clear();
      contents.clear();
      urls.dispose();
    }
  };
}
