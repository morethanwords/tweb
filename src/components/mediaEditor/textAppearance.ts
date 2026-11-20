import type {TextLayerInfo} from '@components/mediaEditor/types';
import {getContrastColor} from '@components/mediaEditor/utils';
import {computePerceivedBrightness, hexToRgb} from '@helpers/color';

/** Shared by the editable layer and the exported canvas. Legacy IDs keep their saved appearance. */
export default function getTextAppearance(info: Pick<TextLayerInfo, 'style' | 'color'>) {
  const {style, color} = info;
  let textColor = color;
  let backgroundColor: string;
  let outlineColor: string;

  if(style === 'background' || style === 'outline') {
    textColor = getContrastColor(color);
    if(style === 'background') backgroundColor = color;
    else outlineColor = color;
  } else if(style === 'framed' || style === 'semi-transparent' || style === 'opaque') {
    // Android TextPaintView.updateColor / Desktop EffectiveTextColor and
    // TextBackgroundColor: perceived RGB brightness, NOT WCAG linear luminance.
    const brightness = computePerceivedBrightness(hexToRgb(color));
    if(style === 'framed') {
      backgroundColor = color;
      textColor = brightness >= .721 ? '#000000' : '#ffffff';
    } else {
      backgroundColor = brightness >= .25 ? '#000000' : '#ffffff';
      if(style === 'semi-transparent') backgroundColor += '99';
    }
  }

  return {textColor, backgroundColor, outlineColor};
}
