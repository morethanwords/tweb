import {i18n} from '@lib/langPack';

export type CurveLevels = [number, number, number, number, number];
export type PhotoProcessingVersion = 'android-photo-v1';
export type PhotoProcessingPolicy = {processingVersion?: PhotoProcessingVersion};
export type CurveChannel = 'rgb' | 'red' | 'green' | 'blue';
export type NativeAdjustments = {
  tintShadows?: number;
  tintHighlights?: number;
  curves?: Partial<Record<CurveChannel, CurveLevels>>;
  blur?: {
    mode: 'off' | 'radial' | 'linear';
    center: [number, number];
    size: number;
    falloff: number;
    angle: number;
  };
};

export const defaultCurveLevels: CurveLevels = [0, 25, 50, 75, 100];
export const defaultSelectiveBlur: NonNullable<NativeAdjustments['blur']> = {
  mode: 'off', center: [0.5, 0.5], size: 0.35, falloff: 0.15, angle: Math.PI / 2
};

// Android PhotoFilterView.CurvesValue: Catmull–Rom, repeated endpoint values.
export function interpolateNativeCurve(levels: CurveLevels, value: number) {
  const position = Math.max(0, Math.min(1, value)) * 4;
  const index = Math.min(3, Math.floor(position));
  const t = position - index;
  const a = levels[Math.max(0, index - 1)] / 100;
  const b = levels[index] / 100;
  const c = levels[index + 1] / 100;
  const d = levels[Math.min(4, index + 2)] / 100;
  return Math.max(0, Math.min(1, 0.5 * (2 * b + (c - a) * t +
    (2 * a - 5 * b + 4 * c - d) * t * t + (3 * b - a - 3 * c + d) * t * t * t)));
}

export const nativeCurveChannels = ['red', 'green', 'blue', 'rgb'] as const;

// Serialized unversioned edits retain the original polynomial uniform pipeline.
export function getLegacyCurveUniforms(native?: NativeAdjustments) {
  return defaultCurveLevels.map((_, index) =>
    nativeCurveChannels.map(channel => (native?.curves?.[channel] || defaultCurveLevels)[index] / 100)
  );
}

export function areNativeCurvesEnabled(native?: NativeAdjustments) {
  return nativeCurveChannels.some(channel => native?.curves?.[channel]?.some((level, index) =>
    Math.abs(Math.fround(Math.fround(level) - defaultCurveLevels[index])) >= 0.00001
  ));
}

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
