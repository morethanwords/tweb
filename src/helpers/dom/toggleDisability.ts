import toArray from '@helpers/array/toArray';

export default function toggleDisability(elements: HTMLElement | HTMLElement[], disable: boolean): () => void {
  elements = toArray(elements);

  if(disable) {
    elements.forEach((el) => el.setAttribute('disabled', 'true'));
  } else {
    elements.forEach((el) => el.removeAttribute('disabled'));
  }

  return () => toggleDisability(elements, !disable);
}
