import {expect, Locator, test} from '@playwright/test';

test.beforeEach(async({page}) => {
  await page.goto('/?popups=1');
  await page.waitForFunction(() => !!window.popupSandbox);
  await page.evaluate(() => window.popupSandbox.ready());
  await page.getByRole('button', {name: '◂ Hide', exact: true}).click();
  await page.evaluate(() => window.popupSandbox.open('storySettings'));
  await expect(page.getByText('Story Settings', {exact: true}).last()).toBeVisible();
});

test('saves the draft and discards subsequent cancelled changes', async({page}) => {
  const popup = page.locator('.popup.active');
  await expect(popup.getByRole('radio', {name: 'Everyone', exact: true})).toBeChecked();
  await popup.locator('label.row').filter({hasText: /^Contacts/}).click();
  await popup.locator('label.row').filter({hasText: /^Allow Screenshots$/}).click();
  await popup.locator('label.row').filter({hasText: /^Keep on My Page$/}).click();
  await popup.getByRole('button', {name: 'SAVE SETTINGS'}).click();
  await expect(popup).toHaveCount(0);
  await page.evaluate(() => window.popupSandbox.open('storySettings'));
  await expect(popup.getByRole('radio', {name: 'Contacts', exact: true})).toBeChecked();
  await expect(popup.getByRole('checkbox', {name: 'Allow Screenshots'})).not.toBeChecked();
  await expect(popup.getByRole('checkbox', {name: 'Keep on My Page'})).not.toBeChecked();
  await popup.locator('label.row').filter({hasText: /^Everyone/}).click();
  await page.keyboard.press('Escape');
  await expect(popup).toHaveCount(0);
  await page.evaluate(() => window.popupSandbox.open('storySettings'));
  await expect(popup.getByRole('radio', {name: 'Contacts', exact: true})).toBeChecked();
});

test('opens the existing contact picker and keeps an empty audience private', async({page}) => {
  const settings = page.locator('.popup').filter({has: page.locator('[role="radiogroup"]')});
  await settings.locator('label.row').filter({hasText: /^Selected Contacts/}).click();
  const picker = page.locator('.popup-forward.active');
  await expect(picker).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(picker).toHaveCount(0);
  await expect(settings.getByRole('radio', {name: 'Selected Contacts', exact: true})).toBeChecked();
  await expect(settings.getByRole('button', {name: 'SAVE SETTINGS'})).toBeDisabled();
  await settings.getByRole('link', {name: 'Select people', exact: true}).click();
  await expect(picker).toBeVisible();
  await expect(picker.getByText('Hide My Stories From', {exact: true})).toBeVisible();
  await picker.locator('.chatlist-chat').filter({hasText: 'Alice Anderson'}).click();
  await picker.getByRole('button', {name: /^save$/i}).click();
  await expect(settings.getByRole('link', {name: '1 person', exact: true})).toBeVisible();
  await settings.getByRole('link', {name: /^edit list/}).last().click();
  await picker.locator('.chatlist-chat').filter({hasText: 'Alice Anderson'}).click();
  await picker.getByRole('button', {name: /^save$/i}).click();
  await expect(settings.getByRole('button', {name: 'SAVE SETTINGS'})).toBeEnabled();
  await settings.getByRole('button', {name: 'SAVE SETTINGS'}).click();
  await page.evaluate(() => window.popupSandbox.open('storySettings'));
  await expect(settings.getByRole('radio', {name: 'Selected Contacts', exact: true})).toBeChecked();
  await expect(settings.locator('.row-subtitle').getByRole('link', {name: /^1 person/})).toBeVisible();
});

test('keeps the draft open after a failed save and allows retry', async({page}) => {
  await page.evaluate(() => window.popupSandbox.closePopups());
  await expect(page.locator('.popup.active')).toHaveCount(0);
  await page.evaluate(async() => {
    const modulePath = '/src/components/popups/storySettings.tsx';
    const {default: showStorySettingsPopup} = await import(/* @vite-ignore */ modulePath);
    let attempt = 0;
    showStorySettingsPopup({
      onSave: async() => {
        if(!attempt++) throw new Error('Test save failure');
      }
    });
  });
  const popup = page.locator('.popup.active');
  await popup.getByRole('button', {name: 'SAVE SETTINGS'}).click();
  await expect(popup.getByRole('alert')).toHaveText('Could not save settings. Please try again.');
  await expect(popup.getByRole('button', {name: 'SAVE SETTINGS'})).toBeEnabled();
  await popup.getByRole('button', {name: 'SAVE SETTINGS'}).click();
  await expect(popup).toHaveCount(0);
});

test('fits a narrow viewport with an accessible footer', async({page}) => {
  await page.setViewportSize({width: 375, height: 667});
  const popup = page.locator('.popup.active');
  const button = popup.getByRole('button', {name: 'SAVE SETTINGS'});
  await expect(button).toBeInViewport();
  const box = await popup.locator('.popup-container').boundingBox();
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(375);
  await page.screenshot({path: 'tmp/story-settings-mobile.png'});
});

test('shares the leading selection and media layout with the square selector', async({page}) => {
  const measure = (rows: Locator) => rows.evaluateAll((elements) => elements.map((row) => {
    const bounds = row.getBoundingClientRect();
    const media = row.querySelector('.row-media').getBoundingClientRect();
    const title = row.querySelector('.row-title').getBoundingClientRect();
    return {
      mediaOffset: media.left - bounds.left,
      titleOffset: title.left - bounds.left
    };
  }));
  const storyRows = page.locator('.popup.active .row-with-checkbox-and-media');
  await expect(storyRows).toHaveCount(4);
  const storyLayout = await measure(storyRows);
  for(const row of storyLayout) expect(row).toEqual({mediaOffset: 60, titleOffset: 120});

  await page.evaluate(() => window.popupSandbox.open('pickUser/leftCheckboxes'));
  const selector = page.locator('.popup-forward.active');
  const selectorRows = selector.locator('.row-with-checkbox-and-media');
  await expect(selectorRows.first()).toBeVisible();
  const selectorLayout = await measure(selectorRows);
  for(const row of selectorLayout) expect(row).toEqual(storyLayout[0]);
  await selector.locator('.chatlist-chat').filter({hasText: 'Alice Anderson'}).click();
  await expect(selector.locator('.chatlist-chat').filter({hasText: 'Alice Anderson'}).getByRole('checkbox')).toBeChecked();

  await page.evaluate(() => window.popupSandbox.open('pickUser/multi'));
  await expect(selector).toBeVisible();
  await expect(selector.locator('.row-with-checkbox-and-media')).toHaveCount(0);
});

test('edits a published story through its manager and preserves publication-only options', async({page}) => {
  await page.evaluate(() => window.popupSandbox.open('storySettings/published'));
  const popup = page.locator('.popup.active');
  await expect(popup.getByRole('radio', {name: 'Contacts', exact: true})).toBeChecked();
  await expect(popup.getByRole('checkbox')).toHaveCount(0);
  await expect(popup.getByRole('link', {name: /^except 1 person/})).toBeVisible();
  await popup.locator('label.row').filter({hasText: /^Everyone/}).click();
  await popup.getByRole('button', {name: 'SAVE SETTINGS'}).click();
  await expect(popup).toHaveCount(0);
  await page.evaluate(() => window.popupSandbox.open('storySettings/published'));
  await expect(popup.getByRole('radio', {name: 'Everyone', exact: true})).toBeChecked();
});

for(const {target, canEdit} of [
  {target: 'self', canEdit: true},
  {target: 'channel', canEdit: true},
  {target: 'group', canEdit: true},
  {target: 'channel', canEdit: false},
  {target: 'group', canEdit: false}
] as const) {
  test(`opens ${target} story settings only with permission (${canEdit})`, async({page}) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.stack || error.message));
    page.on('console', (message) => {
      if(message.type() === 'error') errors.push(message.text());
    });
    await page.evaluate(() => window.popupSandbox.closePopups());
    const readyClass = await page.evaluate(async({target, canEdit}) => {
      const paths = [
        '/src/components/stories/viewer.tsx', '/src/lib/rootScope.ts',
        '/src/components/popupSandbox/mockManagers.ts', '/src/components/popupSandbox/fixtures.ts'
      ];
      const [{createStoriesViewerWithStory}, {default: rootScope}, {createMockManagers}, fixtures] =
        await Promise.all(paths.map((path) => import(/* @vite-ignore */ path)));
      // No media download is needed to exercise the real viewer's settings entrypoints.
      const story = {...fixtures.storyItem, media: {_: 'messageMediaPhoto', pFlags: {}, photo: {_: 'photoEmpty', id: 0}}};
      const peerId = target === 'self' ? rootScope.myId : target === 'group' ? fixtures.MEGAGROUP_PEER_ID : fixtures.CHANNEL_PEER_ID;
      let keepOnPage = true;
      const mock = createMockManagers();
      mock.override({appStoriesManager: {
        getPeer: () => fixtures.peers[peerId],
        getStealthMode: () => ({}),
        getPeerStories: () => ({stories: [story]}),
        getPinnedStoriesCacheSnapshot: () => ({stories: [story], count: 1, loaded: true}),
        getStorySettings: () => ({
          peerType: target === 'self' ? undefined : target,
          privacyType: 'public', everyoneExcept: [] as number[], contactsExcept: [] as number[], closeFriends: [] as number[],
          selectedContacts: [] as number[], hideFrom: [] as number[], allowScreenshots: true, keepOnPage
        }),
        canEditStorySettings: () => canEdit,
        saveStorySettings: (_peerId: number, _id: number, settings: {keepOnPage: boolean}) => {
          keepOnPage = settings.keepOnPage;
          return {saved: true, applied: settings};
        },
        hasRights: () => canEdit
      }});
      rootScope.managers = mock.managers;
      createStoriesViewerWithStory({peerId, storyItem: story});
      const stylePath = '/src/components/stories/viewer.module.scss';
      return (await import(/* @vite-ignore */ stylePath)).default.isReady;
    }, {target, canEdit});
    const viewer = page.locator('#stories-viewer');
    const popup = page.locator('.popup.active');
    await expect(viewer.locator('.' + readyClass)).toBeVisible();
    if(target === 'self') {
      await viewer.locator('.privacy-bg').click();
      await expect(popup.getByText('Story Settings', {exact: true})).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(popup).toHaveCount(0);
    }
    await viewer.locator('.btn-menu-toggle').click();
    if(!canEdit) {
      await expect(page.getByText('Story Settings', {exact: true})).toHaveCount(0);
      expect(errors).toEqual([]);
      return;
    }
    await page.getByText('Story Settings', {exact: true}).last().click();
    if(target === 'self') {
      await expect(popup.getByRole('radio', {name: 'Everyone', exact: true})).toBeChecked();
    } else {
      const title = target === 'group' ? 'Post to Group Page' : 'Post to Channel Page';
      await expect(popup.getByRole('radio')).toHaveCount(0);
      await expect(popup.getByRole('link')).toHaveCount(0);
      await expect(popup.getByRole('checkbox')).toHaveCount(1);
      await expect(popup.getByRole('checkbox', {name: title})).toBeChecked();
      await popup.locator('label.row').click();
      await popup.getByRole('button', {name: 'SAVE SETTINGS'}).click();
      await expect(popup).toHaveCount(0);
      await viewer.locator('.btn-menu-toggle').click();
      await page.getByText('Story Settings', {exact: true}).last().click();
      await expect(popup.getByRole('checkbox', {name: title})).not.toBeChecked();
    }
    expect(errors).toEqual([]);
  });
}
