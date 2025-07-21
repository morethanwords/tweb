import {createEffect, createRoot, createSignal} from 'solid-js';


const signal = createRoot(() => {
  const [hasFoldersSidebar, setHasFoldersSidebar] = createSignal(false);

  createEffect(() => {
    document.body.classList.toggle('has-folders-sidebar', hasFoldersSidebar());
  });

  return {hasFoldersSidebar, setHasFoldersSidebar};
});

export default function useHasFoldersSidebar() {
  return signal;
};
