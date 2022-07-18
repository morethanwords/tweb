/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

export default function setWorkerProxy() {
  // * hook worker constructor to set search parameters (test, debug, etc)
  const workerHandler = {
    construct(target: any, args: any) {
      //console.log(target, args);
      const url = args[0] + location.search;

      return new target(url);
    }
  };

  [
    Worker, 
    typeof(SharedWorker) !== 'undefined' && SharedWorker
  ].forEach((w) => {
    if(!w) return;
    window[w.name as any] = new Proxy(w, workerHandler);
  });
}

setWorkerProxy();
