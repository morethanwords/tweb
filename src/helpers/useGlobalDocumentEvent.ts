import {onCleanup} from 'solid-js';
import {bindActiveWindowListener} from '@helpers/appWindow';

type PossibleEvent = DocumentEventMap[keyof DocumentEventMap];

type EventsMapValue = {
  callbacks: Array<(e: PossibleEvent) => void>;
  listener: (e: PossibleEvent) => void;
  dispose?: () => void;
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
    // Re-bind to the active window's document on every PiP enter/exit so the swipe directive
    // keeps receiving pointer/touch events when the client is popped into a Document PiP window.
    value.dispose = bindActiveWindowListener((w) => w.document, eventName, value.listener);
  }

  value.callbacks.push(callback as (e: PossibleEvent) => void);

  return {
    cleanup: () => {
      value.callbacks = value.callbacks.filter(clb => clb !== callback);
      if(value.callbacks.length) return;

      eventsMap.delete(eventName);
      value.dispose?.();
    }
  }
}

export default function useGlobalDocumentEvent<Key extends keyof DocumentEventMap>(eventName: Key, callback: (e: DocumentEventMap[Key]) => void) {
  const {cleanup} = registerGlobalDocumentEvent(eventName, callback);

  onCleanup(cleanup);
};
