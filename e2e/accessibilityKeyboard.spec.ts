import {expect, test} from '@playwright/test';
import {openStory, preparePopupSandbox} from './popupSandbox.helpers';

test.beforeEach(async({page}) => preparePopupSandbox(page));

test('Enter on Cancel never triggers the confirmation action', async({page}) => {
  expect(await openStory(page, 'confirmation/generic')).toBeNull();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  const clicked: string[] = [];
  await page.exposeFunction('recordA11yClick', (label: string) => clicked.push(label));
  await dialog.evaluate((element) => {
    element.addEventListener('click', (event) => {
      const button = (event.target as HTMLElement).closest('button');
      if(button) (window as any).recordA11yClick(button.textContent.trim());
    }, true);
  });
  await dialog.getByRole('button', {name: 'Cancel', exact: true}).press('Enter');
  await expect(dialog).toHaveCount(0);
  expect(clicked).toEqual(['Cancel']);
});

test('modal Tab navigation wraps and restores the opening control on Escape', async({page}) => {
  const trigger = page.getByRole('button', {name: 'PopupPeer — title + description peer/basic', exact: true});
  await trigger.press('Enter');
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  const buttons = dialog.getByRole('button');
  await buttons.first().focus();
  await page.keyboard.press('Shift+Tab');
  await expect(buttons.last()).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(buttons.first()).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

test('native selection fields toggle once with a hardware keyboard', async({page}) => {
  expect(await openStory(page, 'peer/with-checkbox')).toBeNull();
  const checkbox = page.getByRole('dialog').getByRole('checkbox');
  await expect(checkbox).toHaveAccessibleName('Unsend My Messages');
  const initial = await checkbox.isChecked();
  await checkbox.press('Space');
  await expect(checkbox).toBeChecked({checked: !initial});
  await checkbox.press('Space');
  await expect(checkbox).toBeChecked({checked: initial});
});

test('date picker exposes time fields and keyboard-operable month navigation', async({page}) => {
  expect(await openStory(page, 'datePicker/withTime')).toBeNull();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('textbox', {name: 'Hours', exact: true})).toBeVisible();
  await expect(dialog.getByRole('textbox', {name: 'Minutes', exact: true})).toBeVisible();
  const next = dialog.getByRole('button', {name: 'Next month', exact: true});
  await next.press('Enter');
  await expect(dialog.getByRole('button', {name: 'Previous month', exact: true})).toBeEnabled();
  await dialog.getByRole('button', {name: 'Close', exact: true}).press('Enter');
  await expect(dialog).toHaveCount(0);
});

test('stream key visibility and revoke are separate keyboard actions', async({page}) => {
  expect(await openStory(page, 'rtmp/active')).toBeNull();
  const dialog = page.getByRole('dialog');
  const reveal = dialog.getByRole('button', {name: 'Show stream key', exact: true});
  await expect(reveal).toHaveAttribute('aria-pressed', 'false');
  await reveal.press('Space');
  await expect(reveal).toHaveAttribute('aria-pressed', 'true');
  await expect(dialog.getByText('sandbox-stream-key', {exact: true})).toBeVisible();
  await expect(page.locator('.toast')).toHaveCount(0);
  await dialog.getByRole('button', {name: 'Revoke Stream Key', exact: true}).press('Enter');
  await expect(dialog.getByText('sandbox-revoked-key', {exact: true})).toBeVisible();
  await reveal.press('Enter');
  await expect(reveal).toHaveAttribute('aria-pressed', 'false');
  await expect(dialog.getByText('sandbox-revoked-key', {exact: true})).toHaveCount(0);
});

test('a nested group opens from the keyboard and hides its rows while closed', async({page}) => {
  expect(await openStory(page, 'deleteMegagroupMessages')).toBeNull();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();

  // The row is a label around a checkbox that is disabled while the nested
  // fields drive it, so this chevron is the only way to open the group.
  const toggle = dialog.getByRole('button', {name: 'Delete all from Alice'});
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');

  // Collapsed is `height: 0` with the overflow clipped: the rows are invisible
  // but still laid out, so without `inert` they stay focusable and Tab would
  // stop on a control drawn nowhere. Checked by trying to focus one — Playwright
  // computes roles from the DOM and does not take `inert` out of its own tree
  // the way a browser does.
  const accordion = dialog.locator('.accordion').first();
  const nested = accordion.locator('.checkbox-field-input').first();
  const focusNested = () => nested.evaluate((element: HTMLElement) => {
    element.focus();
    return document.activeElement === element;
  });

  await expect(accordion).toHaveAttribute('inert', '');
  expect(await focusNested(), 'a row of a closed group took focus').toBe(false);

  await toggle.press('Enter');
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect(accordion).not.toHaveAttribute('inert', '');
  expect(await focusNested(), 'a row of an open group would not take focus').toBe(true);

  await toggle.press(' ');
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(accordion).toHaveAttribute('inert', '');
  expect(await focusNested(), 'a row of a closed group took focus').toBe(false);
});

test('the country list closes on its own before the dialog does', async({page}) => {
  expect(await openStory(page, 'payment/card')).toBeNull();
  const dialog = page.getByRole('dialog');
  const combobox = dialog.getByRole('combobox').first();

  await combobox.focus();
  await expect(combobox).toHaveAttribute('aria-expanded', 'true');

  // The list is drawn over the rest of the form, so Tab would otherwise move to
  // a control behind it and light up a focus ring nobody can see.
  await page.keyboard.press('Tab');
  await expect(combobox).toHaveAttribute('aria-expanded', 'false');

  await combobox.focus();
  await expect(combobox).toHaveAttribute('aria-expanded', 'true');
  await page.keyboard.press('Escape');
  await expect(combobox).toHaveAttribute('aria-expanded', 'false');
  await expect(dialog).toBeVisible();

  // and the next Escape reaches the dialog, as it would have all along
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
});
