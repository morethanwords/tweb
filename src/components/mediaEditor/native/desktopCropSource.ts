import {createSignal} from 'solid-js';
import type {MediaEditorContextValue} from '@components/mediaEditor/context';
import {createStaticImageLayerResources} from '@components/mediaEditor/imageLayer/resources';
import type {StaticImageLayerPayloadV1} from '@components/mediaEditor/imageLayer/source';
import {hasUnsupportedDesktopCropLayers} from '@components/mediaEditor/native/desktopCropAvailability';
import {unwrap} from 'solid-js/store';
import {validateDesktopExpandedCrop} from '@components/mediaEditor/native/desktopExpandedCrop';
import {desktopCropOrientation} from '@components/mediaEditor/native/desktopCropGeometry';
import {getManagersSession, isSessionLeaving} from '@lib/accounts/getCurrentAccount';

/** Compare the streamed preview against the already validated, bounded input.
 * Never trust Content-Length or buffer a second response-sized Blob. Reject an
 * overflowing chunk before copying/inspecting it and cancel on every failure.
 */
async function verifyPreviewBytes(response: Response, blob: Blob) {
  const reader = response.body?.getReader();
  if(!reader) throw new Error('Expanded crop source stream unavailable');
  let complete = false;
  try {
    if(!response.ok) throw new Error('Expanded crop source unavailable');
    const expected = new Uint8Array(await blob.arrayBuffer());
    let offset = 0;
    while(true) {
      const {value, done} = await reader.read();
      if(done) {
        if(offset !== expected.length) throw new Error('Expanded crop source bytes changed');
        complete = true;
        return;
      }
      if(value.byteLength > expected.length - offset) throw new Error('Expanded crop source bytes changed');
      for(let i = 0; i < value.byteLength; ++i) {
        if(value[i] !== expected[offset + i]) throw new Error('Expanded crop source bytes changed');
      }
      offset += value.byteLength;
    }
  } finally {
    try {
      if(!complete) await reader.cancel();
    } catch{
      // An aborted/errored stream can reject cancellation too. Preserve the
      // original read/validation error, and always release the reader's lock.
    } finally {
      reader.releaseLock();
    }
  }
}

export type DesktopCropSourceFacts = Readonly<{
  mimeType: StaticImageLayerPayloadV1['mimeType'];
  width: number;
  height: number;
  blob: Blob;
  mediaSrc: string;
}>;

/** Reuses the image importer's MIME/signature/APNG/byte/pixel checks AND its
 * oriented decoder. MIME metadata alone, an image URL or mediaType is not proof.
 * Temporary decoded resources are released on success and on every rejection.
 */
export async function qualifyDesktopCropInput(blob: Blob, size: readonly [number, number], mediaSrc: string,
  decode?: (blob: Blob) => Promise<ImageBitmap>): Promise<DesktopCropSourceFacts> {
  const resources = createStaticImageLayerResources(decode);
  try {
    const payload = await resources.prepare(blob, {kind: 'file'});
    if(payload.width !== size[0] || payload.height !== size[1]) throw new Error('Expanded crop decoded source mismatch');
    return {blob, mimeType: payload.mimeType, width: payload.width, height: payload.height, mediaSrc};
  } finally {
    resources.dispose();
  }
}

function createQualification() {
  const [facts, setFacts] = createSignal<DesktopCropSourceFacts>();
  let work: Promise<void>;
  return {facts, async qualify(context: MediaEditorContextValue, size: readonly [number, number], alive = () => true) {
    if(work) return work;
    if(!context.desktopCropScopeEligible || !context.desktopCropCandidate || context.mediaType !== 'image' ||
      context.isEditingForAvatar || hasUnsupportedDesktopCropLayers(context.mediaState.resizableLayers)) {
      throw new Error('Ineligible expanded crop source');
    }
    const mediaSrc = context.mediaSrc;
    const session = context.managers && getManagersSession(context.managers);
    const isAlive = () => alive() && (!session || !isSessionLeaving(session));
    const snapshot = JSON.stringify(unwrap(context.mediaState));
    work = (async() => {
      if(!isAlive()) throw new Error('Expanded crop source session changed');
      const blob = await context.getMediaBlob();
      if(!isAlive()) throw new Error('Expanded crop source session changed');
      const result = await qualifyDesktopCropInput(blob, size, mediaSrc);
      // The callback's Blob and the actual preview URL must identify the same
      // bytes, not merely two images with equal dimensions. This is once at load,
      // never on a draw/drag path. Fetch only the source the editor already loaded.
      const response = await fetch(mediaSrc);
      await verifyPreviewBytes(response, blob);
      if(!isAlive() || context.mediaSrc !== mediaSrc || JSON.stringify(unwrap(context.mediaState)) !== snapshot ||
        hasUnsupportedDesktopCropLayers(context.mediaState.resizableLayers)) {
        throw new Error('Expanded crop source changed or contains animated layers');
      }
      desktopCropOrientation(context.mediaState.rotation, context.mediaState.flip);
      if(Object.prototype.hasOwnProperty.call(context.mediaState, 'desktopExpandedCrop')) {
        validateDesktopExpandedCrop(context.mediaState.desktopExpandedCrop, size);
      }
      setFacts(result);
    })();
    return work;
  }};
}

const qualifications = new WeakMap<MediaEditorContextValue, ReturnType<typeof createQualification>>();
export function desktopCropSource(context: MediaEditorContextValue) {
  let source = qualifications.get(context);
  if(!source) qualifications.set(context, source = createQualification());
  return source;
}
