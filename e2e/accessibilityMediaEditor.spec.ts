import {expect, Page} from '@playwright/test';
import {test} from './workerContext';
import {expectNoA11yViolations} from './accessibility.helpers';
import {openStory, preparePopupSandbox} from './popupSandbox.helpers';

async function openEditor(page: Page, story = 'newMedia') {
  page.setDefaultTimeout(30_000);
  await preparePopupSandbox(page);
  expect(await openStory(page, story)).toBeNull();
  const actions = page.getByRole('button', {name: 'Media actions', exact: true});
  await expect(actions).toBeEnabled();
  await actions.press('Enter');
  await page.getByRole('menuitem', {name: 'Edit', exact: true}).press('Enter');
  const editor = page.getByRole('dialog', {name: 'Edit', exact: true});
  await expect(editor).toBeVisible({timeout: 30_000});
  await expect(editor).toHaveAttribute('aria-busy', 'false', {timeout: 30_000});
  return editor;
}

test('photo editing is keyboard-operable and returns to the caption without sending', async({page}, testInfo) => {
  test.setTimeout(180_000);
  const editor = await openEditor(page);
  const brightness = editor.getByRole('slider', {name: 'Brightness', exact: true});
  await brightness.press('ArrowRight');
  await expect(brightness).toHaveValue('1');
  await expectNoA11yViolations(page, '.media-editor__overlay');

  await editor.getByRole('button', {name: 'Close', exact: true}).press('Enter');
  const discard = page.getByRole('dialog', {name: 'Discard Changes', exact: true});
  await discard.getByRole('button', {name: 'Cancel', exact: true}).press('Enter');
  await expect(editor).toBeVisible();
  await expect(brightness).toHaveValue('1');

  await editor.getByRole('tab', {name: 'Adjustments', exact: true}).press('ArrowRight');
  await editor.getByRole('button', {name: 'Square', exact: true}).press('Enter');
  await expect(editor.getByRole('button', {name: 'Square', exact: true})).toHaveAttribute('aria-pressed', 'true');
  const rotation = editor.getByRole('slider', {name: 'Fine rotation', exact: true});
  await expect(rotation).toBeEnabled();
  await rotation.press('ArrowRight');
  await expect(rotation).toHaveValue('1');
  await rotation.press('ArrowLeft');
  await expect(rotation).toHaveValue('0');
  await expectNoA11yViolations(page, '.media-editor__overlay');

  await editor.getByRole('tab', {name: 'Crop', exact: true}).press('ArrowRight');
  await editor.getByRole('button', {name: 'Add text layer', exact: true}).press('Enter');
  await editor.getByRole('textbox', {name: 'Type something...', exact: true}).fill('A11y');
  const layer = editor.locator('.media-editor__resizable-container');
  const left = await layer.evaluate((element: HTMLElement) => parseFloat(element.style.left));
  await editor.getByRole('button', {name: 'Layer actions', exact: true}).press('Enter');
  await page.getByRole('menuitem', {name: 'Move right', exact: true}).press('Enter');
  await expect.poll(() => layer.evaluate((element: HTMLElement) => parseFloat(element.style.left))).toBeGreaterThan(left);
  await editor.getByRole('button', {name: 'Layer actions', exact: true}).press('Enter');
  await page.getByRole('menuitem', {name: 'Delete', exact: true}).press('Enter');
  await expect(layer).toHaveCount(0);
  await expect.poll(() => editor.evaluate((element) => element.contains(document.activeElement))).toBe(true);
  await editor.getByRole('button', {name: 'Undo', exact: true}).press('Enter');
  await expect(editor.getByRole('textbox', {name: 'Type something...', exact: true})).toHaveText('A11y');
  await expectNoA11yViolations(page, '.media-editor__overlay');
  await editor.getByRole('button', {name: 'Custom color', exact: true}).press('Enter');
  await expect(editor.getByRole('textbox', {name: 'HEX', exact: true})).toBeVisible();
  await expectNoA11yViolations(page, '.media-editor__overlay');
  await editor.getByRole('button', {name: 'Custom color', exact: true}).press('Enter');
  await expect(editor.getByRole('textbox', {name: 'HEX', exact: true})).toHaveCount(0);

  await editor.getByRole('button', {name: 'Done', exact: true}).press('Enter');
  await expect(editor).toHaveCount(0, {timeout: 30_000});
  const attachment = page.getByRole('dialog', {name: 'Send Photo', exact: true});
  await expect(attachment.getByRole('button', {name: 'Send', exact: true})).toBeEnabled();
  await page.screenshot({path: testInfo.outputPath('edited-photo.png')});
  await attachment.getByRole('button', {name: 'Close', exact: true}).press('Enter');
});

test('video trimming exposes values and supports keyboard changes', async({page}) => {
  test.setTimeout(180_000);
  const editor = await openEditor(page, 'newMedia/video');
  const play = editor.getByRole('button', {name: 'Play', exact: true});
  await expect(play).toBeVisible();
  const mute = editor.getByRole('button', {name: 'Mute', exact: true});
  await mute.press('Space');
  await expect(editor.getByRole('button', {name: 'Unmute', exact: true})).toBeVisible();
  await expect(play).toBeVisible();
  await editor.getByRole('button', {name: 'Unmute', exact: true}).press('Space');
  await expect(mute).toBeVisible();
  await expect(play).toBeVisible();
  const end = editor.getByRole('slider', {name: 'Trim end', exact: true});
  await expect(end).toBeVisible({timeout: 30_000});
  const before = Number(await end.getAttribute('aria-valuenow'));
  await end.press('ArrowLeft');
  await expect.poll(async() => Number(await end.getAttribute('aria-valuenow'))).toBeLessThan(before);
  await expectNoA11yViolations(page, '.media-editor__overlay');
  await editor.getByRole('button', {name: 'Close', exact: true}).press('Enter');
  await page.getByRole('dialog', {name: 'Discard Changes', exact: true}).getByRole('button', {name: 'Discard', exact: true}).press('Enter');
  await expect(editor).toHaveCount(0);
});

test('removing the last local attachment restores focus past its closing dialog', async({page}) => {
  await preparePopupSandbox(page);
  const trigger = page.getByRole('button', {name: 'Attach media newMedia', exact: true});
  await trigger.press('Enter');
  const actions = page.getByRole('button', {name: 'Media actions', exact: true});
  await expect(actions).toBeEnabled();
  await actions.press('Enter');
  await page.getByRole('menuitem', {name: 'Delete', exact: true}).press('Enter');
  await expect(page.getByRole('dialog', {name: 'Send Photo', exact: true})).toHaveCount(0);
  await expect(trigger).toBeFocused();
});
