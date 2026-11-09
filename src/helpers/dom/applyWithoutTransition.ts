/**
 * Applies a change with the elements' transitions switched off: they get the new state laid out in one reflow
 * (the one forced layout for the whole batch), and only then their transitions back.
 */
export default function applyWithoutTransition(elements: HTMLElement[], mutate: () => void) {
  elements.forEach((element) => element.style.transition = 'none');
  mutate();
  void elements[0].offsetHeight; // * the new state is laid out with no transition before it gets it back
  elements.forEach((element) => element.style.transition = '');
}
