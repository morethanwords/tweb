const CACHED_ERRORS: {[key in Error['type']]?: ApiError} = {};
export default function makeError(type: Error['type']) {
  return CACHED_ERRORS[type] ??= {
    type
  };
}
