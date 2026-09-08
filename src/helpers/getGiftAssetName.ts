import type {LottieAssetName} from '@lib/lottie/lottieLoader';

export default function getGiftAssetName(days?: number): LottieAssetName {
  const months = Math.round((days || 0) / 30);
  return months >= 12 ? 'Gift12' : months >= 6 ? 'Gift6' : 'Gift3';
}
