/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

// https://github.com/telegramdesktop/tdesktop/blob/97d8ee75d51874fcb74a9bfadc79f835c82be54a/Telegram/SourceFiles/chat_helpers/stickers_emoji_pack.cpp#L46
const COLORREPLACEMENTS = [
  [
    [0xf77e41, 0xcb7b55],
    [0xffb139, 0xf6b689],
    [0xffd140, 0xffcda7],
    [0xffdf79, 0xffdfc5]
  ],

  [
    [0xf77e41, 0xa45a38],
    [0xffb139, 0xdf986b],
    [0xffd140, 0xedb183],
    [0xffdf79, 0xf4c3a0]
  ],

  [
    [0xf77e41, 0x703a17],
    [0xffb139, 0xab673d],
    [0xffd140, 0xc37f4e],
    [0xffdf79, 0xd89667]
  ],

  [
    [0xf77e41, 0x4a2409],
    [0xffb139, 0x7d3e0e],
    [0xffd140, 0x965529],
    [0xffdf79, 0xa96337]
  ],

  [
    [0xf77e41, 0x200f0a],
    [0xffb139, 0x412924],
    [0xffd140, 0x593d37],
    [0xffdf79, 0x63453f]
  ]
];

const convert = (value: number) => {
  return Math.round(Math.min(Math.max(value, 0), 1) * 255);
};

type LottieShape = {
  c: {
    k: number[]
  },
  ty: 'st' | 'fl',
  it?: LottieShape[]
};

export default function applyReplacements(object: {
  layers: Array<{shapes: LottieShape[]}>
}, toneIndex: number) {
  const replacements = COLORREPLACEMENTS[Math.max(toneIndex - 1, 0)];

  const applyTo = (smth: LottieShape) => {
    const k = smth.c.k;
    const color = convert(k[2]) | (convert(k[1]) << 8) | (convert(k[0]) << 16);

    const foundReplacement = replacements.find((p) => p[0] === color);
    if(foundReplacement) {
      k[0] = ((foundReplacement[1] >> 16) & 255) / 255;
      k[1] = ((foundReplacement[1] >> 8) & 255) / 255;
      k[2] = (foundReplacement[1] & 255) / 255;
    }

    // console.log('foundReplacement!', foundReplacement, color.toString(16), k);
  };

  const checkSmth = (smth: LottieShape) => {
    switch(smth.ty) {
      case 'st':
      case 'fl':
        applyTo(smth);
        break;
    }

    if(smth.hasOwnProperty('it')) {
      iterateIt(smth.it);
    }
  };

  const iterateIt = (it: LottieShape['it']) => {
    for(const smth of it) {
      checkSmth(smth);
    }
  };

  try {
    for(const layer of object.layers) {
      if(!layer.shapes) continue;

      for(const shape of layer.shapes) {
        if(!shape.it) {
          checkSmth(shape);
          continue;
        }

        iterateIt(shape.it);
      }
    }
  } catch(err) {
    console.warn('cant apply replacements', err, object, toneIndex);
  }
}
