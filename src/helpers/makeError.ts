export default function makeError(type: ErrorType, message?: string): ApiError {
  const realError = new Error();
  const error: ApiError = {type, stack: realError.stack};
  if(message) {
    error.message = message;
  }

  return error;
}
