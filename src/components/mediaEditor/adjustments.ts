import {createSignal} from 'solid-js';
import {i18n} from '../../lib/langPack';

export type AdjustmentsConfig = ReturnType<typeof createAdjustmentsConfig>;

export const createAdjustmentsConfig = () =>
  [
    {
      key: 'enhance',
      signal: createSignal(0),
      uniform: 'uEnhance',
      label: () => i18n('MediaEditor.Adjustments.Enhance'),
      to100: true
    },
    {
      key: 'brightness',
      signal: createSignal(0),
      uniform: 'uBrightness',
      label: () => i18n('MediaEditor.Adjustments.Brightness'),
      to100: false
    },
    {
      key: 'contrast',
      signal: createSignal(0),
      uniform: 'uContrast',
      label: () => i18n('MediaEditor.Adjustments.Contrast'),
      to100: false
    },
    {
      key: 'saturation',
      signal: createSignal(0),
      uniform: 'uSaturation',
      label: () => i18n('MediaEditor.Adjustments.Saturation'),
      to100: false
    },
    {
      key: 'warmth',
      signal: createSignal(0),
      uniform: 'uWarmth',
      label: () => i18n('MediaEditor.Adjustments.Warmth'),
      to100: false
    },
    {
      key: 'fade',
      signal: createSignal(0),
      uniform: 'uFade',
      label: () => i18n('MediaEditor.Adjustments.Fade'),
      to100: true
    },
    {
      key: 'highlights',
      signal: createSignal(0),
      uniform: 'uHighlights',
      label: () => i18n('MediaEditor.Adjustments.Highlights'),
      to100: false
    },
    {
      key: 'shadows',
      signal: createSignal(0),
      uniform: 'uShadows',
      label: () => i18n('MediaEditor.Adjustments.Shadows'),
      to100: false
    },
    {
      key: 'vignette',
      signal: createSignal(0),
      uniform: 'uVignette',
      label: () => i18n('MediaEditor.Adjustments.Vignette'),
      to100: true
    },
    {
      key: 'grain',
      signal: createSignal(0),
      uniform: 'uGrain',
      label: () => i18n('MediaEditor.Adjustments.Grain'),
      to100: true
    },
    {
      key: 'sharpen',
      signal: createSignal(0),
      uniform: 'uSharpen',
      label: () => i18n('MediaEditor.Adjustments.Sharpen'),
      to100: true
    }
  ] as const;
