// Anchored ephemeral messages: a bot answers a button press by showing the pressing user a
// private version of the message the button is on, in place of the original. The client keeps
// the original and restores it once the private version is deleted — by the bot, or by the user
// through Revert.

export const ANCHOR_CALLBACKS = {
  replace: 'anchor-replace',
  edit: 'anchor-edit',
  revert: 'anchor-revert'
};

const PRIVATE_KEYBOARD = {
  inline_keyboard: [[
    {text: 'Edit my version', callback_data: ANCHOR_CALLBACKS.edit},
    {text: 'Revert from the bot', callback_data: ANCHOR_CALLBACKS.revert}
  ]]
};

/** The ordinary message everybody sees, carrying the button that replaces it for one user. */
export function makeAnchorMessage(chatId) {
  return {
    chat_id: chatId,
    text: 'Public message: everybody sees this text',
    reply_markup: {
      inline_keyboard: [[
        {text: 'Show my private version', callback_data: ANCHOR_CALLBACKS.replace}
      ]]
    }
  };
}

export function isAnchorCallback(data) {
  return Object.values(ANCHOR_CALLBACKS).includes(data);
}

function getAnchorKey(chatId, userId) {
  return `${chatId}:${userId}`;
}

/**
 * `anchors` maps a chat and user to the private version standing in for the public message, so
 * the buttons on that version can edit and delete it: a callback from an ephemeral message is not
 * guaranteed to name it.
 */
export async function processAnchorCallback({
  query,
  anchors,
  sendMessage,
  editEphemeralMessageText,
  deleteEphemeralMessage
}) {
  const chatId = query.message?.chat?.id;
  const userId = query.from?.id;
  if(!chatId || !userId) {
    return {type: 'ignored', reason: 'chat-or-user-missing'};
  }

  const key = getAnchorKey(chatId, userId);
  if(query.data === ANCHOR_CALLBACKS.replace) {
    const sent = await sendMessage({
      chat_id: chatId,
      ephemeral_message_parameters: {
        receiver_user_id: userId,
        callback_query_id: query.id,
        replace_callback_query_message: true
      },
      text: 'Private version: only you see this text in place of the public one',
      reply_markup: PRIVATE_KEYBOARD
    });
    anchors.set(key, sent.ephemeral_message_id);
    return {type: 'replaced', ephemeralMessageId: sent.ephemeral_message_id};
  }

  const ephemeralMessageId = anchors.get(key) ?? query.message?.ephemeral_message_id;
  if(!ephemeralMessageId) {
    return {type: 'ignored', reason: 'no-private-version'};
  }

  const target = {
    chat_id: chatId,
    receiver_user_id: userId,
    ephemeral_message_id: ephemeralMessageId
  };

  if(query.data === ANCHOR_CALLBACKS.edit) {
    await editEphemeralMessageText({
      ...target,
      text: 'Private version, edited by the bot',
      reply_markup: PRIVATE_KEYBOARD
    });
    return {type: 'edited', ephemeralMessageId};
  }

  if(query.data === ANCHOR_CALLBACKS.revert) {
    await deleteEphemeralMessage(target);
    anchors.delete(key);
    return {type: 'reverted', ephemeralMessageId};
  }

  return {type: 'ignored', reason: 'unknown-callback'};
}
