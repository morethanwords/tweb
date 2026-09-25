import {mkdirSync, writeFileSync} from 'fs';
import {createDualClients, loadSeed} from '@/tests/api/dualHarness';
import type {TrueDcSeed} from '@/tests/api/harness';
import type {DraftMessage, PageBlock, RichMessage} from '@layer';
import {richMessageToTiptap, tiptapToRichMessage} from '@components/chat/inputEditor/richMessage';

const enabled = process.env.TG_RICH_MESSAGE_LIVE === '1';
const suite = enabled ? describe : describe.skip;

function disposeClients(dual: Awaited<ReturnType<typeof createDualClients>>) {
  for(const client of [dual.A, dual.B]) client.managers.networkerFactory.stopAll();
  dual.dispose();
}

suite('rich message lifecycle on the real server', () => {
  test('independent authorizations reach the same account and expose posting eligibility', async() => {
    const seedA = loadSeed(process.env.TG_API_SEED);
    const seedB = loadSeed(process.env.TG_API_SEED_B);
    expect(seedA.userId === seedB.userId).toBe(true);
    expect(seedA.authKeys[seedA.dcId as TrueDcSeed].key !== seedB.authKeys[seedB.dcId as TrueDcSeed].key).toBe(true);
    const dual = await createDualClients({seedA, seedB, testDc: process.env.TG_API_PROD_DC !== '1'});
    try {
      const [a, b, config] = await Promise.all([
        dual.A.apiManager.invokeApi('users.getUsers', {id: [{_: 'inputUserSelf'}]}),
        dual.B.apiManager.invokeApi('users.getUsers', {id: [{_: 'inputUserSelf'}]}),
        dual.A.apiManager.getAppConfig()
      ]);
      expect(a[0]._ === 'user' && a[0].id === seedA.userId).toBe(true);
      expect(b[0]._ === 'user' && b[0].id === seedA.userId).toBe(true);
      const report = {userId: seedA.userId, independentSessions: true,
        premium: a[0]._ === 'user' && !!a[0].pFlags.premium,
        posting: config.rich_message_posting};
      mkdirSync('tmp/rich-message-live', {recursive: true});
      writeFileSync('tmp/rich-message-live/probe.json', JSON.stringify(report, null, 2));
      console.log('[rich-live]', JSON.stringify(report));
    } finally {
      disposeClients(dual);
    }
  }, 90_000);

  test('rich draft survives a server read through an independent session', async() => {
    const seedA = loadSeed(process.env.TG_API_SEED);
    const seedB = loadSeed(process.env.TG_API_SEED_B);
    expect(seedA.userId === seedB.userId).toBe(true);
    const dual = await createDualClients({seedA, seedB, testDc: process.env.TG_API_PROD_DC !== '1'});
    let channelId: ChatId;
    try {
      for(const client of [dual.A, dual.B]) {
        const users = await client.apiManager.invokeApi('users.getUsers', {id: [{_: 'inputUserSelf'}]});
        client.managers.appUsersManager.saveApiUsers(users);
      }
      channelId = await dual.A.managers.appChatsManager.createChannel({
        title: `RT draft probe ${Date.now()}`, about: 'Temporary synthetic draft test', broadcast: true
      });
      const peerId = channelId.toPeerId(true);
      const channel = dual.A.managers.appChatsManager.getChat(channelId);
      dual.B.managers.appChatsManager.saveApiChats([channel]);
      const blocks: PageBlock[] = [
        {_: 'pageBlockHeading2', text: {_: 'textPlain', text: 'RT-LIVE-DRAFT'}},
        {_: 'pageBlockParagraph', text: {_: 'textBold', text: {_: 'textPlain', text: 'Cloud draft'}}},
        {_: 'pageBlockOrderedList', pFlags: {}, start: 4414, items: [{_: 'pageListOrderedItemText', pFlags: {}, text: {_: 'textPlain', text: 'Item'}}]}
      ];
      const rich: RichMessage.richMessage = {_: 'richMessage', pFlags: {}, blocks, photos: [], documents: []};
      const draft: DraftMessage.draftMessage = {_: 'draftMessage', pFlags: {no_webpage: true}, date: 0, message: '', rich_message: rich};
      await dual.A.managers.appDraftsManager.syncDraft({peerId, localDraft: draft,
        inputRichMessage: {_: 'inputRichMessage', pFlags: {}, blocks}});
      const response = await dual.B.apiManager.invokeApi('messages.getPeerDialogs', {
        peers: [{_: 'inputDialogPeer', peer: dual.B.managers.appPeersManager.getInputPeerById(peerId)}]
      });
      const fetched = response.dialogs[0]._ === 'dialog' ? response.dialogs[0].draft : undefined;
      const actual = fetched?._ === 'draftMessage' ? fetched.rich_message : undefined;
      console.log('[rich-live-draft-probe]', JSON.stringify({userId: seedA.userId, channelId, draftType: fetched?._, rich: !!actual, blocks: actual?.blocks.length}));
      expect(!!actual).toBe(true);
      expect(tiptapToRichMessage(richMessageToTiptap(actual), {draft: true}).input.blocks).toMatchObject(blocks);
    } finally {
      if(channelId) await dual.A.managers.appChatsManager.deleteChannel(channelId);
      disposeClients(dual);
    }
  }, 90_000);
});
