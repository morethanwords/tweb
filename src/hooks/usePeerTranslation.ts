import {useAppState} from '../stores/appState';

export default function usePeerTranslation(peerId: PeerId) {
  const [appState, setAppState] = useAppState();
  return [
    () => appState.translations[peerId],
    (lang: string) => {
      setAppState('translations', peerId, lang);
    }
  ] as const;
}
