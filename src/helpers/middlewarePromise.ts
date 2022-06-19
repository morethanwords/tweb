/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

export default function middlewarePromise(middleware: () => boolean, throwWhat: any = '') {
  return <T>(promise: T): T => {
    if(!(promise instanceof Promise)) {
      if(promise instanceof Error) {
        throw promise;
      } else {
        return promise;
      }
    }

    return (promise as any as Promise<any>).then((result) => {
      if(!middleware()) {
        throw throwWhat;
      }

      return result;
    }) as any;
  };
}
