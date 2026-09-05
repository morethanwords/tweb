import {createRoot, createSignal} from 'solid-js';

// One media-query listener for the whole application. Message bodies only
// receive the accessor, so mounting a long history does not create one listener
// per bubble.
const reducedMotion = createRoot(() => {
  const query = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : undefined;
  const [value, setValue] = createSignal(!!query?.matches);
  query?.addEventListener('change', (event) => setValue(event.matches));
  return value;
});

export default function useReducedMotion() {
  return reducedMotion;
}
