const BUSINESS_USER_IDS_ENV = 'TG_EPHEMERAL_BOT_BUSINESS_USER_IDS';
const BUSINESS_CHAT_IDS_ENV = 'TG_EPHEMERAL_BOT_BUSINESS_CHAT_IDS';

function hasValue(value) {
  return !!value?.trim();
}

function parseIds(value, environmentVariable) {
  const ids = value
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
  if(!ids.length) {
    throw new Error(`${environmentVariable} must contain at least one ID`);
  }

  const invalidId = ids.find((id) => !/^[1-9]\d*$/.test(id));
  if(invalidId) {
    throw new Error(
      `Invalid Telegram ID in ${environmentVariable}: ${invalidId}`
    );
  }

  return new Set(ids);
}

export function parseBusinessConfig({userIds, chatIds}) {
  const hasUserIds = hasValue(userIds);
  const hasChatIds = hasValue(chatIds);

  if(!hasUserIds && !hasChatIds) {
    return;
  }

  if(!hasUserIds || !hasChatIds) {
    throw new Error(
      `${BUSINESS_USER_IDS_ENV} and ${BUSINESS_CHAT_IDS_ENV} ` +
      'must be set together'
    );
  }

  return {
    allowedUserIds: parseIds(userIds, BUSINESS_USER_IDS_ENV),
    allowedChatIds: parseIds(chatIds, BUSINESS_CHAT_IDS_ENV)
  };
}

export function isBusinessConnectionAllowed(connection, allowedUserIds) {
  return !!connection?.id &&
    connection.is_enabled === true &&
    allowedUserIds.has(String(connection.user?.id));
}

export function isBusinessChatAllowed(payload, connection, config) {
  return isBusinessConnectionAllowed(connection, config.allowedUserIds) &&
    payload?.business_connection_id === connection.id &&
    config.allowedChatIds.has(String(payload.chat?.id));
}

export function isBusinessMessageFromCurrentRun(message, startedAt) {
  return Number.isSafeInteger(message?.date) && message.date >= startedAt;
}

export function getBusinessMessageRejectionReason(
  message,
  connection,
  config
) {
  if(!isBusinessConnectionAllowed(connection, config.allowedUserIds)) {
    return 'connection-not-allowed';
  }

  if(message?.business_connection_id !== connection.id) {
    return 'connection-mismatch';
  }

  if(!config.allowedChatIds.has(String(message.chat?.id))) {
    return 'chat-not-allowed';
  }

  if(message.chat?.type !== 'private') {
    return 'chat-not-private';
  }

  if(!message.from?.id) {
    return 'sender-missing';
  }

  if(message.sender_business_bot) {
    return 'sent-by-business-bot';
  }

  if(String(message.from.id) === String(connection.user.id)) {
    return 'sent-by-business-owner';
  }

  if(message.is_from_offline) {
    return 'automatic-business-message';
  }
}

export function buildBusinessReplyParams(message, text) {
  return {
    business_connection_id: message.business_connection_id,
    chat_id: message.chat.id,
    reply_parameters: {
      message_id: message.message_id
    },
    text
  };
}

function getBusinessMessageKey(message) {
  return [
    message.business_connection_id,
    message.chat.id,
    message.message_id
  ].join(':');
}

export async function processBusinessMessage({
  message,
  connection,
  config,
  edited,
  command,
  handledMessageKeys,
  readBusinessMessage,
  sendBusinessMessage,
  replyText,
  onReadError
}) {
  const rejectionReason = getBusinessMessageRejectionReason(
    message,
    connection,
    config
  );
  if(rejectionReason) {
    return {type: 'ignored', reason: rejectionReason};
  }

  if(edited) {
    return {type: 'edited'};
  }

  if(command !== 'business') {
    return {type: 'ignored'};
  }

  if(connection.rights?.can_reply !== true) {
    return {type: 'ignored', reason: 'reply-right-missing'};
  }

  const messageKey = getBusinessMessageKey(message);
  if(handledMessageKeys.has(messageKey)) {
    return {type: 'ignored', reason: 'duplicate-update'};
  }

  let markedAsRead = false;
  if(connection.rights?.can_read_messages === true) {
    try {
      await readBusinessMessage({
        business_connection_id: message.business_connection_id,
        chat_id: message.chat.id,
        message_id: message.message_id
      });
      markedAsRead = true;
    } catch(error) {
      onReadError?.(error);
    }
  }

  await sendBusinessMessage(buildBusinessReplyParams(message, replyText));
  handledMessageKeys.add(messageKey);
  return {type: 'replied', markedAsRead};
}
