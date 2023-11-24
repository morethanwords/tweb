import {rgbaToHsla} from './color';

// * https://github.com/TelegramMessenger/Telegram-iOS/blob/3d062fff78cc6b287c74e6171f855a3500c0156d/submodules/TelegramPresentationData/Sources/PresentationData.swift#L453
export default function highlightingColor(rgba: [number, number, number, number?]) {
  let {h, s, l} = rgbaToHsla(rgba[0], rgba[1], rgba[2]);
  if(s > 0) {
    s = Math.min(100, s + 5 + 0.1 * (100 - s));
  }
  l = Math.max(0, l * .65);

  const hsla = `hsla(${h}, ${s}%, ${l}%, .4)`;
  return hsla;
}
