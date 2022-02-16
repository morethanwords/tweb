/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

export function numberThousandSplitter(x: number, joiner = ' ') {
  const parts = x.toString().split(".");
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, joiner);
  return parts.join(".");
}

export function formatNumber(bytes: number, decimals = 2) {
  if(bytes === 0) return '0';

  const k = 1000;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['', 'K', 'M', 'B', 'T'];

  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + sizes[i];
}

export function clamp(v: number, min: number, max: number): number {
  return v < min ? min : ((v > max) ? max : v);
}

