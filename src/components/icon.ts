import {TGICO_CLASS} from '../helpers/tgico';
import Icons from '../icons';

export default function Icon(icon: Icon, ...classes: string[]) {
  const span = document.createElement('span');
  span.classList.add(TGICO_CLASS/* ...tgico(icon) */, ...classes);
  span.textContent = String.fromCharCode(parseInt(Icons[icon], 16));
  return span;
}
