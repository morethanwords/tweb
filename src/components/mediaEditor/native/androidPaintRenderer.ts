import {createAndroidPaintComposition} from '@components/mediaEditor/webgl/androidPaintComposition';
import type {AndroidPaintSource} from '@components/mediaEditor/webgl/androidPaintComposition';
import {createAndroidStampRenderer} from '@components/mediaEditor/webgl/androidStamps';
import {loadAndroidStampImages} from '@components/mediaEditor/webgl/androidStampsAssets';
import type {AndroidPaintDocument, AndroidPaintOperation} from '@components/mediaEditor/native/androidPaintDocument';
import {readAndroidPaintDocument} from '@components/mediaEditor/native/androidPaintDocument';
import type {AndroidStamp} from '@components/mediaEditor/webgl/androidStampsContract';
import {cleanupWebGl} from '@components/mediaEditor/utils';

type StrokeDescriptor = Extract<AndroidPaintOperation, {kind: 'stroke' | 'erase'}>['descriptor'];

/** One context owns committed paint, scratch mask, and the borrowed preview.
 * No image or entities ever enter it. GPU success precedes document/history install.
 * Rebuilding is explicit on history/checkpoint changes, never per pointer sample.
 */
export async function createAndroidPaintRenderer(documentValue: AndroidPaintDocument) {
  const document = readAndroidPaintDocument(documentValue);
  const canvas = window.document.createElement('canvas');
  [canvas.width, canvas.height] = document.context.paintingSize;
  const gl = canvas.getContext('webgl', {alpha: true, premultipliedAlpha: false, preserveDrawingBuffer: true});
  if(!gl) throw new Error('Android paint requires WebGL');
  let composition: ReturnType<typeof createAndroidPaintComposition>;
  let stamps: ReturnType<typeof createAndroidStampRenderer>;
  let disposed = false;
  const dispose = () => {
    if(disposed) return;
    disposed = true;
    stamps?.dispose();
    composition?.dispose();
    cleanupWebGl(gl);
  };
  try {
    const images = await loadAndroidStampImages();
    try {
      composition = createAndroidPaintComposition(gl);
      stamps = createAndroidStampRenderer(gl, images);
    } finally {
      Object.values(images).forEach(image => image.close());
    }
    let committed: AndroidPaintSource = composition.clear(canvas.width, canvas.height);
    let preview = committed;
    let stroke: StrokeDescriptor;
    const check = () => {
      if(disposed || gl.isContextLost() || gl.getError() !== gl.NO_ERROR) throw new Error('Android paint GPU unavailable');
    };
    const present = () => {
      composition.present(preview, {kind: 'straight-canvas', orientation: 'logical-top-left'});
      check();
    };
    const compositeStroke = () => {
      if(stroke.tool === 'eraser') {
        preview = composition.apply(committed, {kind: 'native-erase', mask: stamps.eraseMask(), alpha: stroke.color[3] / 255});
      } else {
        const target = composition.stampTarget(committed);
        stamps.composite(committed.texture, target.framebuffer);
        preview = target.source;
      }
      present();
    };
    const apply = (operation: AndroidPaintOperation) => {
      if(operation.kind === 'shape') {
        preview = composition.apply(committed, {kind: 'shape-over', shape: operation.geometry, rgba: operation.rgba});
        present();
      } else {
        stroke = operation.descriptor;
        stamps.begin(stroke);
        stamps.append(operation.stamps);
        compositeStroke();
        stroke = undefined;
      }
      committed = preview;
    };
    for(const operation of document.operations) apply(operation);
    present(); // Resource/clear/presentation preflight even for an empty document.
    return {
      canvas,
      begin(descriptor: StrokeDescriptor) {
        check();
        stamps.begin(descriptor);
        stroke = descriptor;
        preview = committed;
      },
      append(batch: readonly AndroidStamp[]) {
        if(!stroke) throw new Error('No active Android paint stroke');
        stamps.append(batch);
        compositeStroke();
      },
      previewShape(operation: Extract<AndroidPaintOperation, {kind: 'shape'}>) {
        preview = composition.apply(committed, {kind: 'shape-over', shape: operation.geometry, rgba: operation.rgba});
        present();
      },
      /** The caller installs the validated immutable core change synchronously. */
      commit() {
        check();
        committed = preview;
        stroke = undefined;
      },
      cancel() {
        stroke = undefined;
        preview = committed;
        present();
      },
      dispose
    };
  } catch(error) {
    dispose();
    throw error;
  }
}
