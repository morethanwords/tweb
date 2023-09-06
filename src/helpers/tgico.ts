export const TGICO_CLASS = 'tgico';
export default function tgico(icon: Icon) {
  return [TGICO_CLASS, _tgico(icon)];
}

export function _tgico(icon: Icon) {
  return TGICO_CLASS + '-' + icon;
}

export function tgico_(icon: Icon) {
  return tgico(icon).join(' ');
}
