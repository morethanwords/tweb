import type {AdjustmentsConfig} from '@components/mediaEditor/adjustments';

type Adjustment = AdjustmentsConfig[number];

// PhotoFilterView.java (21f7d109): bipolar tools display -100…100. Web
// documents and render adapters retain their existing -50…50 storage units.
export function toAndroidAdjustmentDisplay(item: Adjustment, stored: number) {
  return item.to100 ? stored : stored * 2;
}

export function fromAndroidAdjustmentDisplay(item: Adjustment, displayed: number) {
  return item.to100 ? displayed : displayed / 2;
}

export function androidAdjustmentLabelKey(item: Adjustment) {
  return item.key === 'brightness' ? 'MediaEditor.Android.Exposure' : item.labelKey;
}

export function isAndroidAdjustmentVisible(item: Adjustment, mediaType: string) {
  // PhotoFilterView.java:358–363 excludes Grain on the video path, not Sharpen.
  return item.key !== 'grain' || mediaType !== 'video';
}

export function formatAndroidAdjustmentValue(value: number) {
  // Preserve fractional legacy readback; never round or rewrite saved storage.
  return value > 0 ? '+' + value : String(value);
}
