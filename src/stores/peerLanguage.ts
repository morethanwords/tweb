import {createMemo, batch, untrack, createRoot, createEffect, on, Accessor} from 'solid-js';
import {createStore, SetStoreFunction} from 'solid-js/store';
import {Message} from '@layer';
import I18n from '@lib/langPack';
import apiManagerProxy from '@lib/apiManagerProxy';
import {flattenRichMessageContent} from '@lib/richMessage';
import rootScope from '@lib/rootScope';
import detectLanguage from '@lib/tinyld/detect';
import {useAppSettings} from '@stores/appSettings';

// https://core.telegram.org/api/translation
export const MIN_TOTAL_PROCESSED_MESSAGES = 8;
export const MIN_FOREIGN_PERCENTAGE = 0.65;

type TT = {
  messages: {[mid: number]: {
    language: TranslatableLanguageISO,
    token: string
  }},
  languages: {[lang: string]: number},
  language: TranslatableLanguageISO,
  total: number,
  totalForeign: number,
  isFull?: boolean
};

type T = {
  [peerId: PeerId]: TT
};

type ProcessingMessage = {
  token: string,
  promise: Promise<void>
};

export type MessageTranslationTextSource = {
  sourceText: string,
  sourceToken: string
};

let state: T, setState: SetStoreFunction<T>, myLanguages: Accessor<Set<TranslatableLanguageISO>>;
const processingMessages = new Map<string, ProcessingMessage>();
let _createStore = () => {
  _createStore = undefined;
  [state, setState] = createStore({});

  createRoot(() => {
    const [appSettings] = useAppSettings();
    myLanguages = createMemo(() => {
      const myLanguages = new Set(
        appSettings.translations.doNotTranslate.concat(
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

  const onMessageEdit = (peerId: PeerId, mid: number, message: Message) => {
    const key = getMessageKey(peerId, mid);
    if(!isMessageTracked(peerId, mid, key)) return;
    if(message._ === 'message') {
      processMessageForTranslation(peerId, mid, message).catch(() => {});
    } else {
      forgetMessageForTranslation(peerId, mid, key);
    }
  };
  rootScope.addEventListener('message_edit', ({peerId, mid, message}) => {
    onMessageEdit(peerId, mid, message);
  });
  rootScope.addEventListener('ephemeral_history_edit', ({peerId, mid, message}) => {
    onMessageEdit(peerId, mid, message);
  });

  const onMessagesDelete = (peerId: PeerId, msgs: Set<number>) => {
    for(const mid of msgs) {
      const key = getMessageKey(peerId, mid);
      if(isMessageTracked(peerId, mid, key)) {
        forgetMessageForTranslation(peerId, mid, key);
      }
    }
  };
  rootScope.addEventListener('history_delete', ({peerId, msgs}) => {
    onMessagesDelete(peerId, msgs);
  });
  rootScope.addEventListener('ephemeral_history_delete', ({peerId, msgs}) => {
    onMessagesDelete(peerId, msgs);
  });
  rootScope.addEventListener('peer_history_flush', ({peerId}) => {
    resetPeerLanguage(peerId);
  });
  rootScope.addEventListener('state_cleared', resetPeerLanguages);
};

function createEmpty(): TT {
  return {
    messages: {},
    languages: {},
    language: undefined,
    total: 0,
    totalForeign: 0
  };
}

export function setPeerLanguageLoaded(peerId: PeerId) {
  _createStore?.();
  if(!untrack(() => state[peerId])) {
    setState(peerId, createEmpty());
  }
  setState(peerId, 'isFull', true);
}

export function resetPeerLanguage(peerId: PeerId) {
  _createStore?.();
  const keyPrefix = `${peerId}_`;
  for(const key of processingMessages.keys()) {
    if(key.startsWith(keyPrefix)) {
      processingMessages.delete(key);
    }
  }
  setState(peerId, undefined);
}

function resetPeerLanguages() {
  processingMessages.clear();
  for(const peerId of untrack(() => Object.keys(state))) {
    setState(+peerId as PeerId, undefined);
  }
}

function getMessageKey(peerId: PeerId, mid: number) {
  return `${peerId}_${mid}`;
}

function hashMessageContent(value: string) {
  let first = 0x811c9dc5;
  let second = 0x9e3779b9;
  for(let index = 0; index < value.length; ++index) {
    const code = value.charCodeAt(index);
    first = Math.imul(first ^ code, 0x01000193);
    second = Math.imul(second ^ code, 0x85ebca6b);
  }
  return `${value.length}:${first >>> 0}:${second >>> 0}`;
}

/**
 * The text a message actually shows. A rich message keeps its content in `rich_message` and
 * leaves `message` empty, so anything deciding "what does this message say" has to come here.
 */
export function getMessageSourceText(message: Message.message) {
  return message.rich_message ?
    flattenRichMessageContent(message.rich_message).text :
    message.message || '';
}

export function getMessageTranslationSourceToken(
  message: Message.message,
  sourceText = getMessageSourceText(message)
) {
  return `${message.edit_date || 0}:${hashMessageContent(sourceText)}`;
}

function getCurrentMessage(peerId: PeerId, mid: number) {
  const message = apiManagerProxy.getMessageByPeer(peerId, mid);
  return message?._ === 'message' ? message as Message.message : undefined;
}

function isMessageTracked(peerId: PeerId, mid: number, key = getMessageKey(peerId, mid)) {
  return !!untrack(() => state[peerId]?.messages[mid]) || processingMessages.has(key);
}

function updatePeerLanguage(peerId: PeerId) {
  const current = untrack(() => state[peerId]);
  if(!current) return;

  let language = current.language;
  let count = current.languages[language] || 0;
  for(const lang in current.languages) {
    const nextCount = current.languages[lang] || 0;
    if(nextCount > count) {
      language = lang as TranslatableLanguageISO;
      count = nextCount;
    }
  }

  if(!count) language = undefined;
  if(language !== current.language) {
    setState(peerId, 'language', language);
  }
}

function removeMessageLanguage(peerId: PeerId, mid: number) {
  const current = untrack(() => state[peerId]);
  const entry = current?.messages[mid];
  if(!entry) return;

  const {language} = entry;
  const languageCount = current.languages[language] || 0;
  const isForeign = !myLanguages().has(language);
  batch(() => {
    setState(peerId, 'messages', mid, undefined);
    setState(peerId, 'languages', language, languageCount > 1 ? languageCount - 1 : undefined);
    setState(peerId, 'total', Math.max(0, current.total - 1));
    if(isForeign) {
      setState(peerId, 'totalForeign', Math.max(0, current.totalForeign - 1));
    }
    updatePeerLanguage(peerId);
  });
}

function addMessageLanguage(
  peerId: PeerId,
  mid: number,
  token: string,
  language: TranslatableLanguageISO
) {
  batch(() => {
    let current = untrack(() => state[peerId]);
    if(!current) {
      setState(peerId, current = createEmpty());
    } else if(current.messages[mid]) {
      removeMessageLanguage(peerId, mid);
      current = untrack(() => state[peerId]);
    }

    const languageCount = (current.languages[language] || 0) + 1;
    setState(peerId, 'messages', mid, {language, token});
    setState(peerId, 'languages', language, languageCount);
    setState(peerId, 'total', current.total + 1);
    if(!myLanguages().has(language)) {
      setState(peerId, 'totalForeign', current.totalForeign + 1);
    }
    updatePeerLanguage(peerId);
  });
}

function forgetMessageForTranslation(peerId: PeerId, mid: number, key = getMessageKey(peerId, mid)) {
  processingMessages.delete(key);
  removeMessageLanguage(peerId, mid);
}

export function processMessageForTranslation(
  peerId: PeerId,
  mid: number,
  source?: Message.message | MessageTranslationTextSource
): Promise<void> {
  _createStore?.();
  if(!Number.isInteger(mid)) return Promise.resolve();

  const messageSource = source && '_' in source ? source : undefined;
  const textSource = source && !('_' in source) ? source : undefined;
  const message = messageSource || getCurrentMessage(peerId, mid);
  if(!message || message.pFlags.currentlyTyping) return Promise.resolve();

  const text = textSource?.sourceText ?? getMessageSourceText(message);
  const token = textSource?.sourceToken || getMessageTranslationSourceToken(message, text);
  const currentEntry = untrack(() => state[peerId]?.messages[mid]);
  if(currentEntry?.token === token) return Promise.resolve();

  const key = getMessageKey(peerId, mid);
  const currentProcessing = processingMessages.get(key);
  if(currentProcessing?.token === token) return currentProcessing.promise;

  forgetMessageForTranslation(peerId, mid, key);
  if(!text) return Promise.resolve();

  const processing = {token} as ProcessingMessage;
  processing.promise = Promise.resolve()
  .then(() => detectLanguage(text))
  .then((language) => {
    if(processingMessages.get(key) !== processing) return;

    const currentMessage = getCurrentMessage(peerId, mid);
    if(!currentMessage || getMessageTranslationSourceToken(currentMessage) !== token) return;
    addMessageLanguage(peerId, mid, token, language);
  })
  .finally(() => {
    if(processingMessages.get(key) === processing) {
      processingMessages.delete(key);
    }
  });
  processingMessages.set(key, processing);
  return processing.promise;
}

export default function usePeerLanguage(peerId: () => PeerId, onlyIfForeign?: boolean) {
  return createMemo(() => {
    const _peerId = peerId();
    if(!_peerId) {
      return;
    }

    _createStore?.();
    const current = state[_peerId];
    if(current && current.total < MIN_TOTAL_PROCESSED_MESSAGES && !current.isFull) {
      return;
    }

    if(onlyIfForeign && current && (current.totalForeign / current.total) < MIN_FOREIGN_PERCENTAGE) {
      return;
    }

    return current?.language;
  });
}
