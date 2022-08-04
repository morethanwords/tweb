export default function makeError(type: Error['type']) {
  const error: ApiError = {
    type
  };

  return error;
}
