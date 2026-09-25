import {expect, Page} from '@playwright/test';
import {test} from './workerContext';
import {preparePopupSandbox} from './popupSandbox.helpers';
import {expectNoA11yViolations, moveClient, trackBrowserErrors} from './accessibility.helpers';

async function prepareStories(page: Page, inOtherDocument = false) {
  await preparePopupSandbox(page);
  await page.evaluate(async() => {
    const load = (path: string) => import('/src/' + path);
    const [{storyItem, photo, SELF_PEER_ID, selfUser}, {seedMirror}, {getMockManagers}, {createStoriesViewerWithProvider}] = await Promise.all([
      load('components/popupSandbox/fixtures.ts'),
      load('components/popupSandbox/bootstrapState.ts'),
      load('components/popupSandbox/environment.ts'),
      load('components/stories/viewer.tsx')
    ]);
    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 960;
    const painter = canvas.getContext('2d');
    painter.fillStyle = '#234b73';
    painter.fillRect(0, 0, canvas.width, canvas.height);
    const localPhoto = {...photo, id: '9001001', sizes: [{_: 'photoSize', type: 'x', w: 640, h: 960, size: 1000}]};
    seedMirror('thumbs', 'photo' + localPhoto.id, {x: {type: 'x', downloaded: 1000, url: canvas.toDataURL()}});
    const stories = [1, 2].map((id) => ({
      ...storyItem,
      id,
      caption: `Story ${id}. ` + 'A long local caption for keyboard scrolling.\n'.repeat(45),
      media: {_: 'messageMediaPhoto', pFlags: {}, photo: localPhoto}
    }));
    getMockManagers().override({appStoriesManager: {
      getStealthMode: () => ({_: 'storiesStealthMode'}),
      getPeer: () => selfUser,
      getStoryById: (_peerId: number, id: number) => stories.find((story) => story.id === id),
      getPeerStories: () => ({stories, peer: {_: 'peerUser', user_id: SELF_PEER_ID}}),
      getStoriesById: () => stories,
      getStoriesViews: (): [] => [],
      hasRights: () => false,
      canEditStorySettings: () => false
    }});
    const trigger = document.createElement('button');
    trigger.textContent = 'Open local stories';
    document.body.append(trigger);
    trigger.onclick = () => createStoriesViewerWithProvider({}, {peers: [{peerId: SELF_PEER_ID, stories, index: 0, count: 2}], index: 0, manualLoad: true});
  });
  if(inOtherDocument) expect(await moveClient(page, true)).toBe(true);
}

test('story caption scrolling and controls keep keyboard focus inside the viewer', async({page}) => {
  const errors = trackBrowserErrors(page);
  await prepareStories(page);
  const trigger = page.getByRole('button', {name: 'Open local stories', exact: true});
  await trigger.press('Enter');
  const viewer = page.getByRole('dialog', {name: 'Stories', exact: true});
  await expect(viewer).toBeVisible();
  await expect.poll(() => viewer.evaluate((element) => element.contains(element.ownerDocument.activeElement))).toBe(true);
  const caption = viewer.getByRole('region', {name: 'Story caption', exact: true});
  await viewer.getByRole('button', {name: 'Next story', exact: true}).press('Enter');
  await expect(caption).toContainText('Story 2.');
  await viewer.getByRole('button', {name: 'Previous story', exact: true}).press('Enter');
  await expect(caption).toContainText('Story 1.');
  const pause = viewer.getByRole('button', {name: 'Pause', exact: true});
  await pause.press('Enter');
  await expect(viewer.getByRole('button', {name: 'Play', exact: true})).toBeVisible();
  await caption.press('PageDown');
  await expect.poll(() => caption.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  await expect(viewer).toBeVisible();
  await expectNoA11yViolations(page, '[role="dialog"][aria-label="Stories"]');
  const timeOrigin = await page.evaluate(() => performance.timeOrigin);
  await page.keyboard.press('Escape');
  await expect(viewer).toHaveCount(0);
  await expect(trigger).toBeFocused();
  expect(await page.evaluate(() => performance.timeOrigin)).toBe(timeOrigin);
  expect(errors).toEqual({pageErrors: [], renderErrors: []});
});

test('a story opened in the other document mounts there and closes with Escape', async({page}) => {
  const errors = trackBrowserErrors(page);
  await prepareStories(page, true);
  const frame = page.frameLocator('#a11y-other-window');
  const trigger = frame.getByRole('button', {name: 'Open local stories', exact: true});
  await trigger.press('Enter');
  const viewer = frame.getByRole('dialog', {name: 'Stories', exact: true});
  await expect(viewer).toBeVisible();
  await expect(page.getByRole('dialog', {name: 'Stories', exact: true})).toHaveCount(0);
  await expect.poll(() => viewer.evaluate((element) => element.contains(element.ownerDocument.activeElement))).toBe(true);
  await viewer.getByRole('button', {name: 'Close', exact: true}).press('Escape');
  await expect(viewer).toHaveCount(0);
  await expect(trigger).toBeFocused();
  expect(errors).toEqual({pageErrors: [], renderErrors: []});
});
