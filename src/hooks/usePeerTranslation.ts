import {useFullPeer} from '../stores/fullPeers';
import {createEffect, createMemo} from 'solid-js';
import usePeerLanguage from '../stores/peerLanguage';
import useDynamicCachedValue from '../helpers/solid/useDynamicCachedValue';
import I18n from '../lib/langPack';
import usePremium from '../stores/premium';
import {useAppSettings} from '../stores/appSettings';
import {usePeer} from '../stores/peers';
import {Chat} from '../layer';
import {useAppState} from '../stores/appState';

function _usePeerTranslation(peerId: PeerId) {
  const [appSettings, setAppSettings] = useAppSettings();
  const [appState] = useAppState();

  const fullPeer = useFullPeer(() => peerId);
  const peer = usePeer(() => peerId);
  const peerLanguage = usePeerLanguage(() => peerId, true);
  const isPremium = usePremium();

  const areTranslationsAvailable = (manual?: boolean) => {
    if(appState.appConfig.freeze_since_date) {
      return false;
    }

    const appConfig = appState?.appConfig;
    if((manual ? appConfig?.translations_manual_enabled : appConfig?.translations_auto_enabled) !== 'enabled') {
      return false;
    }

    return true;
  };

  const canTranslate = (manual?: boolean) => {
    if(!areTranslationsAvailable(manual)) {
      return false;
    }

    if(manual) {
      return true;
    }

    return isPremium() || (!!peer() && !!(peer() as Chat.channel).pFlags.autotranslation);
  };

  const shouldShow = createMemo<boolean | undefined>(() => {
    if(!canTranslate() || !peerLanguage() || !appSettings.translations.enabled) {
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
    enabled: createMemo(() => !!(canTranslate() && appSettings.translations.enabled && appSettings.translations.enabledPeers[peerId]) && shouldShow()),
    toggle: (enabled: boolean) => setAppSettings('translations', 'enabledPeers', peerId, enabled ? true : undefined),
    shouldShow,
    canTranslate,
    areTranslationsAvailable
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
