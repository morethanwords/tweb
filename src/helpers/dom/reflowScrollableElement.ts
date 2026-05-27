export default function reflowScrollableElement(element: HTMLElement) {
  element.style.display = 'none';
  void element.offsetLeft; // reflow
  element.style.display = '';
}
