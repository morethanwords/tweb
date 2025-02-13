export default function makeError(type: ErrorType, message?: string) {
  // @ts-ignore
  const error = new Error(message, {cause: type}) as ApiError;
  return error;
}
