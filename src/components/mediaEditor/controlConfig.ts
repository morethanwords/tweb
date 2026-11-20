import type {FontKey} from '@components/mediaEditor/types';
import type {LangPackKey} from '@lib/langPack';

export const textSizeMin = 16;
export const textSizeMax = 64;
export const brushSizeMin = 2;
export const brushSizeMax = 32;

export const editorFonts: {font: FontKey; label: LangPackKey}[] = [
  {font: 'roboto', label: 'MediaEditor.Fonts.Roboto'},
  {font: 'suez', label: 'MediaEditor.Fonts.SuezOne'},
  {font: 'fugaz', label: 'MediaEditor.Fonts.FugazOne'},
  {font: 'courier', label: 'MediaEditor.Fonts.CourierPrime'},
  {font: 'chewy', label: 'MediaEditor.Fonts.Chewy'},
  {font: 'sedan', label: 'MediaEditor.Fonts.Sedan'},
  {font: 'bubbles', label: 'MediaEditor.Fonts.RubikBubbles'},
  {font: 'playwrite', label: 'MediaEditor.Fonts.Playwrite'}
];

export const textAlignments: {value: string; icon: Icon; label: LangPackKey; frame: number}[] = [
  {value: 'left', icon: 'align_left', label: 'MediaEditor.AlignLeft', frame: 20},
  {value: 'center', icon: 'align_center', label: 'MediaEditor.AlignCenter', frame: 0},
  {value: 'right', icon: 'align_right', label: 'MediaEditor.AlignRight', frame: 40}
];

export const textStyles: {value: string; icon: Icon; label: LangPackKey}[] = [
  {value: 'normal', icon: 'fontframe_filled', label: 'MediaEditor.TextStyle.Normal'},
  {value: 'outline', icon: 'fontframe', label: 'MediaEditor.TextStyle.Outline'},
  {value: 'background', icon: 'fontframe_bg_filled', label: 'MediaEditor.TextStyle.Background'}
];

/** Android TextPaintView types 0…3; legacy saved styles above retain their own appearance. */
export const nativeTextStyles: {value: string; label: LangPackKey}[] = [
  {value: 'framed', label: 'MediaEditor.TextStyle.Framed'},
  {value: 'semi-transparent', label: 'MediaEditor.TextStyle.SemiTransparent'},
  {value: 'opaque', label: 'MediaEditor.TextStyle.Opaque'},
  {value: 'plain', label: 'MediaEditor.TextStyle.Plain'}
];
