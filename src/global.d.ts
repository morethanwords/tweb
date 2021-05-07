declare module 'worker-loader!*' {
  class WebpackWorker extends Worker {
    constructor();
  }

  export default WebpackWorker;
}

declare const electronHelpers: {
  openExternal(url): void;
} | undefined;
