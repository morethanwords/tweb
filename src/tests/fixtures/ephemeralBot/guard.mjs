const GUARD_CHAT_IDS_ENV = 'TG_EPHEMERAL_BOT_GUARD_CHAT_IDS';
const GUARD_RESULT_ENV = 'TG_EPHEMERAL_BOT_GUARD_RESULT';
const GUARD_WEB_APP_URL_ENV = 'TG_EPHEMERAL_BOT_GUARD_WEB_APP_URL';

// answerChatJoinRequestQuery: "approve" to let the user in, "decline" to refuse,
// "queue" to leave the decision to the other administrators
export const GUARD_RESULTS = ['approve', 'decline', 'queue'];

const DEFAULT_WEB_APP_DELAY_MS = 8000;

function hasValue(value) {
  return !!value?.trim();
}

function parseChatIds(value) {
  const chatIds = value
    .split(',')
    .map((chatId) => chatId.trim())
    .filter(Boolean);
  if(!chatIds.length) {
    throw new Error(`${GUARD_CHAT_IDS_ENV} must contain at least one chat ID`);
  }

  const invalidChatId = chatIds.find((chatId) => !/^-?\d+$/.test(chatId));
  if(invalidChatId) {
    throw new Error(
      `Invalid Telegram chat ID in ${GUARD_CHAT_IDS_ENV}: ${invalidChatId}`
    );
  }

  return new Set(chatIds);
}

export function parseGuardConfig({chatIds, result, webAppUrl, webAppDelayMs, webAppStartDelayMs}) {
  if(!hasValue(chatIds)) {
    return;
  }

  const chosen = result?.trim() || GUARD_RESULTS[0];
  if(!GUARD_RESULTS.includes(chosen)) {
    throw new Error(
      `${GUARD_RESULT_ENV} must be one of: ${GUARD_RESULTS.join(', ')}`
    );
  }

  const url = webAppUrl?.trim();
  if(url && !/^https:\/\//.test(url)) {
    throw new Error(`${GUARD_WEB_APP_URL_ENV} must be an HTTPS URL`);
  }

  const delay = webAppDelayMs?.trim();
  const startDelay = webAppStartDelayMs?.trim();
  for(const value of [delay, startDelay]) {
    if(value && !/^\d+$/.test(value)) {
      throw new Error('The Mini App delays must be whole numbers of milliseconds');
    }
  }

  return {
    allowedChatIds: parseChatIds(chatIds),
    result: chosen,
    webAppUrl: url || undefined,
    webAppDelayMs: delay ? +delay : DEFAULT_WEB_APP_DELAY_MS,
    // holding the app back lets the client open the query first, so the URL reaches it as a
    // joinChatBotResultWebView decision and is swapped into the open Mini App instead of being
    // handed over by messages.requestChatJoinWebView. The server allows one app per query.
    webAppStartDelayMs: startDelay ? +startDelay : 0
  };
}

/**
 * A query the bot can no longer answer: it expired, or it was already resolved — a restarted
 * fixture is handed back the queries it did not finish, and the same one returns on every poll
 * until the batch is acknowledged. Killing the process there wedges it forever on that one update,
 * so these are logged and skipped instead. The message is always logged, so a genuine mistake (a
 * wrong parameter name is a 400 too) is still visible on the very first attempt.
 */
export function isUnanswerableQueryError(error) {
  return error?.errorCode === 400 &&
    /query is too old|query ID is invalid|QUERY_ID_INVALID|RESULT_INVALID/i.test(error?.message || '');
}

/**
 * A guard bot only sees `query_id` when the chat actually delegated its join requests to it — an
 * ordinary "approve new members" request arrives without one and must be left to the admins,
 * because `answerChatJoinRequestQuery` has nothing to answer.
 */
export function getJoinRequestRejectionReason(joinRequest, config) {
  if(!config.allowedChatIds.has(String(joinRequest?.chat?.id))) {
    return 'chat-not-allowed';
  }

  if(!joinRequest.query_id) {
    return 'not-a-guard-query';
  }

  if(!joinRequest.from?.id) {
    return 'sender-missing';
  }
}

/**
 * With a Mini App configured the query is resolved in two steps, the way a real guard bot works:
 * the app is shown first and the outcome is sent once the user has had a chance to interact with
 * it. The client keeps the query alive in between and swaps the Mini App URL in place.
 */
export async function processJoinRequest({
  joinRequest,
  config,
  handledQueryIds,
  answerJoinRequestQuery,
  sendJoinRequestWebApp,
  wait,
  onWebAppSent
}) {
  const rejectionReason = getJoinRequestRejectionReason(joinRequest, config);
  if(rejectionReason) {
    return {type: 'ignored', reason: rejectionReason};
  }

  const queryId = String(joinRequest.query_id);
  if(handledQueryIds.has(queryId)) {
    return {type: 'ignored', reason: 'already-answered'};
  }

  handledQueryIds.add(queryId);

  if(config.webAppUrl) {
    if(config.webAppStartDelayMs) {
      await wait(config.webAppStartDelayMs);
    }

    await sendJoinRequestWebApp({
      chat_join_request_query_id: joinRequest.query_id,
      web_app_url: config.webAppUrl
    });
    onWebAppSent?.(config.webAppUrl);
    await wait(config.webAppDelayMs);
  }

  await answerJoinRequestQuery({
    chat_join_request_query_id: joinRequest.query_id,
    result: config.result
  });

  return {
    type: 'answered',
    result: config.result,
    webAppSent: !!config.webAppUrl,
    userId: joinRequest.from.id
  };
}
