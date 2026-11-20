import {hexToRgb, mixColors, rgbaToHexa} from '@helpers/color';

const gridHues = ['#00a1d8', '#0060fd', '#4c1fb7', '#982bbc', '#b82c5d', '#fd3e12', '#ff6900', '#fdab00', '#fcc700', '#fcfa43', '#d9eb37', '#76ba3f'];

// ColorPickerBottomSheet.GridPickerView: grayscale, five shades, then four tints.
export default function getAndroidGridColor(index: number) {
  // Android 21f7d109 ColorPickerBottomSheet:353, ColorUtils.blendARGB:
  // the first tint's Java float ratio is .199999988, not double .2. Only
  // these five cells cross an integer boundary on truncation; keep the
  // shared mixer and the other 115 declared colors unchanged.
  switch(index) {
    case 72: return '#32b3df'; // (0, 6)
    case 73: return '#327ffd'; // (1, 6)
    case 78: return '#ff8732'; // (6, 6)
    case 79: return '#fdbb32'; // (7, 6)
    case 80: return '#fcd232'; // (8, 6)
  }
  const x = index % 12, y = Math.floor(index / 12);
  // mixColors weights its FIRST operand, the reverse of Android's blendARGB.
  if(!y) return rgbaToHexa(mixColors([0, 0, 0], [255, 255, 255], x / 11));
  const base = hexToRgb(gridHues[x]);
  return rgbaToHexa(y < 6 ? mixColors([0, 0, 0], base, (5 - y) / 8) : mixColors([255, 255, 255], base, .5 - (9 - y) / 10));
}
