import {TGICO_CLASS} from '@helpers/tgico';
import Icons from '@/icons';
import IconsReverse from '@/iconsReverse';
import I18n from '@lib/langPack';

export function getIconContent(icon: Icon) {
  return String.fromCharCode(parseInt(Icons[icon], 16));
}

type IconWithClass = {
  icon: Icon;
  className?: string;
};

export function OverlayedIcon(icons: (Icon | IconWithClass)[], className?: string) {
  const span = document.createElement('span');
  span.classList.add('overlayed-icon', ...(className ? [className] : []));

  const getIcon = (icon: Icon | IconWithClass) => icon instanceof Object ? icon.icon : icon;
  const getClasses = (icon: Icon | IconWithClass) => icon instanceof Object ? [icon.className] : [];

  span.append(Icon(getIcon(icons[0]), ...getClasses(icons[0])));
  span.append(...icons.slice(1).map(icon => Icon(getIcon(icon), 'overlayed-icon__floating-icon', ...getClasses(icon))));

  return span;
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
