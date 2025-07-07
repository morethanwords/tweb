import {onCleanup} from 'solid-js';

type PossibleEvent = DocumentEventMap[keyof DocumentEventMap];

type EventsMapValue = {
  callbacks: Array<(e: PossibleEvent) => void>;
  listener: (e: PossibleEvent) => void;
};

const eventsMap = new Map<keyof DocumentEventMap, EventsMapValue>;

export function registerGlobalDocumentEvent<Key extends keyof DocumentEventMap>(eventName: Key, callback: (e: DocumentEventMap[Key]) => void) {
  const value: EventsMapValue = eventsMap.get(eventName) || {
    callbacks: [],
    listener: (e) => {
      value.callbacks.forEach(clb => clb(e));
    }
  };

  if(!eventsMap.has(eventName)) {
    eventsMap.set(eventName, value);
    document.addEventListener(eventName, value.listener);
  }

  value.callbacks.push(callback as (e: PossibleEvent) => void);

  return {
    cleanup: () => {
      value.callbacks = value.callbacks.filter(clb => clb !== callback);
      if(value.callbacks.length) return;

      eventsMap.delete(eventName);
      document.removeEventListener(eventName, value.listener);
    }
  }
}

export default function useGlobalDocumentEvent<Key extends keyof DocumentEventMap>(eventName: Key, callback: (e: DocumentEventMap[Key]) => void) {
  const {cleanup} = registerGlobalDocumentEvent(eventName, callback);

  onCleanup(cleanup);
};
