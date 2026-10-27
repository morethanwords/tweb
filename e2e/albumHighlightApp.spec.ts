import {expect, Page, test} from '@playwright/test';

/*
 * A jump to one photo or video of an album (a reply, a search result, a link with `?single`) lights
 * up that item, not the whole album; a message link without `?single` names the album as a whole
 * and lights all of it up (tdlib's `for_album`, the server's `channels.exportMessageLink` without
 * `grouped` adds `?single` to the link of an album's item).
 *
 * It needs a signed-in account with an album in its recent chats, so like the other signed-in specs
 * it runs against an authorized preview and skips rather than reporting a pass it never made:
 *
 *   bash scripts/start-preview.sh --detach    # prints the URL, say http://localhost:9001
 *   PLAYWRIGHT_BASE_URL=http://localhost:9001 npx playwright test e2e/albumHighlightApp.spec.ts
 */

// * how far down the chat list to look for an album
const DIALOGS_LIMIT = 30;

type Album = {peerId: number, mids: number[], channelId?: string};

test.describe('the highlight of a jump into an album', () => {
  test.skip(!process.env.PLAYWRIGHT_BASE_URL, 'needs an authorized preview (PLAYWRIGHT_BASE_URL)');

  test.use({viewport: {width: 1280, height: 800}});

  // * looked up once: `null` when the account has no album to jump into
  let found: Album | null;

  test.beforeEach(async({page}) => {
    test.setTimeout(4 * 60_000);
    await page.goto('/?noSharedWorker=1');
    await page.waitForFunction(() => document.querySelectorAll('.chatlist-chat').length > 0, null, {timeout: 180_000});
    if(found === undefined) found = await findAlbum(page) ?? null;
    test.skip(!found, 'no album of photos or videos in the recent chats of this account');
  });

  test('a jump to an item of an album lights up that item only', async({page}) => {
    // * not the item that carries the album's caption and stands for the bubble: the last one
    const mid = found.mids[found.mids.length - 1];
    const lit = await jump(page, async({peerId, mid}) => {
      await (window as any).appImManager.setInnerPeer({peerId, lastMsgId: mid});
    }, {peerId: found.peerId, mid});
    expect(lit).toEqual([`album-item:${mid}`]);

    // * and it is seen: the item is tinted while the rest of the album is not
    const tinted = await page.evaluate((mid) => {
      const item = document.querySelector(`#column-center .album-item[data-mid="${mid}"]`);
      return getComputedStyle(item, '::after').backgroundColor;
    }, mid);
    expect(tinted).not.toBe('rgba(0, 0, 0, 0)');
  });

  test('a jump to the album as a whole lights up the bubble', async({page}) => {
    const mid = found.mids[found.mids.length - 1];
    const lit = await jump(page, async({peerId, mid}) => {
      await (window as any).appImManager.setInnerPeer({peerId, lastMsgId: mid, wholeAlbum: true});
    }, {peerId: found.peerId, mid});
    expect(lit).toEqual([`bubble:${found.mids.join(',')}`]);
  });

  test('a message link lights up the album, and with `?single` only its item', async({page}) => {
    test.skip(!found.channelId, 'the album is not in a channel or a supergroup, so it has no message link');

    const mid = found.mids[found.mids.length - 1];
    const postId = mid % 4294967296;
    const open = async(url: string) => jump(page, async({url}) => {
      (window as any).appImManager.openUrl(url);
    }, {url, peerId: found.peerId, mid});

    expect(await open(`https://t.me/c/${found.channelId}/${postId}?single`)).toEqual([`album-item:${mid}`]);
    expect(await open(`https://t.me/c/${found.channelId}/${postId}`)).toEqual([`bubble:${found.mids.join(',')}`]);
    expect(await open(`tg://privatepost?channel=${found.channelId}&post=${postId}&single`)).toEqual([`album-item:${mid}`]);
  });
});

// * an album of two or more photos or videos in the chat list — in a channel or a supergroup, whose
// * messages have links, when there is one
async function findAlbum(page: Page): Promise<Album> {
  return page.evaluate(async({limit}) => {
    const managers = (window as any).appImManager.managers;
    const {dialogs} = await managers.dialogsStorage.getDialogs({filterId: 0, limit});
    let fallback: Album;
    for(const {peerId} of dialogs) {
      const isChannel = peerId < 0 && await managers.appPeersManager.isChannel(peerId);
      if(fallback && !isChannel) {
        continue;
      }

      const result = await managers.appMessagesManager.getHistory({
        peerId,
        inputFilter: {_: 'inputMessagesFilterPhotoVideo'},
        limit: 20
      }).catch((): undefined => undefined);
      for(const mid of result?.history || []) {
        const message = await managers.appMessagesManager.getMessageByPeer(peerId, mid);
        if(!message?.grouped_id) {
          continue;
        }

        const mids: number[] = (await managers.appMessagesManager.getMidsByGroupedId(message.grouped_id)).slice().sort((a: number, b: number) => a - b);
        const messages = await Promise.all(mids.map((mid) => managers.appMessagesManager.getMessageByPeer(peerId, mid)));
        if(mids.length < 2 || messages.some((message) => !['messageMediaPhoto', 'messageMediaDocument'].includes(message?.media?._))) {
          continue;
        }

        if(isChannel) {
          return {peerId, mids, channelId: '' + -peerId};
        }

        fallback = {peerId, mids};
        break;
      }
    }

    return fallback;
  }, {limit: DIALOGS_LIMIT});
}

type JumpArgs = {peerId: number, mid: number, url?: string};

/**
 * Runs `go` and returns what lit up after it: `album-item:<mid>`, or `bubble:<mids of the album>`,
 * or a `document-container:<mid>` — whatever got `is-highlighted` in the chat
 */
async function jump(page: Page, go: (args: JumpArgs) => Promise<void>, args: JumpArgs) {
  await page.evaluate(async({limit}) => {
    // * a fresh page knows only the chats its list has drawn: load as many as the search went through
    await (window as any).appImManager.managers.dialogsStorage.getDialogs({filterId: 0, limit});
    const w = window as any;
    w.__lit?.disconnect();
    const lit: HTMLElement[] = w.__litElements = [];
    w.__lit = new MutationObserver((records) => {
      for(const {target} of records) {
        const element = target as HTMLElement;
        if(element.classList.contains('is-highlighted') && !lit.includes(element)) {
          lit.push(element);
        }
      }
    });
    w.__lit.observe(document.getElementById('column-center'), {subtree: true, attributes: true, attributeFilter: ['class']});
  }, {limit: DIALOGS_LIMIT});

  await page.evaluate<void, JumpArgs>(go, args);
  await page.waitForFunction(() => (window as any).__litElements.length > 0, null, {timeout: 30_000});
  // * whatever else lights up with it does so in the same frame
  await page.waitForTimeout(300);
  return page.evaluate(() => {
    const w = window as any;
    w.__lit.disconnect();
    return (w.__litElements as HTMLElement[]).map((element) => {
      if(element.classList.contains('bubble')) {
        const mids = Array.from(element.querySelectorAll<HTMLElement>('.grouped-item')).map((item) => +item.dataset.mid);
        return `bubble:${mids.sort((a, b) => a - b).join(',')}`;
      }

      return `${element.classList[0]}:${element.dataset.mid}`;
    });
  });
}
