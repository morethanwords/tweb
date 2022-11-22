/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import makeError from './makeError';

const error = makeError('MIDDLEWARE');
export default function middlewarePromise(middleware: () => boolean, throwWhat: any = error) {
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
