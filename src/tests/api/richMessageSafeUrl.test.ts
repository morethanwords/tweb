import {createDualClients, loadSeed} from './dualHarness';
import wrapTelegramRichText from '@lib/richTextProcessor/wrapTelegramRichText';
import wrapUrl from '@lib/richTextProcessor/wrapUrl';
import pause from '@helpers/schedulers/pause';
import {randomLong} from '@helpers/random';
import type {PageBlock, RichText} from '@layer';

// Does the server let a client author a `textUrl` whose url is a javascript: scheme AND whose
// webpage_id is non-zero? `webpage_id != 0` is the only thing that makes wrapTelegramRichText
// stamp `safe: true`, which in turn is the only thing that lets wrapUrl's `iv` branch put a
// decoded URL straight into an anchor href. `safe` itself is client-local (not in the TL schema),
// so this is the only wire-reachable way into that branch.
//
// TG_API_E2E=1 TG_API_PROD_DC=1 TG_API_SEED=./tmp/preview-sessions/account-a.json \
//   TG_API_SEED_B=./tmp/preview-sessions/account-b.json \
//   pnpm test src/tests/api/richMessageSafeUrl.test.ts -- --reporter=verbose --silent=false

const ENABLED = process.env.TG_API_E2E === '1';
const seedAPath = process.env.TG_API_SEED || './tmp/seed.json';
const seedBPath = process.env.TG_API_SEED_B || './tmp/seed-b.json';
const describeOrSkip = ENABLED ? describe : describe.skip;

const PAYLOAD_URL = 'javascript:alert(document.domain)';
const LINK_TEXT = 'probe';

function makeProbeBlocks(url: string, webpageId: string | number): PageBlock[] {
  const textUrl: RichText.textUrl = {
    _: 'textUrl',
    text: {_: 'textPlain', text: LINK_TEXT},
    url,
    webpage_id: webpageId
  };

  return [{_: 'pageBlockParagraph', text: textUrl}];
}

// What the renderer would do with whatever the server hands back.
function renderVerdict(block: PageBlock) {
  const text = (block as PageBlock.pageBlockParagraph).text;
  const {entities} = wrapTelegramRichText(text);
  const entity: any = entities?.find((e) => e._ === 'messageEntityTextUrl');
  if(!entity) {
    return {safe: undefined as boolean, href: undefined as string, onclick: undefined as string};
  }

  const wrapped = wrapUrl(entity.url, entity.safe);
  return {safe: !!entity.safe, href: wrapped.url, onclick: wrapped.onclick};
}

describe('wrapUrl iv branch re-validates the decoded URL', () => {
  test('a safe textUrl carrying javascript: never reaches href', () => {
    const [block] = makeProbeBlocks(PAYLOAD_URL, '1');
    const verdict = renderVerdict(block);

    // webpage_id != 0 still means safe — that part is unchanged
    expect(verdict.safe).toBe(true);
    expect(verdict.href.startsWith('javascript:')).toBe(false);
  });

  test('a legitimate IV link is untouched', () => {
    const [block] = makeProbeBlocks('https://telegram.org/blog', '1');
    const verdict = renderVerdict(block);

    expect(verdict.safe).toBe(true);
    expect(verdict.href).toBe('https://telegram.org/blog');
  });

  test('webpage_id 0 keeps the link out of the iv branch entirely', () => {
    // fetchLong returns a *number* for values inside the safe-integer range, so a zero
    // webpage_id off the wire is 0, not '0'
    const [block] = makeProbeBlocks(PAYLOAD_URL, 0);
    const verdict = renderVerdict(block);

    expect(verdict.safe).toBe(false);
    expect(verdict.href.startsWith('javascript:')).toBe(false);
  });

  test('a stringified "0" webpage_id is not mistaken for a real webpage', () => {
    // a bare `!!webpage_id` would read '0' as truthy; fetchLong only keeps longs numeric while
    // they fit in the safe-integer range, so don't lean on that
    const [block] = makeProbeBlocks(PAYLOAD_URL, '0');
    const verdict = renderVerdict(block);

    expect(verdict.safe).toBe(false);
    expect(verdict.href.startsWith('javascript:')).toBe(false);
  });
});

describeOrSkip('rich_message textUrl cannot smuggle a javascript: href via webpage_id', () => {
  test('server round-trip of a client-authored textUrl{javascript:, webpage_id != 0}', async() => {
    const dual = await createDualClients({
      seedA: loadSeed(seedAPath),
      seedB: loadSeed(seedBPath),
      testDc: process.env.TG_API_PROD_DC !== '1'
    });

    // Never let a stray code path drop these sessions (seeds are shared with the preview).
    for(const client of [dual.A, dual.B]) {
      (client.apiManager as any).logOut = () => Promise.resolve();
    }

    let sentId: number | undefined;
    let bInputUser: any;

    try {
      await Promise.all([
        dual.A.apiManager.invokeApi('users.getUsers', {id: [{_: 'inputUserSelf'}]}),
        dual.B.apiManager.invokeApi('users.getUsers', {id: [{_: 'inputUserSelf'}]})
      ]);

      const bMe: any = (await dual.B.apiManager.invokeApi('users.getUsers', {id: [{_: 'inputUserSelf'}]}))[0];
      if(!bMe?.username) throw new Error('B has no username; needed to resolve from A');

      const resolved: any = await dual.A.apiManager.invokeApi('contacts.resolveUsername' as any, {
        username: bMe.username
      } as any);
      const bUser = resolved.users.find((u: any) => u.id === bMe.id);
      bInputUser = {_: 'inputPeerUser', user_id: bUser.id, access_hash: bUser.access_hash};

      console.log('[step 1] A -> B', bMe.id, '@' + bMe.username);

      const send = async(label: string, peer: any, url: string, webpageId: string) => {
        const blocks = makeProbeBlocks(url, webpageId);
        console.log(`[send:${label}]`, JSON.stringify(blocks[0]));
        try {
          const result: any = await dual.A.apiManager.invokeApi('messages.sendMessage', {
            peer,
            message: LINK_TEXT,
            random_id: randomLong(),
            rich_message: {_: 'inputRichMessage', pFlags: {}, blocks}
          } as any);
          console.log(`[send:${label}] ACCEPTED`, result?._);
          return {result};
        } catch(err: any) {
          console.log(`[send:${label}] REJECTED`, err?.type || err?.message || err);
          return {error: err};
        }
      };

      // Control first: if a perfectly benign rich_message is refused too, the rejection is about
      // the feature not being enabled for this account/peer, not about the payload.
      const controlToB = await send('control-https-to-B', bInputUser, 'https://example.com', '0');
      const controlToSelf = await send('control-https-to-self', {_: 'inputPeerSelf'}, 'https://example.com', '0');

      const controlPeer = !controlToB.error ? bInputUser : (!controlToSelf.error ? {_: 'inputPeerSelf'} : undefined);
      if(!controlPeer) {
        console.log('[verdict] INCONCLUSIVE — the server refuses even a benign rich_message from');
        console.log('[verdict] this account, so the payload was never scheme-checked. Error is');
        console.log('[verdict] about feature availability, not about the javascript: url.');
        expect(controlToB.error).toBeTruthy();
        return;
      }

      // A is a hostile client: it hand-builds the blocks instead of going through tweb's
      // markdown path (which hardcodes webpage_id: 0).
      const {result: sendResult, error: sendError} = await send('payload-js-webpageid1', controlPeer, PAYLOAD_URL, '1');

      if(sendError) {
        console.log('[verdict] the server accepts benign rich_message but REJECTS the javascript:');
        console.log('[verdict] payload — server-side validation covers this. Branch unreachable.');
        expect(sendError).toBeTruthy();
        return;
      }

      console.log('[step 3] server ACCEPTED the send:', sendResult?._);

      const updates: any[] = sendResult?.updates || (sendResult?._ ? [sendResult] : []);
      const sentMessage = updates
      .map((u: any) => u.message)
      .find((m: any) => m && m._ === 'message');
      sentId = sentMessage?.id;
      console.log('[step 3] sent id', sentId, 'echoed rich_message:', !!sentMessage?.rich_message);

      await pause(2000);

      // What does B actually receive?
      const history: any = await dual.B.apiManager.invokeApi('messages.getHistory', {
        peer: {_: 'inputPeerUser', user_id: (await dual.A.apiManager.invokeApi('users.getUsers', {id: [{_: 'inputUserSelf'}]}) as any)[0].id, access_hash: '0'},
        offset_id: 0,
        offset_date: 0,
        add_offset: 0,
        limit: 5,
        max_id: 0,
        min_id: 0,
        hash: '0'
      } as any).catch((err: any): any => {
        console.warn('[step 4] getHistory from B failed:', err?.type || err?.message);
        return undefined;
      });

      const received = history?.messages?.find((m: any) => m._ === 'message' && m.message === LINK_TEXT);
      const richMessage = received?.rich_message;
      console.log('[step 4] B received message', received?.id, 'rich_message:', !!richMessage);

      if(!richMessage?.blocks?.length) {
        console.log('[verdict] the server stripped rich_message on delivery — branch unreachable');
        expect(richMessage?.blocks?.length || 0).toBe(0);
        return;
      }

      const block = richMessage.blocks[0];
      console.log('[step 5] delivered block:', JSON.stringify(block));

      const roundTripped = (block as any)?.text;
      console.log('[step 5] url       :', roundTripped?.url);
      console.log('[step 5] webpage_id:', roundTripped?.webpage_id, typeof roundTripped?.webpage_id);

      const verdict = renderVerdict(block);
      console.log('[step 6] renderer  :', JSON.stringify(verdict));

      // The fix: even if everything above lines up, the decoded URL never reaches href as javascript:.
      expect(verdict.href?.startsWith('javascript:')).toBe(false);

      if(verdict.safe) {
        console.log('[verdict] server DID preserve webpage_id != 0 on a javascript: url —');
        console.log('[verdict] the iv branch was reachable; the wrapUrl fix is what stops it.');
      } else {
        console.log('[verdict] safe=false — the server normalised webpage_id, branch unreachable.');
      }
    } finally {
      if(sentId && bInputUser) {
        await dual.A.apiManager.invokeApi('messages.deleteMessages', {
          id: [sentId],
          revoke: true
        } as any).then(
          () => console.log('[cleanup] deleted probe message', sentId),
          (err: any) => console.warn('[cleanup] delete failed:', err?.type || err?.message)
        );
      }

      dual.dispose();
    }
  }, 120000);
});
