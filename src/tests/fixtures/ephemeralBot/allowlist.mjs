export function parseAllowedChatIds(value) {
  const chatIds = (value || '')
    .split(',')
    .map((chatId) => chatId.trim())
    .filter(Boolean);

  if(!chatIds.length) {
    throw new Error('TG_EPHEMERAL_BOT_CHAT_IDS is required');
  }

  const invalidChatId = chatIds.find((chatId) => !/^-?\d+$/.test(chatId));
  if(invalidChatId) {
    throw new Error(`Invalid Telegram chat ID: ${invalidChatId}`);
  }

  return new Set(chatIds);
}

export function getUpdateChatId(update) {
  return update.message?.chat?.id ??
    update.callback_query?.message?.chat?.id;
}

export function isUpdateAllowed(update, allowedChatIds) {
  const chatId = getUpdateChatId(update);
  return chatId !== undefined &&
    chatId !== null &&
    allowedChatIds.has(String(chatId));
}
