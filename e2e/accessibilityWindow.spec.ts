import {expect} from '@playwright/test';
import {test} from './workerContext';
import {openStory, preparePopupSandbox} from './popupSandbox.helpers';
import {moveClient, trackBrowserErrors} from './accessibility.helpers';

test('an open dialog keeps its focus scope when the client moves to another document and back', async({page}) => {
  const errors = trackBrowserErrors(page);
  await preparePopupSandbox(page);
  expect(await openStory(page, 'confirmation/generic')).toBeNull();
  const cancel = page.getByRole('dialog').getByRole('button', {name: 'Cancel', exact: true});
  await cancel.focus();
  expect(await moveClient(page, true)).toBe(true);
  const inFrame = page.frameLocator('#a11y-other-window');
  const dialog = inFrame.getByRole('dialog');
  await expect(dialog.getByRole('button', {name: 'Cancel', exact: true})).toBeFocused();
  const controls = dialog.getByRole('button');
  await controls.first().focus();
  await page.keyboard.press('Shift+Tab');
  await expect(controls.last()).toBeFocused();

  await moveClient(page, false);
  const restored = page.getByRole('dialog');
  await expect(restored.getByRole('button').last()).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(restored.getByRole('button').first()).toBeFocused();
  await restored.getByRole('button', {name: 'Cancel', exact: true}).press('Enter');
  await expect(restored).toHaveCount(0);
  expect(errors).toEqual({pageErrors: [], renderErrors: []});
});

test('a menu closes on a window move while its parent dialog remains keyboard-operable', async({page}) => {
  const errors = trackBrowserErrors(page);
  await preparePopupSandbox(page);
  expect(await openStory(page, 'rtmp/start')).toBeNull();
  expect(await moveClient(page, true)).toBe(true);
  const inFrame = page.frameLocator('#a11y-other-window');
  await inFrame.getByRole('dialog').getByRole('button', {name: 'More', exact: true}).press('Enter');
  await expect(inFrame.getByRole('menu')).toBeVisible();
  await moveClient(page, false);
  await expect(page.getByRole('menu')).toHaveCount(0);
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', {name: 'Close', exact: true}).press('Enter');
  await expect(dialog).toHaveCount(0);
  expect(errors).toEqual({pageErrors: [], renderErrors: []});
});

test('a dialog created in the other window can close after returning to the tab', async({page}) => {
  const errors = trackBrowserErrors(page);
  await preparePopupSandbox(page);
  expect(await moveClient(page, true)).toBe(true);
  const frame = page.frameLocator('#a11y-other-window');
  const triggerName = 'confirmationPopup() confirmation/generic';
  await frame.getByRole('button', {name: triggerName, exact: true}).press('Enter');
  const dialog = frame.getByRole('dialog');
  await dialog.getByRole('button', {name: 'Cancel', exact: true}).focus();
  await moveClient(page, false);
  await page.getByRole('dialog').getByRole('button', {name: 'Cancel', exact: true}).press('Enter');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('button', {name: triggerName, exact: true})).toBeFocused();
  expect(errors).toEqual({pageErrors: [], renderErrors: []});
});
