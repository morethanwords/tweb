import {expect, Locator, Page} from '@playwright/test';
import {test} from './workerContext';
import {preparePopupSandbox} from './popupSandbox.helpers';
import {trackBrowserErrors} from './accessibility.helpers';

type StoryOptions = {
  peer: 'channel' | 'megagroup',
  replyMode?: 'none' | 'boost',
  stealth?: boolean
};

// * a channel's or a group's story in the viewer, on the sandbox's managers: what the heart sends is recorded there
async function openStory(page: Page, options: StoryOptions) {
  await preparePopupSandbox(page, true, {a11y: true});
  await page.evaluate(async({peer, replyMode, stealth}) => {
    const [{storyItem, photo, CHANNEL_PEER_ID, MEGAGROUP_PEER_ID, channelChat, megagroupChat}, {seedMirror}, {getMockManagers}, {createStoriesViewerWithProvider}] = await Promise.all([
      window.e2eImport('/src/components/popupSandbox/fixtures.ts'),
      window.e2eImport('/src/components/popupSandbox/bootstrapState.ts'),
      window.e2eImport('/src/components/popupSandbox/environment.ts'),
      window.e2eImport('/src/components/stories/viewer.tsx')
    ]);
    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 960;
    const painter = canvas.getContext('2d');
    painter.fillStyle = '#234b73';
    painter.fillRect(0, 0, canvas.width, canvas.height);
    const localPhoto = {...photo, id: '9001002', sizes: [{_: 'photoSize', type: 'x', w: 640, h: 960, size: 1000}]};
    seedMirror('thumbs', 'photo' + localPhoto.id, {x: {type: 'x', downloaded: 1000, url: canvas.toDataURL()}});
    const peerId = peer === 'channel' ? CHANNEL_PEER_ID : MEGAGROUP_PEER_ID;
    const stories = [{
      ...storyItem,
      pFlags: {public: true},
      caption: '',
      media: {_: 'messageMediaPhoto', pFlags: {}, photo: localPhoto}
    }];
    getMockManagers().override({
      appStoriesManager: {
        getStealthMode: () => ({
          _: 'storiesStealthMode',
          active_until_date: stealth ? Math.floor(Date.now() / 1000) + 600 : undefined
        }),
        getPeer: () => peer === 'channel' ? channelChat : megagroupChat,
        getStoryById: (_peerId: number, id: number) => stories.find((story) => story.id === id),
        getPeerStories: () => ({stories, peer: {_: 'peerChannel', channel_id: peerId.toChatId()}}),
        getStoriesById: () => stories,
        getStoriesViews: (): [] => [],
        hasRights: () => false,
        canEditStorySettings: () => false,
        getReplyMode: () => ({mode: replyMode || 'none', boostsNeeded: 3}),
        sendReaction: (): void => undefined
      },
      appReactionsManager: {
        getAvailableReactionsByMessage: () => ({type: 'chatReactionsAll', reactions: [] as any[]})
      }
    });
    const trigger = document.createElement('button');
    trigger.textContent = 'Open local stories';
    document.body.append(trigger);
    trigger.onclick = () => createStoriesViewerWithProvider({}, {peers: [{peerId, stories, index: 0, count: 1}], index: 0, manualLoad: true});
  }, options);

  await page.getByRole('button', {name: 'Open local stories', exact: true}).press('Enter');
  const viewer = page.getByRole('dialog', {name: 'Stories', exact: true});
  await expect(viewer).toBeVisible();
  // * held still, or the one story plays to its end and the viewer goes
  await viewer.getByRole('button', {name: 'Pause', exact: true}).click();
  await expect(viewer.getByRole('button', {name: 'Play', exact: true})).toBeVisible();
  return viewer;
}

const getSentReactions = (page: Page) => page.evaluate(async() => {
  const {getMockManagers} = await window.e2eImport('/src/components/popupSandbox/environment.ts');
  return getMockManagers().calls
  .filter((call: {method: string}) => call.method === 'sendReaction')
  .map((call: {args: any[]}) => call.args[2] ?? null);
});

const getStrip = (viewer: Locator) => viewer.locator('.btn-menu-reactions-container.is-visible');

test('a right click on the heart opens the whole choice, Escape closes it, a tap puts a heart on', async({page}) => {
  const errors = trackBrowserErrors(page);
  const viewer = await openStory(page, {peer: 'channel'});
  const heart = viewer.getByRole('button', {name: 'Reactions', exact: true});
  await heart.click({button: 'right'});
  await expect(getStrip(viewer)).toBeVisible();
  // * nothing is sent by opening it
  expect(await getSentReactions(page)).toEqual([]);

  await page.keyboard.press('Escape');
  await expect(getStrip(viewer)).toHaveCount(0);
  await expect(viewer).toBeVisible();

  // * a press on another control while it is open only closes it: the story stays paused
  await heart.click({button: 'right'});
  await expect(getStrip(viewer)).toBeVisible();
  await viewer.getByRole('button', {name: 'Play', exact: true}).click();
  await expect(getStrip(viewer)).toHaveCount(0);
  await expect(viewer.getByRole('button', {name: 'Play', exact: true})).toBeVisible();

  await heart.click();
  await expect.poll(() => getSentReactions(page)).toEqual([{_: 'reactionEmoji', emoticon: '❤'}]);
  expect(errors).toEqual({pageErrors: [], renderErrors: []});
});

test('the context menu key opens the choice from the heart, and Escape gives the focus back to it', async({page}) => {
  const viewer = await openStory(page, {peer: 'channel'});
  const heart = viewer.getByRole('button', {name: 'Reactions', exact: true});
  await heart.focus();
  await page.keyboard.press('Shift+F10');
  await expect(getStrip(viewer)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(getStrip(viewer)).toHaveCount(0);
  await expect(heart).toBeFocused();
  await expect(viewer).toBeVisible();
});

test('in Stealth Mode the first reaction asks first, once', async({page}) => {
  const viewer = await openStory(page, {peer: 'channel', stealth: true});
  const heart = viewer.getByRole('button', {name: 'Reactions', exact: true});
  await heart.click();
  const warning = page.getByText('You are in Stealth Mode now');
  await expect(warning).toBeVisible();
  await page.getByRole('button', {name: 'Cancel', exact: true}).click();
  await expect(warning).toHaveCount(0);
  expect(await getSentReactions(page)).toEqual([]);

  await heart.click();
  await expect.poll(() => getSentReactions(page)).toEqual([{_: 'reactionEmoji', emoticon: '❤'}]);
  await expect(warning).toHaveCount(0);
});

test('a group whose restrictions boosting lifts shows the locked field, with the heart beside it', async({page}) => {
  const viewer = await openStory(page, {peer: 'megagroup', replyMode: 'boost'});
  await expect(viewer.getByRole('button', {name: /Comments restricted/})).toBeVisible();
  await expect(viewer.getByRole('button', {name: 'Reactions', exact: true})).toBeVisible();
  await expect(viewer.locator('.stories-input')).toHaveCount(0);
});

test('the story holds still while the boost popup loads, and plays on when it does not open', async({page}) => {
  const viewer = await openStory(page, {peer: 'megagroup', replyMode: 'boost'});
  await page.evaluate(async() => {
    const {getMockManagers} = await window.e2eImport('/src/components/popupSandbox/environment.ts');
    let answer: (status: undefined) => void;
    (window as any).answerBoostsStatus = () => answer(undefined);
    getMockManagers().override({
      appBoostsManager: {
        getBoostsStatus: () => new Promise((resolve) => {
          answer = resolve;
          (window as any).boostsStatusAsked = true;
        }),
        getMyBoosts: () => ({_: 'premium.myBoosts', my_boosts: [] as any[], chats: [] as any[], users: [] as any[]})
      }
    });
  });
  await viewer.getByRole('button', {name: 'Play', exact: true}).click();
  await expect(viewer.getByRole('button', {name: 'Pause', exact: true})).toBeVisible();

  await viewer.getByRole('button', {name: /Comments restricted/}).click();
  await expect(viewer.getByRole('button', {name: 'Play', exact: true})).toBeVisible();

  // * no status to show: a toast instead of the popup, and the story goes on
  await expect.poll(() => page.evaluate(() => !!(window as any).boostsStatusAsked)).toBe(true);
  await expect(viewer.getByRole('button', {name: 'Play', exact: true})).toBeVisible();
  await page.evaluate(() => (window as any).answerBoostsStatus());
  await expect(page.getByText('Sorry, you can\'t boost this group or channel.')).toBeVisible();
  await expect(viewer.getByRole('button', {name: 'Pause', exact: true})).toBeVisible();
});

test('a popup the boost popup hands over to keeps the story still till it closes too', async({page}) => {
  const viewer = await openStory(page, {peer: 'megagroup', replyMode: 'boost'});
  await page.evaluate(async() => {
    const [{getMockManagers}, {default: rootScope}, {CHANNEL_PEER_ID}] = await Promise.all([
      window.e2eImport('/src/components/popupSandbox/environment.ts'),
      window.e2eImport('/src/lib/rootScope.ts'),
      window.e2eImport('/src/components/popupSandbox/fixtures.ts')
    ]);
    // * every boost already given to another chat: boosting this group means moving one
    rootScope.premium = true;
    getMockManagers().override({
      appBoostsManager: {
        getBoostsStatus: () => ({_: 'premium.boostsStatus', pFlags: {}, level: 1, current_level_boosts: 1, boosts: 2, next_level_boosts: 5, boost_url: 'https://t.me/boost'}),
        getMyBoosts: () => ({
          _: 'premium.myBoosts',
          my_boosts: [{_: 'myBoost', slot: 1, peer: {_: 'peerChannel', channel_id: CHANNEL_PEER_ID.toChatId()}, date: 0, expires: 2e9}],
          chats: [] as any[],
          users: [] as any[]
        })
      }
    });
  });
  await viewer.getByRole('button', {name: 'Play', exact: true}).click();
  await expect(viewer.getByRole('button', {name: 'Pause', exact: true})).toBeVisible();

  await viewer.getByRole('button', {name: /Comments restricted/}).click();
  await page.getByRole('button', {name: 'Boost Group', exact: true}).click();
  const reassign = page.locator('.popup').filter({has: page.getByRole('button', {name: /Reassign/})});
  await expect(reassign).toBeVisible();
  // * the boost popup gone, its own resume asked for: the story still waits under the one that took over
  await expect(page.getByRole('button', {name: 'Boost Group', exact: true})).toHaveCount(0);
  // * the boost popup let go of — the same moment it asks the story to play on
  await expect.poll(() => page.evaluate(async() => {
    const {default: PopupElement} = await window.e2eImport('/src/components/popups/indexTsx.tsx');
    return PopupElement.POPUPS.length;
  })).toBe(1);
  await expect(viewer.getByRole('button', {name: 'Play', exact: true})).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(reassign).toHaveCount(0);
  await expect(viewer.getByRole('button', {name: 'Pause', exact: true})).toBeVisible();
});
