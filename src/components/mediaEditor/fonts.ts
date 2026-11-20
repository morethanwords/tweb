import type {AndroidFontKey, DesktopFontKey, FontInfo} from '@components/mediaEditor/types';
import type {LangPackKey} from '@lib/langPack';

type EditorFont<Key> = {font: Key; label: LangPackKey};

// PaintTypeface.java:36–43 at Android 21f7d109. Optional device fonts are not bundled.
export const androidEditorFonts: EditorFont<AndroidFontKey>[] = [
  {font: 'android-roboto', label: 'MediaEditor.Fonts.Roboto'},
  {font: 'android-italic', label: 'MediaEditor.Fonts.Italic'},
  {font: 'android-serif', label: 'MediaEditor.Fonts.Serif'},
  {font: 'android-condensed', label: 'MediaEditor.Fonts.Condensed'},
  {font: 'android-mono', label: 'MediaEditor.Fonts.Monospace'},
  {font: 'android-merriweather', label: 'MediaEditor.Fonts.Merriweather'}
];

// TextTypeface / TextFont at Desktop a532622be61ffb811c34311583c9fd4828786833.
export const desktopEditorFonts: EditorFont<DesktopFontKey>[] = [
  {font: 'desktop-default', label: 'MediaEditor.Fonts.Default'},
  {font: 'desktop-italic', label: 'MediaEditor.Fonts.Italic'},
  {font: 'desktop-serif', label: 'MediaEditor.Fonts.Serif'},
  {font: 'desktop-condensed', label: 'MediaEditor.Fonts.Condensed'},
  {font: 'desktop-monospace', label: 'MediaEditor.Fonts.Monospace'}
];

export const nativeFontInfoMap: Record<AndroidFontKey | DesktopFontKey, FontInfo> = {
  // Android API >=26 labels the actual Medium outlines as weight 700. These
  // aliases bind those exact outlines at 700 rather than synthesizing bold.
  'android-roboto': {fontFamily: '\'Editor Android Roboto\'', fontWeight: 700, baseline: 0.75},
  'android-italic': {fontFamily: '\'Editor Android Roboto\'', fontWeight: 700, fontStyle: 'italic', baseline: 0.75},
  // Android resolves serif on the device. Browser serif is an explicit fallback,
  // not an assertion of identical Android glyphs (see assets' PROVENANCE.md).
  'android-serif': {fontFamily: 'serif', fontWeight: 700, baseline: 0.75},
  'android-condensed': {fontFamily: '\'Editor Android Condensed\'', fontWeight: 700, baseline: 0.75},
  'android-mono': {fontFamily: '\'Editor Android Mono\'', fontWeight: 400, baseline: 0.75},
  'android-merriweather': {fontFamily: '\'Editor Android Merriweather\'', fontWeight: 700, baseline: 0.75},
  // Qt's default QFont is platform-resolved. system-ui is the browser-side
  // platform default, not a portable claim about which family Qt picks.
  'desktop-default': {fontFamily: 'system-ui', fontWeight: 600, baseline: 0.75},
  'desktop-italic': {fontFamily: 'system-ui', fontWeight: 600, fontStyle: 'italic', baseline: 0.75},
  'desktop-serif': {fontFamily: 'serif', fontWeight: 600, baseline: 0.75},
  // Preserve the source's 78% request as metadata. Do not apply CSS-only
  // stretch: it would disagree with canvas export and is not Qt's scaling.
  'desktop-condensed': {fontFamily: 'system-ui', fontWeight: 600, fontStretch: 78, baseline: 0.75},
  'desktop-monospace': {fontFamily: 'monospace', fontWeight: 600, baseline: 0.75}
};

export function getEditorFontCss(info: FontInfo, size: number) {
  return `${info.fontStyle || 'normal'} ${info.fontWeight} ${size}px ${info.fontFamily}`;
}

// Unlike the app's loadFonts helper this accepts an editor-specific face and
// does not race a timeout: an export must never silently bake fallback glyphs.
export function loadEditorFont(info: FontInfo, size: number, text: string, ownerDocument = document): Promise<FontFace[]> {
  if(!ownerDocument.fonts) return Promise.resolve([]);
  return ownerDocument.fonts.load(getEditorFontCss(info, size), text || ' ');
}
