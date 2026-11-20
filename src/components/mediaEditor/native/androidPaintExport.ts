import type {MediaEditorContextValue} from '@components/mediaEditor/context';
import {hasAndroidPaint} from '@components/mediaEditor/native/androidPaintSession';
import {readAndroidPaintDocument} from '@components/mediaEditor/native/androidPaintDocument';
import {unwrap} from 'solid-js/store';
import StickerType from '@config/stickerType';
import {androidPaintWebPolicy} from '@components/mediaEditor/native/androidPaintAdapter';

/** Presence owns dispatch, even for null, unknown version or malformed imports. */
export function getAndroidPaintExport(context: MediaEditorContextValue) {
  if(!hasAndroidPaint(context)) {
    if(context.nativePaint?.ownsDispatch()) throw new Error('Android painting document unavailable; legacy export is forbidden');
    return;
  }
  const document = readAndroidPaintDocument(structuredClone(unwrap(context.mediaState.androidPaintDocument)));
  if(document.context.androidDensity !== androidPaintWebPolicy.density || document.context.paintingSize.some(size => size > androidPaintWebPolicy.cap) ||
    context.mediaType !== 'image' || context.isEditingForAvatar || context.isVideoAvatarMode ||
    context.imageType && !['image/png', 'image/jpeg'].includes(context.imageType) ||
    context.mediaState.brushDrawnLines.length || context.mediaState.resizableLayers.some(layer =>
      layer.type === 'shape' || layer.type === 'sticker' && layer.sticker?.sticker !== StickerType.Static)) {
    context.nativePaint?.rejectAnimated();
    throw new Error('android-paint-v1 supports new still photos with PNG/JPEG output only');
  }
  return document;
}
