/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

// * will change .cleaned and new instance will be created
export const getMiddleware = () => {
  let cleanupObj = {cleaned: false};
  return {
    clean: () => {
      cleanupObj.cleaned = true;
      cleanupObj = {cleaned: false};
    },
    get: () => {
      const _cleanupObj = cleanupObj;
      return () => {
        return !_cleanupObj.cleaned;
      };
    }
  };
};
