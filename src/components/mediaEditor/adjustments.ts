import {i18n} from '../../lib/langPack';

export type AdjustmentsConfig = typeof adjustmentsConfig;

export type AdjustmentKey = AdjustmentsConfig[number]['key'];

export const adjustmentsConfig = [
  {
    key: 'enhance',
    uniform: 'uEnhance',
    label: () => i18n('MediaEditor.Adjustments.Enhance'),
    to100: true
  },
  {
    key: 'brightness',
    uniform: 'uBrightness',
    label: () => i18n('MediaEditor.Adjustments.Brightness'),
    to100: false
  },
  {
    key: 'contrast',
    uniform: 'uContrast',
    label: () => i18n('MediaEditor.Adjustments.Contrast'),
    to100: false
  },
  {
    key: 'saturation',
    uniform: 'uSaturation',
    label: () => i18n('MediaEditor.Adjustments.Saturation'),
    to100: false
  },
  {
    key: 'warmth',
    uniform: 'uWarmth',
    label: () => i18n('MediaEditor.Adjustments.Warmth'),
    to100: false
  },
  {
    key: 'fade',
    uniform: 'uFade',
    label: () => i18n('MediaEditor.Adjustments.Fade'),
    to100: true
  },
  {
    key: 'highlights',
    uniform: 'uHighlights',
    label: () => i18n('MediaEditor.Adjustments.Highlights'),
    to100: false
  },
  {
    key: 'shadows',
    uniform: 'uShadows',
    label: () => i18n('MediaEditor.Adjustments.Shadows'),
    to100: false
  },
  {
    key: 'vignette',
    uniform: 'uVignette',
    label: () => i18n('MediaEditor.Adjustments.Vignette'),
    to100: true
  },
  {
    key: 'grain',
    uniform: 'uGrain',
    label: () => i18n('MediaEditor.Adjustments.Grain'),
    to100: true
  },
  {
    key: 'sharpen',
    uniform: 'uSharpen',
    label: () => i18n('MediaEditor.Adjustments.Sharpen'),
    to100: true
  }
] as const;
