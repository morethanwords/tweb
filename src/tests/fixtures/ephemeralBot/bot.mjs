import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {
  isUpdateAllowed,
  parseAllowedChatIds
} from './allowlist.mjs';

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
const allowedChatIds = parseAllowedChatIds(
  process.env.TG_EPHEMERAL_BOT_CHAT_IDS
);
const apiUrl = `https://api.telegram.org/bot${token}/`;
let stopped = false;
let offset;

function log(event, details = {}) {
  console.log(JSON.stringify({event, ...details}));
}

async function call(method, params = {}) {
  const response = await fetch(apiUrl + method, {
    method: 'POST',
    headers: {'content-type': 'application/json'},
    body: JSON.stringify(params)
  });
  const result = await response.json();
  if(!response.ok || !result.ok) {
    throw new Error(`${method}: ${result.description || response.status}`);
  }

  return result.result;
}

const bot = await call('getMe');
if(expectedUsername && bot.username !== expectedUsername) {
  throw new Error(
    `Expected @${expectedUsername}, received credentials for @${bot.username}`
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

async function handleUpdate(update) {
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

process.on('SIGINT', () => {
  stopped = true;
  log('stopping');
});
process.on('SIGTERM', () => {
  stopped = true;
  log('stopping');
});

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

await call('deleteMyCommands', {
  scope: {type: 'all_group_chats'}
});

for(const chatId of allowedChatIds) {
  await call('setMyCommands', {
    scope: {
      type: 'chat',
      chat_id: chatId
    },
    commands
  });
}

log('ready', {
  username: bot.username,
  allowedChatCount: allowedChatIds.size
});

while(!stopped) {
  try {
    const updates = await call('getUpdates', {
      offset,
      timeout: 25,
      allowed_updates: ['message', 'callback_query']
    });
    for(const update of updates) {
      offset = update.update_id + 1;
      try {
        await handleUpdate(update);
      } catch(error) {
        log('update-error', {
          updateId: update.update_id,
          message: error.message
        });
      }
    }
  } catch(error) {
    log('poll-error', {message: error.message});
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
}

log('stopped');
