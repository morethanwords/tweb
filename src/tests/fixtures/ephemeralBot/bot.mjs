import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {
  isUpdateAllowed,
  parseAllowedChatIds
} from './allowlist.mjs';
import {
  isBusinessChatAllowed,
  isBusinessConnectionAllowed,
  isBusinessMessageFromCurrentRun,
  parseBusinessConfig,
  processBusinessMessage
} from './business.mjs';
import {
  isUnanswerableQueryError,
  parseGuardConfig,
  processJoinRequest
} from './guard.mjs';
import {
  BotApiError,
  getErrorDetails,
  getPollRetryDelay,
  isRetryablePollError,
  processUpdateBatch,
  UpdateHandlingError
} from './polling.mjs';

const DEFAULT_EXPECTED_USERNAME = 'tweb_ephemeral_ui_25359431_bot';

function getFixturePath(filename) {
  return fileURLToPath(new URL(`./media/${filename}`, import.meta.url));
}
const MEDIA = {
  animation: {
    field: 'animation',
    filename: 'ephemeral-animation.gif',
    mime: 'image/gif',
    path: getFixturePath('animation.gif')
  },
  audio: {
    field: 'audio',
    filename: 'ephemeral-audio.mp3',
    mime: 'audio/mpeg',
    path: getFixturePath('audio.mp3')
  },
  document: {
    field: 'document',
    filename: 'ephemeral-document.txt',
    mime: 'text/plain',
    path: getFixturePath('document.txt')
  },
  sticker: {
    field: 'sticker',
    filename: 'ephemeral-sticker.webp',
    mime: 'image/webp',
    path: getFixturePath('sticker.webp')
  },
  video: {
    field: 'video',
    filename: 'ephemeral-video.mp4',
    mime: 'video/mp4',
    path: getFixturePath('video.mp4')
  },
  videoNote: {
    field: 'video_note',
    filename: 'ephemeral-video-note.mp4',
    mime: 'video/mp4',
    path: getFixturePath('video-note.mp4')
  },
  voice: {
    field: 'voice',
    filename: 'ephemeral-voice.ogg',
    mime: 'audio/ogg',
    path: getFixturePath('voice.ogg')
  }
};

const token = process.env.TG_EPHEMERAL_BOT_TOKEN?.trim();
if(!token) {
  throw new Error('TG_EPHEMERAL_BOT_TOKEN is required');
}

const expectedUsername = (
  process.env.TG_EPHEMERAL_BOT_USERNAME || DEFAULT_EXPECTED_USERNAME
).replace(/^@/, '');
const ephemeralChatIdsValue = process.env.TG_EPHEMERAL_BOT_CHAT_IDS?.trim();
const allowedChatIds = ephemeralChatIdsValue ?
  parseAllowedChatIds(ephemeralChatIdsValue) :
  new Set();
const businessConfig = parseBusinessConfig({
  userIds: process.env.TG_EPHEMERAL_BOT_BUSINESS_USER_IDS,
  chatIds: process.env.TG_EPHEMERAL_BOT_BUSINESS_CHAT_IDS
});
const guardConfig = parseGuardConfig({
  chatIds: process.env.TG_EPHEMERAL_BOT_GUARD_CHAT_IDS,
  result: process.env.TG_EPHEMERAL_BOT_GUARD_RESULT,
  webAppUrl: process.env.TG_EPHEMERAL_BOT_GUARD_WEB_APP_URL,
  webAppDelayMs: process.env.TG_EPHEMERAL_BOT_GUARD_WEB_APP_DELAY_MS,
  webAppStartDelayMs: process.env.TG_EPHEMERAL_BOT_GUARD_WEB_APP_START_DELAY_MS
});
if(!allowedChatIds.size && !businessConfig && !guardConfig) {
  throw new Error(
    'Configure TG_EPHEMERAL_BOT_CHAT_IDS, the Guard Mode allowlist, ' +
    'or both Business Mode allowlists'
  );
}

const apiUrl = `https://api.telegram.org/bot${token}/`;
const businessStartedAt = Math.floor(Date.now() / 1000);
const businessConnections = new Map();
const handledBusinessMessages = new Set();
const handledJoinQueries = new Set();
let stopRequested = false;
let activePollController;
let offset;

function log(event, details = {}) {
  console.log(JSON.stringify({event, ...details}));
}

function waitForRetry(delay, signal) {
  if(signal.aborted) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    const finish = () => {
      clearTimeout(timer);
      signal.removeEventListener('abort', finish);
      resolve();
    };
    const timer = setTimeout(finish, delay);
    signal.addEventListener('abort', finish, {once: true});
  });
}

async function call(method, params = {}, options = {}) {
  const response = await fetch(apiUrl + method, {
    method: 'POST',
    headers: {'content-type': 'application/json'},
    body: JSON.stringify(params),
    signal: options.signal
  });
  let result;
  try {
    result = await response.json();
  } catch(error) {
    if(!response.ok) {
      throw new BotApiError(method, undefined, response.status);
    }

    throw error;
  }

  if(!response.ok || !result.ok) {
    throw new BotApiError(method, result, response.status);
  }

  return result.result;
}

const bot = await call('getMe');
if(expectedUsername && bot.username !== expectedUsername) {
  throw new Error(
    `Expected @${expectedUsername}, received credentials for @${bot.username}`
  );
}
if(businessConfig && bot.can_connect_to_business !== true) {
  throw new Error(
    `@${bot.username} cannot be connected to a Telegram Business account`
  );
}
if(guardConfig && bot.supports_join_request_queries !== true) {
  throw new Error(
    `@${bot.username} cannot process join request queries; enable it in @BotFather ` +
    'and assign the bot as the guard bot of the test chat'
  );
}

const webhookInfo = await call('getWebhookInfo');
if(webhookInfo.url) {
  throw new Error(
    `@${bot.username} has an active webhook; remove it before using long polling`
  );
}

function getCommand(message) {
  const text = message.text || message.caption || '';
  const command = text.trim().split(/\s+/, 1)[0];
  if(!command.startsWith('/')) {
    return '';
  }

  return command.slice(1).split('@', 1)[0].toLowerCase();
}

function getReplyContext(message) {
  const receiverUserId = message.from?.id;
  if(!receiverUserId || !message.ephemeral_message_id) {
    return;
  }

  return {
    chatId: message.chat.id,
    receiverUserId,
    replyParameters: {
      ephemeral_message_id: message.ephemeral_message_id
    }
  };
}

function getMediaType(message) {
  return [
    'photo',
    'video',
    'animation',
    'document',
    'audio',
    'voice',
    'video_note',
    'sticker',
    'poll',
    'location'
  ].find((type) => message[type]) || 'text';
}

async function sendEphemeral(context, method, params) {
  return call(method, {
    chat_id: context.chatId,
    receiver_user_id: context.receiverUserId,
    reply_parameters: context.replyParameters,
    ...params
  });
}

async function sendEphemeralFile(context, method, media, extra = {}) {
  const form = new FormData();
  form.append('chat_id', '' + context.chatId);
  form.append('receiver_user_id', '' + context.receiverUserId);
  form.append('reply_parameters', JSON.stringify(context.replyParameters));
  for(const [key, value] of Object.entries(extra)) {
    form.append(key, typeof(value) === 'string' ? value : JSON.stringify(value));
  }
  form.append(
    media.field,
    new Blob([await readFile(media.path)], {type: media.mime}),
    media.filename
  );

  const response = await fetch(apiUrl + method, {
    method: 'POST',
    body: form
  });
  const result = await response.json();
  if(!response.ok || !result.ok) {
    throw new Error(`${method}: ${result.description || response.status}`);
  }

  return result.result;
}

async function handleMessage(message) {
  const command = getCommand(message);

  if(command === 'plain') {
    await call('sendMessage', {
      chat_id: message.chat.id,
      text: 'Ordinary public bot reply'
    });
    log('ordinary-message', {command});
    return;
  }

  const context = getReplyContext(message);
  const mediaType = getMediaType(message);
  if(!command && context) {
    log('ephemeral-client-media', {mediaType});
    await sendEphemeral(context, 'sendMessage', {
      text: `Received private ${mediaType}`
    });
    return;
  }

  if(!command) {
    return;
  }

  if(!context) {
    log('ignored-message', {
      command,
      reason: 'missing-ephemeral-context'
    });
    return;
  }

  log('ephemeral-message', {
    command,
    mediaType,
    updateEphemeralId: !!message.ephemeral_message_id
  });

  if(command === 'media') {
    await sendEphemeral(context, 'sendPhoto', {
      photo: 'https://telegram.org/img/t_logo.png',
      caption: 'Private media response'
    });
    return;
  }

  if(command === 'sticker') {
    await sendEphemeralFile(context, 'sendSticker', MEDIA.sticker);
    return;
  }

  if(command === 'video') {
    await sendEphemeralFile(context, 'sendVideo', MEDIA.video, {
      caption: 'Private video response'
    });
    return;
  }

  if(command === 'animation') {
    await sendEphemeralFile(context, 'sendAnimation', MEDIA.animation, {
      caption: 'Private animation response'
    });
    return;
  }

  if(command === 'document') {
    await sendEphemeralFile(context, 'sendDocument', MEDIA.document, {
      caption: 'Private document response'
    });
    return;
  }

  if(command === 'audio') {
    await sendEphemeralFile(context, 'sendAudio', MEDIA.audio, {
      caption: 'Private audio response',
      performer: 'QA bot',
      title: 'Ephemeral audio'
    });
    return;
  }

  if(command === 'voice') {
    await sendEphemeralFile(context, 'sendVoice', MEDIA.voice, {
      caption: 'Private voice response'
    });
    return;
  }

  if(command === 'videonote') {
    await sendEphemeralFile(context, 'sendVideoNote', MEDIA.videoNote);
    return;
  }

  if(command === 'poll') {
    await sendEphemeral(context, 'sendMessage', {
      text: 'Telegram does not support polls in ephemeral messages.'
    });
    log('unsupported-ephemeral-content', {command});
    return;
  }

  if(command === 'location') {
    await sendEphemeral(context, 'sendLocation', {
      latitude: 25.2048,
      longitude: 55.2708
    });
    return;
  }

  if(command === 'link') {
    await sendEphemeral(context, 'sendMessage', {
      text: 'Private link preview https://telegram.org/'
    });
    return;
  }

  if(command === 'burst') {
    for(let i = 1; i <= 3; ++i) {
      await sendEphemeral(context, 'sendMessage', {
        text: `Private grouped response ${i}`
      });
    }
    return;
  }

  if(command === 'button') {
    await sendEphemeral(context, 'sendMessage', {
      text: 'Private button response',
      reply_markup: {
        inline_keyboard: [[{
          text: 'Test callback',
          callback_data: 'ephemeral-test'
        }]]
      }
    });
    return;
  }

  if(command === 'edit') {
    const sent = await sendEphemeral(context, 'sendMessage', {
      text: 'Private reply before edit'
    });
    await new Promise((resolve) => setTimeout(resolve, 600));
    await call('editEphemeralMessageText', {
      chat_id: context.chatId,
      receiver_user_id: context.receiverUserId,
      ephemeral_message_id: sent.ephemeral_message_id,
      text: 'Private reply edited successfully'
    });
    return;
  }

  if(command === 'delete') {
    const sent = await sendEphemeral(context, 'sendMessage', {
      text: 'Private reply scheduled for deletion'
    });
    await new Promise((resolve) => setTimeout(resolve, 800));
    await call('deleteEphemeralMessage', {
      chat_id: context.chatId,
      receiver_user_id: context.receiverUserId,
      ephemeral_message_id: sent.ephemeral_message_id
    });
    return;
  }

  await sendEphemeral(context, 'sendMessage', {
    text: `Private bot reply to /${command}`
  });
}

async function handleCallbackQuery(query) {
  await call('answerCallbackQuery', {
    callback_query_id: query.id
  });

  const chatId = query.message?.chat?.id;
  if(!chatId || !query.from?.id) {
    return;
  }

  await call('sendMessage', {
    chat_id: chatId,
    receiver_user_id: query.from.id,
    callback_query_id: query.id,
    text: 'Private callback response'
  });
  log('callback-query', {handled: true});
}

function handleBusinessConnection(connection) {
  if(!isBusinessConnectionAllowed(
    connection,
    businessConfig.allowedUserIds
  )) {
    businessConnections.delete(connection.id);
    log('business-connection-ignored', {
      reason: connection.is_enabled ?
        'business-user-not-allowed' :
        'connection-disabled'
    });
    return;
  }

  businessConnections.set(connection.id, connection);
  log('business-connection-ready', {
    canReadMessages: connection.rights?.can_read_messages === true,
    canReply: connection.rights?.can_reply === true
  });
}

async function getAllowedBusinessConnection(connectionId) {
  if(!connectionId) {
    return;
  }

  const cached = businessConnections.get(connectionId);
  if(cached) {
    return cached;
  }

  const connection = await call('getBusinessConnection', {
    business_connection_id: connectionId
  });
  if(!isBusinessConnectionAllowed(
    connection,
    businessConfig.allowedUserIds
  )) {
    log('business-connection-ignored', {
      reason: connection.is_enabled ?
        'business-user-not-allowed' :
        'connection-disabled'
    });
    return;
  }

  businessConnections.set(connection.id, connection);
  return connection;
}

async function handleBusinessMessage(message, edited) {
  if(!businessConfig.allowedChatIds.has(String(message.chat?.id))) {
    log('business-message-ignored', {reason: 'chat-not-allowed'});
    return;
  }

  if(!isBusinessMessageFromCurrentRun(message, businessStartedAt)) {
    log('business-message-ignored', {reason: 'message-predates-startup'});
    return;
  }

  const connection = await getAllowedBusinessConnection(
    message.business_connection_id
  );
  const result = await processBusinessMessage({
    message,
    connection,
    config: businessConfig,
    edited,
    command: getCommand(message),
    handledMessageKeys: handledBusinessMessages,
    readBusinessMessage: (params) => call('readBusinessMessage', params),
    sendBusinessMessage: (params) => call('sendMessage', params),
    replyText: `Business automation reply from @${bot.username}`,
    onReadError: (error) => {
      log('business-read-error', {message: error.message});
    }
  });
  if(result.type === 'edited') {
    log('business-message-edited');
    return;
  }

  if(result.type === 'ignored') {
    if(result.reason) {
      log('business-message-ignored', {reason: result.reason});
    }
    return;
  }

  log('business-message-replied', {markedAsRead: result.markedAsRead});
}

async function handleDeletedBusinessMessages(deletedMessages) {
  if(!businessConfig.allowedChatIds.has(String(deletedMessages.chat?.id))) {
    log('business-messages-deleted-ignored', {
      reason: 'chat-not-allowed'
    });
    return;
  }

  const connection = await getAllowedBusinessConnection(
    deletedMessages.business_connection_id
  );
  if(!isBusinessChatAllowed(
    deletedMessages,
    connection,
    businessConfig
  )) {
    log('business-messages-deleted-ignored', {
      reason: 'connection-or-chat-not-allowed'
    });
    return;
  }

  log('business-messages-deleted', {
    messageCount: deletedMessages.message_ids?.length || 0
  });
}

async function handleJoinRequest(joinRequest) {
  let result;
  try {
    result = await processJoinRequest({
      joinRequest,
      config: guardConfig,
      handledQueryIds: handledJoinQueries,
      answerJoinRequestQuery: (params) => call('answerChatJoinRequestQuery', params),
      sendJoinRequestWebApp: (params) => call('sendChatJoinRequestWebApp', params),
      wait: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
      onWebAppSent: (url) => log('guard-web-app-sent', {url})
    });
  } catch(error) {
    if(!isUnanswerableQueryError(error)) {
      throw error;
    }

    log('guard-query-unanswerable', {
      userId: joinRequest.from?.id,
      message: error.message
    });
    return;
  }

  if(result.type === 'ignored') {
    log('guard-join-request-ignored', {reason: result.reason});
    return;
  }

  log('guard-join-request-answered', {
    result: result.result,
    webAppSent: result.webAppSent,
    userId: result.userId
  });
}

async function handleUpdate(update) {
  if(guardConfig && update.chat_join_request) {
    await handleJoinRequest(update.chat_join_request);
    return;
  }

  if(businessConfig && update.business_connection) {
    handleBusinessConnection(update.business_connection);
    return;
  }

  if(businessConfig && update.business_message) {
    await handleBusinessMessage(update.business_message, false);
    return;
  }

  if(businessConfig && update.edited_business_message) {
    await handleBusinessMessage(update.edited_business_message, true);
    return;
  }

  if(businessConfig && update.deleted_business_messages) {
    await handleDeletedBusinessMessages(update.deleted_business_messages);
    return;
  }

  if(!isUpdateAllowed(update, allowedChatIds)) {
    log('ignored-update', {
      updateId: update.update_id,
      reason: 'chat-not-allowed'
    });
    return;
  }

  if(update.callback_query) {
    await handleCallbackQuery(update.callback_query);
  } else if(update.message) {
    await handleMessage(update.message);
  }
}

function requestStop() {
  if(stopRequested) {
    return;
  }

  stopRequested = true;
  activePollController?.abort();
  log('stopping');
}

process.on('SIGINT', requestStop);
process.on('SIGTERM', requestStop);

const commands = [
  {command: 'secret', description: 'Private text response', is_ephemeral: true},
  {command: 'media', description: 'Private media response', is_ephemeral: true},
  {command: 'sticker', description: 'Private sticker response', is_ephemeral: true},
  {command: 'video', description: 'Private video response', is_ephemeral: true},
  {command: 'animation', description: 'Private animation response', is_ephemeral: true},
  {command: 'document', description: 'Private document response', is_ephemeral: true},
  {command: 'audio', description: 'Private audio response', is_ephemeral: true},
  {command: 'voice', description: 'Private voice response', is_ephemeral: true},
  {command: 'videonote', description: 'Private video note response', is_ephemeral: true},
  {command: 'poll', description: 'Polls are unavailable (shows notice)', is_ephemeral: true},
  {command: 'location', description: 'Private location response', is_ephemeral: true},
  {command: 'link', description: 'Private link preview', is_ephemeral: true},
  {command: 'burst', description: 'Three private responses', is_ephemeral: true},
  {command: 'button', description: 'Private callback button', is_ephemeral: true},
  {command: 'edit', description: 'Private edited response', is_ephemeral: true},
  {command: 'delete', description: 'Private deleted response', is_ephemeral: true},
  {command: 'plain', description: 'Ordinary public response'}
];

if(allowedChatIds.size) {
  await call('deleteMyCommands', {
    scope: {type: 'all_group_chats'}
  });

  for(const chatId of allowedChatIds) {
    if(stopRequested) {
      break;
    }

    await call('setMyCommands', {
      scope: {
        type: 'chat',
        chat_id: chatId
      },
      commands
    });
  }
}

const allowedUpdates = ['message', 'callback_query'];
if(guardConfig) {
  allowedUpdates.push('chat_join_request');
}
if(businessConfig) {
  allowedUpdates.push(
    'business_connection',
    'business_message',
    'edited_business_message',
    'deleted_business_messages'
  );
}

let ready = false;
let failedUpdate = false;
let fatalError;
while(!stopRequested && !fatalError) {
  const pollController = new AbortController();
  activePollController = pollController;
  let updates;

  try {
    updates = await call('getUpdates', {
      offset,
      timeout: ready ? 25 : 0,
      allowed_updates: allowedUpdates
    }, {
      signal: pollController.signal
    });
  } catch(error) {
    activePollController = undefined;
    if(stopRequested && error?.name === 'AbortError') {
      break;
    }

    if(!isRetryablePollError(error)) {
      log('poll-fatal', getErrorDetails(error));
      fatalError = error;
      break;
    }

    log('poll-error', getErrorDetails(error));
    activePollController = pollController;
    await waitForRetry(getPollRetryDelay(error), pollController.signal);
    activePollController = undefined;
    continue;
  }

  activePollController = undefined;
  if(stopRequested) {
    break;
  }

  if(!ready) {
    ready = true;
    log('ready', {
      username: bot.username,
      allowedChatCount: allowedChatIds.size,
      guardMode: !!guardConfig,
      guardResult: guardConfig?.result,
      guardWebApp: !!guardConfig?.webAppUrl,
      allowedGuardChatCount: guardConfig?.allowedChatIds.size || 0,
      businessMode: !!businessConfig,
      allowedBusinessUserCount: businessConfig?.allowedUserIds.size || 0,
      allowedBusinessChatCount: businessConfig?.allowedChatIds.size || 0
    });
  }

  try {
    await processUpdateBatch(updates, {
      handleUpdate,
      isStopping: () => stopRequested,
      onOffset: (nextOffset) => {
        offset = nextOffset;
      }
    });
  } catch(error) {
    const updateError = error instanceof UpdateHandlingError ?
      error.cause :
      error;
    log('update-error', {
      updateId: error.updateId,
      ...getErrorDetails(updateError)
    });
    failedUpdate = true;
    fatalError = updateError;
  }
}

if(offset !== undefined && (stopRequested || failedUpdate)) {
  try {
    await call('getUpdates', {
      offset,
      limit: 1,
      timeout: 0,
      allowed_updates: allowedUpdates
    }, {
      signal: AbortSignal.timeout(5000)
    });
    log('processed-updates-acknowledged');
  } catch(error) {
    log('shutdown-ack-error', getErrorDetails(error));
  }
}

if(fatalError) {
  log('stopped', {reason: 'fatal-error'});
  throw fatalError;
}

log('stopped');
