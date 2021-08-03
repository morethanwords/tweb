<<<<<<< HEAD
/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

const arrays = {
  8: new Uint8Array(1),
  16: new Uint16Array(1),
  32: new Uint32Array(1),
};
export function nextRandomUint(bits: 8 | 16 | 32) {
  const array = arrays[bits];
  crypto.getRandomValues(array);
  return array[0];
}

export function randomLong() {
  return '' + nextRandomUint(32) + nextRandomUint(32) % 0xFFFFFF;
}
=======
/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

const arrays = {
  8: new Uint8Array(1),
  16: new Uint16Array(1),
  32: new Uint32Array(1),
};
export function nextRandomUint(bits: 8 | 16 | 32) {
  const array = arrays[bits];
  crypto.getRandomValues(array);
  return array[0];
}

export function randomLong() {
  return '' + nextRandomUint(32) + nextRandomUint(32) % 0xFFFFFF;
}
>>>>>>> a3a258651320e5e8e7903d8bfe1cb222d84de6dc
