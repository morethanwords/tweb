import {i18n} from '@lib/langPack';

export type AdjustmentsConfig = typeof adjustmentsConfig;

export type AdjustmentKey = AdjustmentsConfig[number]['key'];

export const adjustmentsConfig = [
  {
    key: 'enhance',
    uniform: 'uEnhance',
    label: () => i18n('MediaEditor.Adjustments.Enhance'),
    labelKey: 'MediaEditor.Adjustments.Enhance',
    to100: true
  },
  {
    key: 'brightness',
    uniform: 'uBrightness',
    label: () => i18n('MediaEditor.Adjustments.Brightness'),
    labelKey: 'MediaEditor.Adjustments.Brightness',
    to100: false
  },
  {
    key: 'contrast',
    uniform: 'uContrast',
    label: () => i18n('MediaEditor.Adjustments.Contrast'),
    labelKey: 'MediaEditor.Adjustments.Contrast',
    to100: false
  },
  {
    key: 'saturation',
    uniform: 'uSaturation',
    label: () => i18n('MediaEditor.Adjustments.Saturation'),
    labelKey: 'MediaEditor.Adjustments.Saturation',
    to100: false
  },
  {
    key: 'warmth',
    uniform: 'uWarmth',
    label: () => i18n('MediaEditor.Adjustments.Warmth'),
    labelKey: 'MediaEditor.Adjustments.Warmth',
    to100: false
  },
  {
    key: 'fade',
    uniform: 'uFade',
    label: () => i18n('MediaEditor.Adjustments.Fade'),
    labelKey: 'MediaEditor.Adjustments.Fade',
    to100: true
  },
  {
    key: 'highlights',
    uniform: 'uHighlights',
    label: () => i18n('MediaEditor.Adjustments.Highlights'),
    labelKey: 'MediaEditor.Adjustments.Highlights',
    to100: false
  },
  {
    key: 'shadows',
    uniform: 'uShadows',
    label: () => i18n('MediaEditor.Adjustments.Shadows'),
    labelKey: 'MediaEditor.Adjustments.Shadows',
    to100: false
  },
  {
    key: 'vignette',
    uniform: 'uVignette',
    label: () => i18n('MediaEditor.Adjustments.Vignette'),
    labelKey: 'MediaEditor.Adjustments.Vignette',
    to100: true
  },
  {
    key: 'grain',
    uniform: 'uGrain',
    label: () => i18n('MediaEditor.Adjustments.Grain'),
    labelKey: 'MediaEditor.Adjustments.Grain',
    to100: true
  },
  {
    key: 'sharpen',
    uniform: 'uSharpen',
    label: () => i18n('MediaEditor.Adjustments.Sharpen'),
    labelKey: 'MediaEditor.Adjustments.Sharpen',
    to100: true
  }
] as const;
