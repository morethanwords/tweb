import {createElement} from './minifiers';

export function toggleText(element: HTMLElement, newText: string, className: string = '', inverse: boolean = false) {
  const container = element.parentNode as HTMLElement;
  container.classList.add('lovely-chart--transition-container');

  const newElement = createElement(element.tagName);
  newElement.className = `${className} lovely-chart--transition lovely-chart--position-${inverse ? 'top' : 'bottom'} lovely-chart--state-hidden`;
  newElement.innerHTML = newText;

  const selector = className.length ? `.${className.split(' ').join('.')}` : '';
  const oldElements = container.querySelectorAll(`${selector}.lovely-chart--state-hidden`);
  oldElements.forEach(e => e.remove());

  element.classList.add('lovely-chart--transition');
  element.classList.remove('lovely-chart--position-bottom', 'lovely-chart--position-top');
  element.classList.add(inverse ? 'lovely-chart--position-bottom' : 'lovely-chart--position-top');
  container.insertBefore(newElement, element.nextSibling);

  toggleElementIn(newElement);
  toggleElementOut(element);

  return newElement;
}

function toggleElementIn(element: HTMLElement) {
  // Remove and add `animated` class to re-trigger animation
  element.classList.remove('lovely-chart--state-animated');
  element.classList.add('lovely-chart--state-animated');
  element.classList.remove('lovely-chart--state-hidden');
}

function toggleElementOut(element: HTMLElement) {
  // Remove and add `animated` class to re-trigger animation
  element.classList.remove('lovely-chart--state-animated');
  element.classList.add('lovely-chart--state-animated');
  element.classList.add('lovely-chart--state-hidden');
}
