import {useAppState} from '../stores/appState';
import {useFullPeer} from '../stores/fullPeers';
import {createEffect} from 'solid-js';
import usePeerLanguage from '../stores/peerLanguage';
import useDynamicCachedValue from '../helpers/solid/useDynamicCachedValue';

function _usePeerTranslation(peerId: PeerId) {
  const [appState, setAppState] = useAppState();

  const fullPeer = useFullPeer(() => peerId);
  const peerLanguage = usePeerLanguage(() => peerId, true);

  const ret = {
    peerLanguage,
    language: () => appState.translations[peerId],
    set: (lang: string) => setAppState('translations', peerId, lang),
    shouldShow: (): boolean | undefined => {
      const _fullPeer = fullPeer();
      if(!_fullPeer || !peerLanguage()) {
        return;
      }

      if(
        _fullPeer.pFlags.translations_disabled ||
        appState.doNotTranslate.includes(peerLanguage())
      ) {
        return false;
      }

      return true;
    }
  } as const;

  createEffect(() => {
    if(ret.shouldShow() === false && ret.language()) {
      ret.set(undefined);
    }
  });

  return ret;
}

export default function usePeerTranslation(peerId: PeerId) {
  return useDynamicCachedValue(() => usePeerTranslation.name + '-' + peerId, () => _usePeerTranslation(peerId))();
}
