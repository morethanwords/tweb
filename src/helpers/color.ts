/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

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

// * https://stackoverflow.com/a/9493060/6758968
/**
 * Converts an HSL color value to RGB. Conversion formula
 * adapted from http://en.wikipedia.org/wiki/HSL_color_space.
 * Assumes h, s, and l are contained in the set [0, 1] and
 * returns r, g, and b in the set [0, 255].
 *
 * @param   {number}  h       The hue
 * @param   {number}  s       The saturation
 * @param   {number}  l       The lightness
 * @return  {Array}           The RGB representation
 */
export function hslToRgba(h: number, s: number, l: number, a: number) {
  let r: number, g: number, b: number;

  if(s === 0) {
    r = g = b = l; // achromatic
  } else {
    const hue2rgb = function hue2rgb(p: number, q: number, t: number) {
      if(t < 0) t += 1;
      if(t > 1) t -= 1;
      if(t < 1/6) return p + (q - p) * 6 * t;
      if(t < 1/2) return q;
      if(t < 2/3) return p + (q - p) * (2/3 - t) * 6;
      return p;
    }

    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1/3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1/3);
  }

  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255), Math.round(a * 255)];
}

export function hslaStringToRgba(hsla: string) {
  const splitted = hsla.slice(5, -1).split(', ');
  const alpha = +splitted.pop();
  const arr = splitted.map((val) => {
    if(val.endsWith('%')) {
      return +val.slice(0, -1) / 100;
    }
    
    return +val / 360;
  });

  return hslToRgba(arr[0], arr[1], arr[2], alpha);
}

export function hslaStringToRgbaString(hsla: string) {
  return '#' + hslaStringToRgba(hsla).map(v => ('0' + v.toString(16)).slice(-2)).join('');
}

export function hslaStringToRgbString(hsla: string) {
  return hslaStringToRgbaString(hsla).slice(0, -2);
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
}
