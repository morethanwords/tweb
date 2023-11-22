import {TGICO_CLASS} from '../helpers/tgico';
import Icons from '../icons';
import IconsReverse from '../iconsReverse';
import I18n from '../lib/langPack';

export function getIconContent(icon: Icon) {
  return String.fromCharCode(parseInt(Icons[icon], 16));
}

export default function Icon(icon: Icon, ...classes: string[]) {
  const span = document.createElement('span');
  if(I18n.isRTL && IconsReverse.has(icon)) {
    classes.push('icon-reflect');
  }

  span.classList.add(TGICO_CLASS/* ...tgico(icon) */, ...classes);
  span.textContent = getIconContent(icon);
  return span;
}
