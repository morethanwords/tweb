import AxeBuilder from '@axe-core/playwright';
import {expect, Page, test} from '@playwright/test';
import {expectNoA11yViolations, moveClient, setIncreasedContrast, settleForMeasurement, trackBrowserErrors} from './accessibility.helpers';
import {openStory, preparePopupSandbox} from './popupSandbox.helpers';

const readPalette = (page: Page) => page.locator('html').evaluate((element) => {
  const style = getComputedStyle(element);
  return Object.fromEntries([
    'primary-color', 'secondary-text-color', 'danger-color', 'link-color', 'green-color',
    'primary-button-color', 'secondary-button-color', 'danger-button-color',
    'message-out-background-color', 'message-out-primary-color',
    'input-placeholder-color', 'input-message-placeholder-color'
  ].map((name) => [name, style.getPropertyValue('--' + name).trim()]));
});

for(const theme of ['day', 'night', 'light', 'tinted']) test(`contrast mode restores the original palette and leaves saved themes unchanged (${theme})`, async({page}) => {
  const errors = trackBrowserErrors(page);
  await preparePopupSandbox(page);
  const themePicker = page.getByRole('combobox', {name: 'Theme', exact: true});
  await themePicker.selectOption(theme);
  await expect(page.locator('html')).not.toHaveClass(/high-contrast/);
  const original = await readPalette(page);
  expect(original['input-placeholder-color']).toBe('#9BA0A5');
  expect(original['input-message-placeholder-color']).toBe('#a2acb4');
  expect(original['primary-button-color']).toBe(original['primary-color']);
  const savedThemes = () => page.evaluate(async() => {
    const path = '/src/stores/appSettings.ts';
    return JSON.stringify((await import(path)).appSettings.themes);
  });
  const before = await savedThemes();

  expect(await openStory(page, 'confirmation/generic')).toBeNull();
  // The ordinary mode deliberately preserves the original palette. Semantic
  // and keyboard requirements apply in both modes; color contrast is audited
  // with the opt-in correction below and across all stories in accessibility.spec.
  // Same settling the helper does, because this scan is built by hand: without
  // it the popup can still be arriving and axe fails with "No elements found
  // for include" instead of measuring anything.
  await settleForMeasurement(page, '.popup.active');
  const ordinary = await new AxeBuilder({page}).include('.popup.active').disableRules(['color-contrast']).analyze();
  expect(ordinary.violations).toEqual([]);
  await setIncreasedContrast(page, true);
  expect(await readPalette(page)).not.toEqual(original);
  await expectNoA11yViolations(page, '.popup.active');
  await page.getByRole('dialog').getByRole('button', {name: 'Cancel', exact: true}).press('Enter');

  // Reapplying a theme while the mode is enabled must keep it enabled.
  await themePicker.selectOption(theme === 'day' ? 'night' : 'day');
  await themePicker.selectOption(theme);
  await expect(page.locator('html')).toHaveClass(/high-contrast/);
  await setIncreasedContrast(page, false);
  expect(await readPalette(page)).toEqual(original);
  expect(await savedThemes()).toBe(before);
  expect(errors).toEqual({pageErrors: [], renderErrors: []});
});

test('contrast changes follow the client into another document and back', async({page}) => {
  await preparePopupSandbox(page);
  const original = await readPalette(page);
  expect(await moveClient(page, true)).toBe(true);
  const otherRoot = page.frameLocator('#a11y-other-window').locator('html');
  await setIncreasedContrast(page, true);
  await expect(otherRoot).toHaveClass(/high-contrast/);
  const contrast = await readPalette(page);
  await expect.poll(() => otherRoot.evaluate((element) => getComputedStyle(element).getPropertyValue('--primary-color').trim())).toBe(contrast['primary-color']);
  await setIncreasedContrast(page, false);
  await expect(otherRoot).not.toHaveClass(/high-contrast/);
  await expect.poll(() => otherRoot.evaluate((element) => getComputedStyle(element).getPropertyValue('--primary-color').trim())).toBe(original['primary-color']);
  await moveClient(page, false);
  expect(await readPalette(page)).toEqual(original);
});
