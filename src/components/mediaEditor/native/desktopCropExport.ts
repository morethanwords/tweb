import type {MediaEditorContextValue} from '@components/mediaEditor/context';
import {desktopCropGeometry, desktopCropView} from '@components/mediaEditor/native/desktopCropGeometry';
import {validateDesktopExpandedCrop} from '@components/mediaEditor/native/desktopExpandedCrop';
import {hasUnsupportedDesktopCropLayers} from '@components/mediaEditor/native/desktopCropAvailability';
import {desktopCropSource} from '@components/mediaEditor/native/desktopCropSource';

/** Presence owns output, even if invalid or unavailable. Never migrate/fall back. */
export function getDesktopCropExport(context: MediaEditorContextValue, sourceSize = context.editorState.mediaSize) {
  const {mediaState} = context;
  if(!Object.prototype.hasOwnProperty.call(mediaState, 'desktopExpandedCrop')) return;
  if(!context.canUseDesktopExpandedCrop || context.mediaType !== 'image' || context.isEditingForAvatar ||
    mediaState.nativeVideoQuality || hasUnsupportedDesktopCropLayers(mediaState.resizableLayers)) {
    throw new Error('Expanded crop supports static non-avatar images only; reset the crop first');
  }
  const descriptor = validateDesktopExpandedCrop(mediaState.desktopExpandedCrop, sourceSize);
  if(context.desktopCropCandidate) {
    const facts = desktopCropSource(context).facts();
    if(!facts || facts.mediaSrc !== context.mediaSrc || facts.width !== sourceSize[0] || facts.height !== sourceSize[1]) {
      throw new Error('Expanded crop qualified source mismatch');
    }
  }
  const geometry = desktopCropGeometry(descriptor, sourceSize, mediaState.rotation, mediaState.flip);
  return {descriptor, geometry};
}

export function getDesktopCropOutputView(context: MediaEditorContextValue, width: number, height: number, sourceSize = context.editorState.mediaSize) {
  const crop = getDesktopCropExport(context, sourceSize);
  if(!crop) return;
  return desktopCropView(crop.descriptor, context.mediaState.rotation, context.mediaState.flip,
    {x: 0, y: 0, width, height});
}
