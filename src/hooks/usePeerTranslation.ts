import {useAppState} from '../stores/appState';
import {useFullPeer} from '../stores/fullPeers';
import {createEffect} from 'solid-js';

export default function usePeerTranslation(peerId: PeerId) {
  const [appState, setAppState] = useAppState();

  const fullPeer = useFullPeer(() => peerId);
  createEffect(() => {
    if(ret.shouldShow() === false && ret.language()) {
      ret.set(undefined);
    }
  });

  const ret = {
    language: () => appState.translations[peerId],
    set: (lang: string) => setAppState('translations', peerId, lang),
    shouldShow: (): boolean | undefined => fullPeer() && !fullPeer().pFlags.translations_disabled
  } as const;

  return ret;
}
