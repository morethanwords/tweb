import type {BrushType, MediaEditorContextValue} from '@components/mediaEditor/context';
import {getBrushStateBank} from '@components/mediaEditor/native/brushStateBank';
import {brushDefaults} from '@components/mediaEditor/utils';

// Android Brush.java defaults are opaque ARGB colors; CSS stores RGBA.
export const androidBrushColors: Record<BrushType, string> = {
  pen: '#ff453a',
  arrow: '#ff8a00',
  brush: '#ffd60a',
  neon: '#34c759',
  blur: '#000000',
  eraser: '#000000'
};

export function getAndroidBrushBank(context: Pick<MediaEditorContextValue, 'editorState' | 'mediaState'>) {
  // Working preferences only. Keep tweb's CSS widths: Android's native weights
  // and physical stamp sizes are not equivalent, and persistence is not ported.
  return getBrushStateBank(context, 'android', brush => ({color: androidBrushColors[brush], size: brushDefaults.size}));
}
