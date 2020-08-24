declare module 'worker-loader!*' {
  class WebpackWorker extends Worker {
    constructor();
  }

  export default WebpackWorker;
}

declare function setInterval(callback: (...args: any[]) => void, ms: number): number;
declare function setTimeout(callback: (...args: any[]) => void, ms: number): number;