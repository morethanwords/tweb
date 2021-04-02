export function rgbToHsl(r: number, g: number, b: number) {
  r /= 255, g /= 255, b /= 255;
  let max = Math.max(r, g, b),
      min = Math.min(r, g, b);
  let h, s, l = (max + min) / 2;

  if(max === min) {
    h = s = 0; // achromatic
  } else {
    let d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      case b:
        h = (r - g) / d + 4;
        break;
    }
    h /= 6;
  }

  return ({
    h: h,
    s: s,
    l: l,
  });
}

// * https://github.com/TelegramMessenger/Telegram-iOS/blob/3d062fff78cc6b287c74e6171f855a3500c0156d/submodules/TelegramPresentationData/Sources/PresentationData.swift#L453
export function highlightningColor(pixel: Uint8ClampedArray) {
  let {h, s, l} = rgbToHsl(pixel[0], pixel[1], pixel[2]);
  if(s > 0.0) {
    s = Math.min(1.0, s + 0.05 + 0.1 * (1.0 - s));
  }
  l = Math.max(0.0, l * 0.65);
  
  const hsla = `hsla(${h * 360}, ${s * 100}%, ${l * 100}%, .4)`;
  return hsla;
};
