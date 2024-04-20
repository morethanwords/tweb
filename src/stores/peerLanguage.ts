import {createMemo, batch, untrack, createRoot, createEffect, on, Accessor} from 'solid-js';
import {createStore, SetStoreFunction} from 'solid-js/store';
import {Message} from '../layer';
import I18n from '../lib/langPack';
import apiManagerProxy from '../lib/mtproto/mtprotoworker';
import detectLanguage from '../lib/tinyld/detect';
import {useAppState} from './appState';

// https://core.telegram.org/api/translation
export const MIN_TOTAL_PROCESSED_MESSAGES = 8;
export const MIN_FOREIGN_PERCENTAGE = 0.65;

type T = {
  [peerId: PeerId]: {
    messages: {[mid: number]: TranslatableLanguageISO},
    languages: {[lang: string]: number},
    language: TranslatableLanguageISO,
    total: number,
    totalForeign: number
  }
};

let state: T, setState: SetStoreFunction<T>, myLanguages: Accessor<Set<TranslatableLanguageISO>>;
let _createStore = () => {
  _createStore = undefined;
  [state, setState] = createStore({});

  createRoot(() => {
    const [appState] = useAppState();
    myLanguages = createMemo(() => {
      const myLanguages = new Set(
        appState.translations.doNotTranslate.concat(
          navigator.language.split('-')[0] as TranslatableLanguageISO,
          I18n.langCodeNormalized()
        )
      );

      return myLanguages;
    });

    createEffect(on(
      myLanguages,
      (myLanguages) => batch(() => {
        for(const peerId in state) {
          const current = state[peerId];
          if(!current) {
            continue;
          }

          let newTotalForeign = 0;
          for(const lang in current.languages) {
            if(!myLanguages.has(lang as TranslatableLanguageISO)) {
              newTotalForeign += current.languages[lang];
            }
          }

          setState(peerId.toPeerId(), 'totalForeign', newTotalForeign);
        }
      }),
      {defer: true}
    ));
  });
};

export async function processMessageForTranslation(peerId: PeerId, mid: number) {
  _createStore?.();
  if(state[peerId] && state[peerId].messages[mid]) {
    return;
  }

  const message = apiManagerProxy.getMessageByPeer(peerId, mid);
  const text = (message as Message.message).message;
  if(!text) {
    return;
  }

  const lang = await detectLanguage(text);
  const isForeign = !myLanguages().has(lang);
  batch(() => {
    let previous = untrack(() => state[peerId]);
    if(!previous) {
      setState(peerId, previous = {
        messages: {},
        languages: {},
        language: undefined,
        total: 0,
        totalForeign: 0
      });
    } else if(previous.messages[mid]) {
      return;
    }

    const newLanguageLength = (previous.languages[lang] ?? 0) + 1;
    const newTotal = previous.total + 1;
    const newTotalForeign = previous.totalForeign + (isForeign ? 1 : 0);
    setState(peerId, 'messages', mid, lang);
    setState(peerId, 'languages', lang, newLanguageLength);
    setState(peerId, 'total', newTotal);
    if(isForeign) setState(peerId, 'totalForeign', newTotalForeign);

    const previousLanguage = previous.language;
    if(
      newTotal >= MIN_TOTAL_PROCESSED_MESSAGES &&
      (previous.languages[previousLanguage] || 0) < newLanguageLength
    ) {
      setState(peerId, 'language', lang);
    } else if(previousLanguage && newTotal < MIN_TOTAL_PROCESSED_MESSAGES) {
      setState(peerId, 'language', undefined);
    }
  });
}

export default function usePeerLanguage(peerId: () => PeerId, onlyIfForeign?: boolean) {
  return createMemo(() => {
    const _peerId = peerId();
    if(!_peerId) {
      return;
    }

    _createStore?.();
    const current = state[_peerId];
    if(onlyIfForeign && current && (current.totalForeign / current.total) < MIN_FOREIGN_PERCENTAGE) {
      return;
    }

    return current?.language;
  });
}
