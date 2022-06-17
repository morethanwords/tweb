/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

export type ColorHsla = {
  h: number,
  s: number,
  l: number,
  a: number
};

export type ColorRgba = [number, number, number, number];
export type ColorRgb = [number, number, number];

/**
 * @returns h [0, 360], s [0, 100], l [0, 100], a [0, 1]
 */
export function rgbaToHsla(r: number, g: number, b: number, a: number = 1): ColorHsla {
  r /= 255, g /= 255, b /= 255;
  const max = Math.max(r, g, b),
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

  return {
    h: h * 360,
    s: s * 100,
    l: l * 100,
    a
  };
}

// * https://stackoverflow.com/a/9493060/6758968
/**
 * Converts an HSL color value to RGB. Conversion formula
 * adapted from http://en.wikipedia.org/wiki/HSL_color_space.
 * Assumes h in [0, 360], s, and l are contained in the set [0, 1], a in [0, 1] and
 * returns r, g, and b in the set [0, 255].
 *
 * @param   {number}  h       The hue
 * @param   {number}  s       The saturation
 * @param   {number}  l       The lightness
 * @return  {Array}           The RGB representation
 */
export function hslaToRgba(h: number, s: number, l: number, a: number): ColorRgba {
  h /= 360, s /= 100, l /= 100;
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
      return +val.slice(0, -1);
    }
    
    return +val;
  });

  return hslaToRgba(arr[0], arr[1], arr[2], alpha);
}

export function hexaToRgba(hexa: string) {
  const arr: ColorRgba = [] as any;
  const offset = hexa[0] === '#' ? 1 : 0;
  if(hexa.length === (5 + offset)) {
    hexa = (offset ? '#' : '') + '0' + hexa.slice(offset);
  }

  if(hexa.length === (3 + offset)) {
    for(let i = offset; i < hexa.length; ++i) {
      arr.push(parseInt(hexa[i] + hexa[i], 16));
    }
  } else if(hexa.length === (4 + offset)) {
    for(let i = offset; i < (hexa.length - 1); ++i) {
      arr.push(parseInt(hexa[i] + hexa[i], 16));
    }

    arr.push(parseInt(hexa[hexa.length - 1], 16));
  } else {
    for(let i = offset; i < hexa.length; i += 2) {
      arr.push(parseInt(hexa.slice(i, i + 2), 16));
    }
  }

  return arr;
}

export function hexToRgb(hex: string) {
  return hexaToRgba(hex.slice(0, 7)) as any as ColorRgb;
}

export function hexaToHsla(hexa: string) {
  const rgba = hexaToRgba(hexa);
  return rgbaToHsla(rgba[0], rgba[1], rgba[2], rgba[3]);
}

export function rgbaToHexa(rgba: ColorRgba | ColorRgb) {
  return '#' + rgba.map((v) => ('0' + v.toString(16)).slice(-2)).join('');
}

export function hslaStringToHexa(hsla: string) {
  return rgbaToHexa(hslaStringToRgba(hsla));
}

export function hslaStringToHex(hsla: string) {
  return hslaStringToHexa(hsla).slice(0, -2);
}
