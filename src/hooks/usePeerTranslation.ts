import {useAppState} from '../stores/appState';
import {useFullPeer} from '../stores/fullPeers';
import {createEffect, createMemo} from 'solid-js';
import usePeerLanguage from '../stores/peerLanguage';
import useDynamicCachedValue from '../helpers/solid/useDynamicCachedValue';
import I18n from '../lib/langPack';
import usePremium from '../stores/premium';

function _usePeerTranslation(peerId: PeerId) {
  const [appState, setAppState] = useAppState();

  const fullPeer = useFullPeer(() => peerId);
  const peerLanguage = usePeerLanguage(() => peerId, true);
  const isPremium = usePremium();

  const shouldShow = createMemo<boolean | undefined>(() => {
    if(!isPremium() || !fullPeer() || !peerLanguage() || !appState.translations.enabled) {
      return;
    }

    if(
      fullPeer().pFlags.translations_disabled ||
      appState.translations.doNotTranslate.includes(peerLanguage())
    ) {
      return false;
    }

    return true;
  });

  const ret = {
    peerLanguage,
    language: (): TranslatableLanguageISO => (appState.translations.peers[peerId] || I18n.langCodeNormalized()) as any,
    setLanguage: (lang: string) => setAppState('translations', 'peers', peerId, lang),
    enabled: createMemo(() => !!(isPremium() && appState.translations.enabled && appState.translations.enabledPeers[peerId]) && shouldShow()),
    toggle: (enabled: boolean) => setAppState('translations', 'enabledPeers', peerId, enabled ? true : undefined),
    shouldShow
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
