import {describe, expect, it} from 'vitest';
import '@helpers/peerIdPolyfill';
import {AppMessagesManager} from '@appManagers/appMessagesManager';
import type {InputReplyTo, RichText} from '@layer';
import {draftMessage} from '@/tests/helpers/drafts';
import {makeDraftSyncManager} from '@/tests/helpers/draftSync';

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

// * the server's copy of a draft keeps its reply's quote, as tdesktop's and iOS' drafts do: another device, or this one
// * after a reload, opens the reply with it
describe('a draft\'s reply\'s quote', () => {
  async function saveDraft(replyTo: InputReplyTo.inputReplyToMessage) {
    const {manager, invokeApi} = makeDraftSyncManager({
      appMessagesManager: {
        getMessageByPeer: (): undefined => undefined,
        isEphemeralMessage: () => false
      }
    });

    await manager.syncDraft({peerId: PEER_ID, localDraft: draftMessage({message: 'answer', reply_to: replyTo})});
    const [method, params] = invokeApi.mock.calls[0];
    expect(method).toBe('messages.saveDraft');
    return params.reply_to as InputReplyTo.inputReplyToMessage;
  }

  it('saves a rich quote as its fragments and where it starts', async() => {
    const rich: RichText[] = [{_: 'textPlain', text: 'part'}];
    const replyTo = await saveDraft({_: 'inputReplyToMessage', reply_to_msg_id: 10, quote_rich: rich, quote_offset: 5});
    expect(replyTo.quote_rich).toBe(rich);
    expect(replyTo.quote_offset).toBe(5);
    expect(replyTo.quote_text).toBeUndefined();
  });

  it('saves a quote of a text as its text and formatting', async() => {
    const entities = [{_: 'messageEntityBold', offset: 0, length: 4}] as const;
    const replyTo = await saveDraft({
      _: 'inputReplyToMessage',
      reply_to_msg_id: 10,
      quote_text: 'part',
      quote_entities: [...entities],
      quote_offset: 0
    });
    expect(replyTo.reply_to_msg_id).toBe(10);
    expect(replyTo.quote_text).toBe('part');
    expect(replyTo.quote_entities).toEqual(entities);
    expect(replyTo.quote_offset).toBe(0);
    expect(replyTo.quote_rich).toBeUndefined();
  });
});
