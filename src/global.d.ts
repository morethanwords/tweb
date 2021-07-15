import type ListenerSetter from "./helpers/listenerSetter";

declare global {
  interface AddEventListenerOptions extends EventListenerOptions {
    once?: boolean;
    passive?: boolean;
    // ls?: ListenerSetter;
  }

  declare module 'worker-loader!*' {
    class WebpackWorker extends Worker {
      constructor();
    }
  
    export default WebpackWorker;
  }

  declare const electronHelpers: {
    openExternal(url): void;
  } | undefined;
}
