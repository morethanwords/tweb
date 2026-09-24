import {createSignal, onCleanup} from 'solid-js';
import {getAppWindow, onAppWindowChange} from '@helpers/appWindow';

function useMediaQuery(query: string) {
  const [isMatch, setIsMatch] = createSignal(false);
  let mediaQueryList: MediaQueryList;

  const updateMatch = () => {
    setIsMatch(mediaQueryList.matches);
  };

  const bind = (win: Window) => {
    mediaQueryList?.removeEventListener('change', updateMatch);
    mediaQueryList = win.matchMedia(query);
    setIsMatch(mediaQueryList.matches);
    mediaQueryList.addEventListener('change', updateMatch);
  };

  bind(getAppWindow());
  const offWindowChange = onAppWindowChange(bind);
  onCleanup(() => {
    mediaQueryList.removeEventListener('change', updateMatch);
    offWindowChange();
  });

  return isMatch;
}

export default function useIsMobile() {
  const isMobile = useMediaQuery('(max-width: 800px)');
  return isMobile;
}
