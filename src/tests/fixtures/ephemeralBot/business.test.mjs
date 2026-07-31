import {describe, expect, it, vi} from 'vitest';
import {
  buildBusinessReplyParams,
  getBusinessMessageRejectionReason,
  isBusinessChatAllowed,
  isBusinessConnectionAllowed,
  isBusinessMessageFromCurrentRun,
  parseBusinessConfig,
  processBusinessMessage
} from './business.mjs';
import {processUpdateBatch} from './polling.mjs';

const connection = {
  id: 'connection-1',
  user: {id: 1001},
  rights: {
    can_read_messages: true,
    can_reply: true
  },
  is_enabled: true
};
const config = {
  allowedUserIds: new Set(['1001']),
  allowedChatIds: new Set(['2002'])
};
const message = {
  business_connection_id: 'connection-1',
  message_id: 42,
  date: 200,
  from: {id: 2002},
  chat: {
    id: 2002,
    type: 'private'
  }
};

function makeBusinessHandlerOptions(overrides = {}) {
  return {
    message,
    connection,
    config,
    edited: false,
    command: 'business',
    handledMessageKeys: new Set(),
    readBusinessMessage: vi.fn().mockResolvedValue(true),
    sendBusinessMessage: vi.fn().mockResolvedValue({}),
    replyText: 'Business bot reply',
    ...overrides
  };
}

describe('parseBusinessConfig', () => {
  it('keeps Business Mode disabled when neither allowlist is configured', () => {
    expect(parseBusinessConfig({})).toBeUndefined();
    expect(parseBusinessConfig({userIds: ' ', chatIds: ' '})).toBeUndefined();
  });

  it('requires owner and customer chat allowlists together', () => {
    expect(() => parseBusinessConfig({userIds: '1001'})).toThrow(
      'TG_EPHEMERAL_BOT_BUSINESS_USER_IDS and ' +
      'TG_EPHEMERAL_BOT_BUSINESS_CHAT_IDS must be set together'
    );
    expect(() => parseBusinessConfig({chatIds: '2002'})).toThrow(
      'TG_EPHEMERAL_BOT_BUSINESS_USER_IDS and ' +
      'TG_EPHEMERAL_BOT_BUSINESS_CHAT_IDS must be set together'
    );
  });

  it('normalizes and deduplicates Telegram IDs as strings', () => {
    const result = parseBusinessConfig({
      userIds: ' 1001,1001,4500000000000000 ',
      chatIds: ' 2002,2003 '
    });

    expect([...result.allowedUserIds]).toEqual([
      '1001',
      '4500000000000000'
    ]);
    expect([...result.allowedChatIds]).toEqual(['2002', '2003']);
  });

  it('rejects malformed and non-user IDs', () => {
    expect(() => parseBusinessConfig({
      userIds: ',',
      chatIds: '2002'
    })).toThrow(
      'TG_EPHEMERAL_BOT_BUSINESS_USER_IDS must contain at least one ID'
    );
    expect(() => parseBusinessConfig({
      userIds: '-1001',
      chatIds: '2002'
    })).toThrow(
      'Invalid Telegram ID in TG_EPHEMERAL_BOT_BUSINESS_USER_IDS: -1001'
    );
    expect(() => parseBusinessConfig({
      userIds: '1001',
      chatIds: 'chat'
    })).toThrow(
      'Invalid Telegram ID in TG_EPHEMERAL_BOT_BUSINESS_CHAT_IDS: chat'
    );
  });
});

describe('Business Bot API fixture allowlists', () => {
  it('requires an enabled connection owned by an allowlisted user', () => {
    expect(isBusinessConnectionAllowed(
      connection,
      config.allowedUserIds
    )).toBe(true);
    expect(isBusinessConnectionAllowed(
      {...connection, is_enabled: false},
      config.allowedUserIds
    )).toBe(false);
    expect(isBusinessConnectionAllowed(
      {...connection, user: {id: 1002}},
      config.allowedUserIds
    )).toBe(false);
  });

  it('requires both the matching connection and an allowlisted chat', () => {
    expect(isBusinessChatAllowed(message, connection, config)).toBe(true);
    expect(isBusinessChatAllowed(
      {...message, chat: {id: 2003}},
      connection,
      config
    )).toBe(false);
    expect(isBusinessChatAllowed(
      {...message, business_connection_id: 'other'},
      connection,
      config
    )).toBe(false);
  });
});

describe('Business Bot API message handling', () => {
  it('accepts commands received only after the fixture started', () => {
    expect(isBusinessMessageFromCurrentRun(message, 200)).toBe(true);
    expect(isBusinessMessageFromCurrentRun(message, 201)).toBe(false);
    expect(isBusinessMessageFromCurrentRun(
      {...message, date: undefined},
      200
    )).toBe(false);
  });

  it('accepts an incoming private message from an allowlisted customer', () => {
    expect(getBusinessMessageRejectionReason(
      message,
      connection,
      config
    )).toBeUndefined();
  });

  it('rejects a disabled or mismatched business connection', () => {
    expect(getBusinessMessageRejectionReason(
      message,
      {...connection, is_enabled: false},
      config
    )).toBe('connection-not-allowed');
    expect(getBusinessMessageRejectionReason(
      {...message, business_connection_id: 'other'},
      connection,
      config
    )).toBe('connection-mismatch');
  });

  it.each([
    [
      'chat-not-allowed',
      {...message, chat: {id: 2003, type: 'private'}}
    ],
    [
      'chat-not-private',
      {...message, chat: {id: 2002, type: 'group'}}
    ],
    [
      'sender-missing',
      {...message, from: undefined}
    ],
    [
      'sent-by-business-bot',
      {...message, sender_business_bot: {id: 3003}}
    ],
    [
      'sent-by-business-owner',
      {...message, from: {id: 1001}}
    ],
    [
      'automatic-business-message',
      {...message, is_from_offline: true}
    ]
  ])('rejects unsafe messages: %s', (reason, candidate) => {
    expect(getBusinessMessageRejectionReason(
      candidate,
      connection,
      config
    )).toBe(reason);
  });

  it('builds a reply on behalf of the connected business account', () => {
    expect(buildBusinessReplyParams(message, 'Business bot reply')).toEqual({
      business_connection_id: 'connection-1',
      chat_id: 2002,
      reply_parameters: {
        message_id: 42
      },
      text: 'Business bot reply'
    });
  });

  it('does not read or send when the connection cannot reply', async() => {
    const options = makeBusinessHandlerOptions({
      connection: {
        ...connection,
        rights: {
          can_read_messages: true,
          can_reply: false
        }
      }
    });

    await expect(processBusinessMessage(options)).resolves.toEqual({
      type: 'ignored',
      reason: 'reply-right-missing'
    });
    expect(options.readBusinessMessage).not.toHaveBeenCalled();
    expect(options.sendBusinessMessage).not.toHaveBeenCalled();
  });

  it.each([true, false])(
    'reads only when can_read_messages is %s before replying',
    async(canReadMessages) => {
      const options = makeBusinessHandlerOptions({
        connection: {
          ...connection,
          rights: {
            can_read_messages: canReadMessages,
            can_reply: true
          }
        }
      });

      await expect(processBusinessMessage(options)).resolves.toEqual({
        type: 'replied',
        markedAsRead: canReadMessages
      });
      expect(options.readBusinessMessage).toHaveBeenCalledTimes(
        canReadMessages ? 1 : 0
      );
      expect(options.sendBusinessMessage).toHaveBeenCalledOnce();
    }
  );

  it('sends a successful duplicate update only once', async() => {
    const options = makeBusinessHandlerOptions();

    await expect(processBusinessMessage(options)).resolves.toEqual({
      type: 'replied',
      markedAsRead: true
    });
    await expect(processBusinessMessage(options)).resolves.toEqual({
      type: 'ignored',
      reason: 'duplicate-update'
    });

    expect(options.readBusinessMessage).toHaveBeenCalledOnce();
    expect(options.sendBusinessMessage).toHaveBeenCalledOnce();
  });

  it('does not mark or commit an update when sending fails', async() => {
    const sendError = new Error('send failed');
    const options = makeBusinessHandlerOptions({
      connection: {
        ...connection,
        rights: {can_reply: true}
      },
      sendBusinessMessage: vi.fn().mockRejectedValue(sendError)
    });
    const offsets = [];

    await expect(processUpdateBatch([{
      update_id: 100,
      business_message: message
    }], {
      handleUpdate: () => processBusinessMessage(options),
      isStopping: () => false,
      onOffset: (offset) => offsets.push(offset)
    })).rejects.toMatchObject({
      name: 'UpdateHandlingError',
      updateId: 100,
      cause: sendError
    });

    expect(options.handledMessageKeys).toEqual(new Set());
    expect(offsets).toEqual([]);
  });
});
