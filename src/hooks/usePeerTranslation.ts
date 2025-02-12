import {useFullPeer} from '../stores/fullPeers';
import {createEffect, createMemo} from 'solid-js';
import usePeerLanguage from '../stores/peerLanguage';
import useDynamicCachedValue from '../helpers/solid/useDynamicCachedValue';
import I18n from '../lib/langPack';
import usePremium from '../stores/premium';
import {useAppSettings} from '../stores/appSettings';

function _usePeerTranslation(peerId: PeerId) {
  const [appSettings, setAppSettings] = useAppSettings();

  const fullPeer = useFullPeer(() => peerId);
  const peerLanguage = usePeerLanguage(() => peerId, true);
  const isPremium = usePremium();

  const shouldShow = createMemo<boolean | undefined>(() => {
    if(!isPremium() || !fullPeer() || !peerLanguage() || !appSettings.translations.enabled) {
      return;
    }

    if(
      fullPeer().pFlags.translations_disabled ||
      appSettings.translations.doNotTranslate.includes(peerLanguage())
    ) {
      return false;
    }

    return true;
  });

  const ret = {
    peerLanguage,
    language: (): TranslatableLanguageISO => (appSettings.translations.peers[peerId] || I18n.langCodeNormalized()) as any,
    setLanguage: (lang: string) => setAppSettings('translations', 'peers', peerId, lang),
    enabled: createMemo(() => !!(isPremium() && appSettings.translations.enabled && appSettings.translations.enabledPeers[peerId]) && shouldShow()),
    toggle: (enabled: boolean) => setAppSettings('translations', 'enabledPeers', peerId, enabled ? true : undefined),
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
