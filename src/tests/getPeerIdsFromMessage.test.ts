import {describe, expect, test} from 'vitest';
import '@helpers/peerIdPolyfill';
import getPeerIdsFromMessage from '@appManagers/utils/messages/getPeerIdsFromMessage';

describe('the peers a message is kept with', () => {
  test('keeps the business bot that wrote it for its owner', () => {
    // * a chat list restored from the cache names the bot (`renderDialogSubtitleParts`) without loading it again
    const botId = 300 as UserId;
    const peerIds = getPeerIdsFromMessage({
      _: 'message',
      pFlags: {out: true},
      id: 1,
      peer_id: {_: 'peerUser', user_id: 2},
      fromId: (1 as UserId).toPeerId(false),
      via_business_bot_id: botId,
      date: 1,
      message: 'body'
    } as any);

    expect(peerIds).toContain(botId.toPeerId(false));
  });
});
