import {createSignal, onCleanup} from 'solid-js';

export default function useMediaQuery(query: string) {
  const [isMatch, setIsMatch] = createSignal(false);

  const updateMatch = () => {
    setIsMatch(window.matchMedia(query).matches);
  };

  const mediaQueryList = window.matchMedia(query);
  setIsMatch(mediaQueryList.matches);

  mediaQueryList.addEventListener('change', updateMatch);
  onCleanup(() => {
    mediaQueryList.removeEventListener('change', updateMatch);
  });

  return isMatch;
}
