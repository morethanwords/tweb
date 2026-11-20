import {batch} from 'solid-js';
import type {MediaEditorContextValue} from '@components/mediaEditor/context';
import type {ImageLayerInfo, NumberPair, ResizableLayer} from '@components/mediaEditor/types';
import invertCanvasTransform from '@components/mediaEditor/canvas/invertCanvasTransform';
import insertResizableLayer from '@components/mediaEditor/insertResizableLayer';
import {imageLayerSession} from '@components/mediaEditor/imageLayer/session';
import {selectStaticImageLayerFile, STATIC_IMAGE_LAYER_ACCEPT} from '@components/mediaEditor/imageLayer/source';
import type {StaticImageSourceInfoV1} from '@components/mediaEditor/imageLayer/source';
import requestFile from '@helpers/files/requestFile';
import getFilesFromEvent from '@helpers/files/getFilesFromEvent';
import {desktopActionsForCreation} from '@components/mediaEditor/native/desktopObjectActions';

/** Native creation geometry; never recomputed when the responsive shell changes. */
export function imageLayerFrame(ratio: number, area: NumberPair, mobile: boolean): Pick<ImageLayerInfo, 'displayWidth' | 'displayHeight'> {
  const width = ratio > 1 ? Math.floor(area[0] * .5) : Math.floor(area[1] * .5) * ratio;
  const displayWidth = mobile ? width : Math.trunc(Math.min(width, area[0], area[1] * ratio));
  return {displayWidth, displayHeight: displayWidth / ratio};
}

const importers = new WeakMap<MediaEditorContextValue, ReturnType<typeof createImageLayerImporter>>();
export const getImageLayerImporter = (context: MediaEditorContextValue) => importers.get(context);

export function createImageLayerImporter(context: MediaEditorContextValue, options: {
  mobile: () => boolean;
  valid: () => boolean;
  enterPaint: () => void;
  report: (error: unknown) => void;
}) {
  let generation = 0, pending = false, chooser: AbortController;
  const session = imageLayerSession(context);
  const valid = (token: number) => token === generation && !session.closed && options.valid();
  const add = async(files: readonly File[], kind: StaticImageSourceInfoV1['kind']) => {
    if(!files.length || pending || !options.valid() || session.closed) return;
    const file = selectStaticImageLayerFile(files);
    if(!file) throw new TypeError('Choose exactly one local JPEG or static PNG (up to 32 MiB)');
    const token = generation;
    const mobile = options.mobile();
    pending = true;
    try {
      const image = await session.resources.prepare(file, {kind, name: file.name, lastModified: file.lastModified});
      if(!valid(token)) return;
      const textWork = context.textSessions.finish();
      if(textWork) await textWork;
      if(!valid(token)) return;
      const {editorState} = context;
      const {mediaSize, canvasSize, finalTransform: transform, pixelRatio} = editorState;
      if(!mediaSize || !canvasSize || !(transform.scale > 0)) return;
      const area: NumberPair = mobile ? [canvasSize[0] * pixelRatio / transform.scale, canvasSize[1] * pixelRatio / transform.scale] : [...mediaSize];
      const layer: ResizableLayer = {
        id: context.resizableLayersSeed++, type: 'image', image,
        ...desktopActionsForCreation(context, mobile),
        ...(!mobile && !context.isEditingForAvatar && !context.isVideoAvatarMode ? {imageReflection: {version: 1, horizontal: false}} : {}),
        ...imageLayerFrame(image.width / image.height, area, mobile),
        position: invertCanvasTransform([0, 0], transform), rotation: -transform.rotation, scale: 1
      };
      batch(() => {
        options.enterPaint();
        editorState.drawingShape = undefined;
        editorState.currentTab = 'layers';
        insertResizableLayer(context, layer);
      });
    } finally {
      pending = false;
    }
  };
  const importer = {
    add,
    async fromEvent(event: ClipboardEvent | DragEvent) {
      const token = generation;
      try {
        const files = await getFilesFromEvent(event, false, false);
        if(valid(token)) await add(files, event.type === 'paste' ? 'clipboard' : 'drop');
      } catch(error) {
        if(valid(token) && (error as Error)?.name !== 'AbortError') options.report(error);
      }
    },
    async choose(doc: Document) {
      if(pending || chooser || !options.valid()) return;
      const token = generation;
      const controller = chooser = new AbortController();
      try {
        const file = await requestFile(STATIC_IMAGE_LAYER_ACCEPT, {document: doc, signal: controller.signal});
        if(file && valid(token)) await add([file], 'file');
      } catch(error) {
        if(error !== 'NO_FILE_SELECTED' && valid(token) && (error as Error)?.name !== 'AbortError') options.report(error);
      } finally {
        if(chooser === controller) chooser = undefined;
      }
    },
    cancel() {
      generation++;
      chooser?.abort();
      chooser = undefined;
    }
  };
  importers.set(context, importer);
  return importer;
}
