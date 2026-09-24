import {expect, test} from '@playwright/test';
import {createSweepRecorder} from './focusPixels.helpers';

/*
 * The sign-in screens as they really are: the entry point of an unauthorized
 * client, not the sandbox's fixtures of the same cards.
 *
 * It runs against a plain dev server with no session, which is what
 * `playwright.config.ts` starts when PLAYWRIGHT_BASE_URL is unset.
 */
test('the sign-in screens show visible keyboard focus', async({page}, testInfo) => {
  test.setTimeout(15 * 60_000);

  await page.goto('/');
  await page.locator('#auth-pages').waitFor({state: 'visible', timeout: 120_000});
  await page.waitForTimeout(2500);

  const run = createSweepRecorder(page, testInfo, 'pixel-auth-progress.json');

  // An unauthorized client opens on the QR screen; the phone form is behind a
  // button on it.
  await run.sweep('auth:qr', '#auth-pages');

  const byPhone = page.getByRole('button', {name: /phone number|номер/i}).first();
  if(await byPhone.isVisible().catch(() => false)) {
    await byPhone.click();
    await page.waitForTimeout(2500);
    await run.sweep('auth:phone', '#auth-pages');

    // The country field is a combobox whose list covers the form below it.
    const country = page.locator('#auth-pages [role="combobox"]').first();
    if(await country.count()) {
      await country.focus();
      await page.waitForTimeout(1500);
      await run.sweep('auth:country-list', '#auth-pages');
      await page.keyboard.press('Escape');
      await page.waitForTimeout(800);
    } else {
      await run.note('country picker: the phone screen has no combobox');
    }
  } else {
    await run.note('phone sign-in: no button to reach it');
  }

  await testInfo.attach('focus-pixels-auth.json', {
    body: JSON.stringify({walked: run.walked, totalStops: run.total(), findings: run.findings, notes: run.notes}, null, 2),
    contentType: 'application/json'
  });

  console.log('AUTHSWEEP stops=' + run.total() + ' findings=' + run.findings.length +
    ' notes=' + JSON.stringify(run.notes));

  // the QR screen alone has two, so a run that never reached the phone form
  // must not read as a clean one
  expect(run.total(), 'the sweep never got past the first sign-in screen').toBeGreaterThan(8);
  expect(run.findings, run.summary()).toEqual([]);
});
