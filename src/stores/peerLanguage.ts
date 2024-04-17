import {createMemo, batch, untrack} from 'solid-js';
import {createStore} from 'solid-js/store';
import {MOUNT_CLASS_TO} from '../config/debug';
import {Message} from '../layer';
import I18n from '../lib/langPack';
import apiManagerProxy from '../lib/mtproto/mtprotoworker';
import detectLanguage from '../lib/tinyld/detect';

// https://core.telegram.org/api/translation
export const MIN_TOTAL_PROCESSED_MESSAGES = 8;
export const MIN_FOREIGN_PERCENTAGE = 0.65;

type T = {
  [peerId: PeerId]: {
    messages: {[mid: number]: MaybePromise<string>},
    languages: {[lang: string]: number},
    language: TranslatableLanguageISO,
    total: number,
    totalForeign: number
  }
};

const [state, setState] = createStore<T>({});

MOUNT_CLASS_TO && (MOUNT_CLASS_TO.peerLanguages = state);

export async function processMessageForTranslation(peerId: PeerId, mid: number) {
  if(state[peerId] && state[peerId].messages[mid]) {
    return;
  }

  const message = apiManagerProxy.getMessageByPeer(peerId, mid);
  const text = (message as Message.message).message;
  if(!text) {
    return;
  }

  const lang = await detectLanguage(text);
  const isForeign = ![navigator.language, I18n.lastRequestedNormalizedLangCode].includes(lang);
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
    }

    const newLanguageLength = (previous.languages[lang] ?? 0) + 1;
    const newTotal = previous.total + 1;
    const newTotalForeign = previous.totalForeign + (isForeign ? 1 : 0);
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

    const current = state[_peerId];
    if(onlyIfForeign && current && (current.totalForeign / current.total) < MIN_FOREIGN_PERCENTAGE) {
      return;
    }

    return current?.language;
  });
}
