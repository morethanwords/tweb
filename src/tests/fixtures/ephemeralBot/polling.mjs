export class BotApiError extends Error {
  constructor(method, result, status) {
    const description = result?.description || `HTTP ${status}`;
    super(`${method}: ${description}`);
    this.name = 'BotApiError';
    this.errorCode = result?.error_code || status;
    this.retryAfter = result?.parameters?.retry_after;
  }
}

export class UpdateHandlingError extends Error {
  constructor(updateId, cause) {
    super(`Failed to handle Telegram update ${updateId}`, {cause});
    this.name = 'UpdateHandlingError';
    this.updateId = updateId;
  }
}

export function getErrorDetails(error) {
  const details = {
    message: error instanceof Error ? error.message : String(error)
  };
  if(error instanceof BotApiError) {
    details.errorCode = error.errorCode;
  }

  return details;
}

export function isRetryablePollError(error) {
  if(error?.name === 'AbortError') {
    return false;
  }

  if(!(error instanceof BotApiError)) {
    return true;
  }

  return error.errorCode === 408 ||
    error.errorCode === 429 ||
    error.errorCode >= 500;
}

export function getPollRetryDelay(error) {
  const seconds = error instanceof BotApiError ?
    error.retryAfter || 1 :
    1;
  return Math.min(Math.max(seconds, 1), 30) * 1000;
}

export async function processUpdateBatch(
  updates,
  {handleUpdate, isStopping, onOffset}
) {
  for(const update of updates) {
    if(isStopping()) {
      return;
    }

    try {
      await handleUpdate(update);
    } catch(error) {
      throw new UpdateHandlingError(update.update_id, error);
    }

    onOffset(update.update_id + 1);
  }
}
