import {describe, expect, it} from 'vitest';
import {
  getUpdateChatId,
  isUpdateAllowed,
  parseAllowedChatIds
} from './allowlist.mjs';

describe('parseAllowedChatIds', () => {
  it('requires at least one chat ID', () => {
    expect(() => parseAllowedChatIds()).toThrow(
      'TG_EPHEMERAL_BOT_CHAT_IDS is required'
    );
    expect(() => parseAllowedChatIds(' , ')).toThrow(
      'TG_EPHEMERAL_BOT_CHAT_IDS is required'
    );
  });

  it('normalizes and deduplicates chat IDs', () => {
    expect([...parseAllowedChatIds(' -1001,42,-1001 ')]).toEqual([
      '-1001',
      '42'
    ]);
  });

  it('rejects malformed chat IDs', () => {
    expect(() => parseAllowedChatIds('-1001,chat')).toThrow(
      'Invalid Telegram chat ID: chat'
    );
  });
});

describe('ephemeral bot update allowlist', () => {
  const allowedChatIds = new Set(['-1001']);

  it('reads chat IDs from messages and callback queries', () => {
    expect(getUpdateChatId({message: {chat: {id: -1001}}})).toBe(-1001);
    expect(getUpdateChatId({
      callback_query: {message: {chat: {id: -1002}}}
    })).toBe(-1002);
  });

  it('allows only updates from configured chats', () => {
    expect(isUpdateAllowed({
      message: {chat: {id: -1001}}
    }, allowedChatIds)).toBe(true);
    expect(isUpdateAllowed({
      message: {chat: {id: -1002}}
    }, allowedChatIds)).toBe(false);
    expect(isUpdateAllowed({
      callback_query: {inline_message_id: 'inline'}
    }, allowedChatIds)).toBe(false);
  });
});
