/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 *
 * Originally from:
 * https://github.com/evgeny-nadymov/telegram-react
 * Copyright (C) 2018 Evgeny Nadymov
 * https://github.com/evgeny-nadymov/telegram-react/blob/master/LICENSE
 */

// NOTE: telegram returns sign source, while webrtc uses unsign source internally
// unsign => sign
export function toTelegramSource(source: number) {
  return source << 0;
}

// NOTE: telegram returns sign source, while webrtc uses unsign source internally
// sign => unsign
export function fromTelegramSource(source: number) {
  return source >>> 0;
}

export function getAmplitude(array: Uint8Array, scale = 3) {
  if(!array) return 0;

  const {length} = array;
  let total = 0;
  for(let i = 0; i < length; ++i) {
    total += array[i] * array[i];
  }
  const rms = Math.sqrt(total / length) / 255;

  return Math.min(1, rms * scale);
}
