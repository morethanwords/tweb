import {doubleRaf} from '@helpers/schedulers';

export default function disableTransition(elements: HTMLElement[]) {
  elements.forEach((el) => el.classList.add('no-transition'));

  doubleRaf().then(() => {
    elements.forEach((el) => el.classList.remove('no-transition'));
  });
}
