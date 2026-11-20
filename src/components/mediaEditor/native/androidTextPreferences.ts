import {androidEditorFonts} from '@components/mediaEditor/fonts';
import {nativeTextStyles, textAlignments} from '@components/mediaEditor/controlConfig';
import type {TextLayerInfo} from '@components/mediaEditor/types';
import {isAndroidEditorColor} from '@components/mediaEditor/native/androidPalette';

export type AndroidTextPreferences = Pick<TextLayerInfo, 'font' | 'style' | 'alignment' | 'color'>;

// Android 21f7d109 PersistColorPalette.java:68-75,205-209. Native "roboto"
// maps to our versioned bundled Android face, not the legacy web font ID.
export function normalizeAndroidTextPreferences(saved?: {font?: string; style?: string; alignment?: string; color?: string}): AndroidTextPreferences {
  return {
    font: androidEditorFonts.find(item => item.font === saved?.font)?.font ?? 'android-roboto',
    style: nativeTextStyles.find(item => item.value === saved?.style)?.value ?? 'framed',
    alignment: textAlignments.find(item => item.value === saved?.alignment)?.value ?? 'left',
    // The native palette is ARGB; Web K's editor uses hex CSS RGBA, including
    // alpha. Do not accept arbitrary CSS or rewrite unknown saved preferences.
    color: isAndroidEditorColor(saved?.color) ? saved.color : '#ffffff'
  };
}
