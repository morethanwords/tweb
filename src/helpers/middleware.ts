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
