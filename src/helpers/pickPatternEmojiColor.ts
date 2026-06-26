import {rgbIntToHex} from '@helpers/color';
import type {PeerColor} from '@layer';

export type PeerColorLike = PeerColor.peerColor | PeerColor.peerColorCollectible;

// * pure: pick the tint for the peer-color background-emoji pattern (replies/quotes/web pages)
export default function pickPatternEmojiColor(color: PeerColorLike, isNight: boolean, peerGradientColors: string[]) {
  if(color?._ === 'peerColorCollectible') {
    const val = isNight && color.dark_accent_color ? color.dark_accent_color : color.accent_color;
    return rgbIntToHex(val);
  }

  return peerGradientColors[0];
}
