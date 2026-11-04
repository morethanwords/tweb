import {describe, expect, it} from 'vitest';
import '@helpers/peerIdPolyfill';
import {AppMessagesManager} from '@appManagers/appMessagesManager';
import type {InputReplyTo, RichText} from '@layer';

// * what a reply with a quote asks the server for: a rich quote goes by itself (Telegram for iOS' ReplyQuoteApiTests,
// * Android's createReplyInput, tdesktop's data_histories) — with a text beside it the server rejects it
const PEER_ID = (777 as ChatId).toPeerId(true);

function makeManager() {
  const manager = new AppMessagesManager();
  Object.assign(manager as any, {
    appPeersManager: {
      canManageDirectMessages: () => false,
      getInputPeerById: () => ({_: 'inputPeerChannel', channel_id: 777, access_hash: '1'})
    },
    getMessageByPeer: (): undefined => undefined,
    isEphemeralMessage: () => false,
    isEphemeralMessageId: () => false
  });
  return manager;
}

describe('a reply\'s quote asked for', () => {
  it('sends a rich quote as its fragments and where it starts, and no text', () => {
    const rich: RichText[] = [{_: 'textPlain', text: 'part'}];
    const replyTo = makeManager().getInputReplyTo({
      peerId: PEER_ID,
      replyToMsgId: 10,
      replyToQuote: {text: 'part', entities: [], offset: 5, rich}
    }) as InputReplyTo.inputReplyToMessage;
    expect(replyTo.quote_rich).toBe(rich);
    expect(replyTo.quote_offset).toBe(5);
    expect('quote_text' in replyTo).toBe(false);
    expect('quote_entities' in replyTo).toBe(false);
  });

  it('sends a quote of a text as its text', () => {
    const replyTo = makeManager().getInputReplyTo({
      peerId: PEER_ID,
      replyToMsgId: 10,
      replyToQuote: {text: 'part', offset: 5}
    }) as InputReplyTo.inputReplyToMessage;
    expect(replyTo.quote_text).toBe('part');
    expect(replyTo.quote_offset).toBe(5);
    expect('quote_rich' in replyTo).toBe(false);
  });
});
