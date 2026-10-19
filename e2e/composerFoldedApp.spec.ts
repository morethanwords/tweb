import {expect, Page, test} from '@playwright/test';

/*
 * Without Premium a rich message would not go out as it is, and the folded composer is a plain one: a typed
 * `1. ` stays text. A folded field that holds a rich message (a draft) keeps it, and turns plain again once
 * that is gone — the next chat's field too, which used to stay rich after a chat with a rich draft.
 *
 * It needs a signed-in account WITHOUT Premium where rich messages need it, so like the other signed-in
 * specs it runs against an authorized preview and skips rather than reporting a pass it never made:
 *
 *   bash scripts/start-preview.sh --detach    # prints the URL, say http://localhost:9001
 *   PLAYWRIGHT_BASE_URL=http://localhost:9001 npx playwright test e2e/composerFoldedApp.spec.ts
 */

const RICH_DRAFT = {
  _: 'richMessage', pFlags: {}, photos: [] as any[], documents: [] as any[],
  blocks: [
    {_: 'pageBlockParagraph', text: {_: 'textPlain', text: 'A draft'}},
    {_: 'pageBlockList', items: [
      {_: 'pageListItemText', pFlags: {}, text: {_: 'textPlain', text: 'one'}},
      {_: 'pageListItemText', pFlags: {}, text: {_: 'textPlain', text: 'two'}}
    ]}
  ]
};

test.describe('the folded composer without Premium', () => {
  test.skip(!process.env.PLAYWRIGHT_BASE_URL, 'needs an authorized preview (PLAYWRIGHT_BASE_URL)');

  test.use({viewport: {width: 1280, height: 800}});

  test.beforeEach(async({page}) => {
    test.setTimeout(4 * 60_000);
    await page.goto('/?noSharedWorker=1');
    await page.waitForFunction(() => document.querySelectorAll('.chatlist-chat').length > 0, null, {timeout: 180_000});
    const needsPremium = await page.evaluate(async() => {
      const state = await (window as any).appImManager.managers.appMessagesManager.getRichMessagePostingState();
      return state.mode === 'premium' && !state.allowed;
    });
    test.skip(!needsPremium, 'this account may send rich messages as they are');
  });

  test('types `1. ` as text, and is plain in the next chat after one with a rich draft', async({page}) => {
    // * two chats with a person (or Saved Messages) and no draft: the drafts this test leaves, it takes
    // * back, and a chat holding one of the account's own is not touched
    const [first, second] = await page.evaluate(async() => {
      const {managers} = (window as any).appImManager;
      const path = '/src/lib/rootScope.ts';
      const myId = (await import(/* @vite-ignore */ path)).default.myId;
      const {dialogs} = await managers.dialogsStorage.getDialogs({filterId: 0, limit: 30});
      const peerIds: number[] = [];
      for(const peerId of [myId, ...dialogs.map((dialog: {peerId: number}) => dialog.peerId)]) {
        if(
          peerIds.length < 2 &&
          !peerIds.includes(peerId) &&
          peerId > 0 &&
          peerId !== 777000 &&
          !await managers.appUsersManager.isBot(peerId) &&
          (await managers.appDraftsManager.getDraft(peerId) ?? {_: 'draftMessageEmpty'})._ === 'draftMessageEmpty'
        ) {
          peerIds.push(peerId);
        }
      }

      return peerIds;
    });
    test.skip(!second, 'no two chats with a person and no draft in the recent chats of this account');

    await open(page, first);
    await type(page, '1. one');
    expect(await field(page)).toEqual({text: '1. one', lists: 0});
    await clear(page);

    // * a rich draft is shown as one
    await page.evaluate((richMessage) => {
      (window as any).appImManager.chat.input.setInputValue('', true, false, undefined, richMessage);
    }, RICH_DRAFT);
    await expect.poll(() => field(page)).toEqual({text: 'A draftonetwo', lists: 1});

    await open(page, second);
    await type(page, '1. two');
    expect(await field(page)).toEqual({text: '1. two', lists: 0});

    // * the drafts this left go
    await clear(page);
    await open(page, first);
    await clear(page);
  });
});

// * as a click in the chat list opens it: in the chat already open, whose field goes on to the next chat
async function open(page: Page, peerId: number) {
  await page.evaluate((peerId) => (window as any).appImManager.setPeer({peerId}), peerId);
  await page.waitForFunction((peerId) => {
    const chat = (window as any).appImManager.chat;
    return chat.peerId === peerId && !chat.setPeerPromise;
  }, peerId, {timeout: 30_000});
  // * the field has settled on the schema it is to have, and on the chat's draft
  await page.evaluate(() => (window as any).appImManager.chat.input.richMessageInput?.richReady);
  await page.waitForTimeout(500);
}

async function type(page: Page, text: string) {
  await page.evaluate(() => (window as any).appImManager.chat.input.messageInput.focus());
  await page.keyboard.type(text, {delay: 30});
}

async function clear(page: Page) {
  await page.evaluate(() => (window as any).appImManager.chat.input.messageInput.focus());
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.press('Backspace');
  await expect.poll(() => field(page)).toEqual({text: '', lists: 0});
  // * the draft is saved a moment after the field changes: gone, not left for the next run to find
  await expect.poll(() => page.evaluate(async() => {
    const {chat, managers} = (window as any).appImManager;
    const draft = await managers.appDraftsManager.getDraft(chat.peerId);
    return draft?._ ?? 'draftMessageEmpty';
  }), {timeout: 15_000}).toBe('draftMessageEmpty');
}

function field(page: Page) {
  return page.evaluate(() => {
    const input: HTMLElement = (window as any).appImManager.chat.input.messageInput;
    return {text: input.textContent, lists: input.querySelectorAll('ol, ul').length};
  });
}
