import {useAppState} from '../stores/appState';
import {useFullPeer} from '../stores/fullPeers';
import {createEffect} from 'solid-js';
import usePeerLanguage from '../stores/peerLanguage';
import useDynamicCachedValue from '../helpers/solid/useDynamicCachedValue';
import I18n from '../lib/langPack';
import usePremium from '../stores/premium';

function _usePeerTranslation(peerId: PeerId) {
  const [appState, setAppState] = useAppState();

  const fullPeer = useFullPeer(() => peerId);
  const peerLanguage = usePeerLanguage(() => peerId, true);
  const isPremium = usePremium();

  const ret = {
    peerLanguage,
    language: (): TranslatableLanguageISO => (appState.translations[peerId] || I18n.lastRequestedNormalizedLangCode) as any,
    setLanguage: (lang: string) => setAppState('translations', peerId, lang),
    enabled: () => isPremium() && !!appState.translating[peerId],
    toggle: (enabled: boolean) => setAppState('translating', peerId, enabled ? true : undefined),
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
    if(ret.shouldShow() === false && ret.enabled()) {
      ret.toggle(false);
    }
  });

  return ret;
}

export default function usePeerTranslation(peerId: PeerId) {
  return useDynamicCachedValue(() => usePeerTranslation.name + '-' + peerId, () => _usePeerTranslation(peerId))();
}
