import {onCleanup} from 'solid-js';

export function useIsCleaned() {
  let isCleaned = false;

  onCleanup(() => {
    isCleaned = true;
  });

  return () => isCleaned;
}
