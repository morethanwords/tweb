type TypedEventData<EventName extends string, Payload = void> = {
  eventName: EventName;
  payload: Payload;
};

function isEventValid(eventData: unknown): eventData is TypedEventData<string, unknown> {
  return typeof eventData === 'object' && eventData !== null && 'eventName' in eventData && typeof eventData.eventName === 'string';
}

export type BroadcastChannelWrapper<EventMap extends Record<string, any>> = {
  on: <LocalEventName extends keyof EventMap>(eventName: LocalEventName, listener: (payload: EventMap[LocalEventName]) => void) => (() => void);
  emit: <LocalEventName extends keyof EventMap>(eventName: LocalEventName, payload: EventMap[LocalEventName]) => void;
  emitVoid: <LocalEventName extends VoidKeys<EventMap>>(eventName: LocalEventName) => void;
  close: () => void;
};

type VoidKeys<M extends Record<string, any>> = keyof {
  [K in keyof M]: M[K] extends void ? K : never
};

export function createBroadcastChannelWrapper<EventMap extends Record<string, any>>(name: string): BroadcastChannelWrapper<EventMap> {
  const broadcastChannel = new BroadcastChannel(name);

  const listeners = new Map<string, Array<(payload: any) => void>>();

  broadcastChannel.onmessage = (event) => {
    const data = event.data;
    if(!isEventValid(data)) {
      return;
    }

    const {eventName, payload} = data;

    const listenersForEvent = listeners.get(eventName);
    if(listenersForEvent) {
      listenersForEvent.forEach(listener => listener(payload));
    }
  };

  return {
    on: (inEventName, listener) => {
      const eventName = inEventName as string;
      const listenersForEvent = listeners.get(eventName);
      if(listenersForEvent) {
        listenersForEvent.push(listener);
      } else {
        listeners.set(eventName, [listener]);
      }

      const remove = () => {
        const listenersForEvent = listeners.get(eventName);
        if(listenersForEvent) {
          const index = listenersForEvent.indexOf(listener);
          if(index !== -1) {
            listenersForEvent.splice(index, 1);
          }
        }
      };

      return remove;
    },
    emit: (eventName, payload) => {
      broadcastChannel.postMessage({eventName, payload});
    },
    emitVoid: (eventName) => {
      broadcastChannel.postMessage({eventName});
    },
    close: () => {
      broadcastChannel.close();
    }
  };
}
