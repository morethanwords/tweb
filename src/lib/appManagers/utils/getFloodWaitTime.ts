type Result = {
  hasWaitTime: true;
  waitTime: number;
} | {
  hasWaitTime: false;
};

/**
 * Extracts the flood wait time from an API error. Will return false in the case the match is 0 or the wait time is not a valid number.
 */
export function getFloodWaitTime(error: ApiError): Result {
  const match = error.type.match(/^FLOOD_WAIT_(\d+)/);
  const waitTime = match ? parseInt(match[1]) || 0 : 0;

  return waitTime ? {hasWaitTime: true, waitTime} : {hasWaitTime: false};
}
