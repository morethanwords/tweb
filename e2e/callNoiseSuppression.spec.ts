import {test, expect} from '@playwright/test';

// The call noise suppressor (src/lib/calls/noiseSuppression) in a real
// browser: RNNoise in its AudioWorklet between a microphone and what a call
// sends, and the denoised track standing in for the microphone. The fixture's
// microphone loops a second of noise, then syllables over the same noise.
test.beforeEach(async({page}) => {
  await page.goto('/e2e/fixtures/callNoiseSuppression.html');
  await page.waitForFunction(() => !!window.callNoiseSuppression);
  expect(await page.evaluate(() => window.callNoiseSuppression.start())).toEqual({denoised: true});
});

test('sends the voice and drops the noise', async({page}) => {
  // A whole loop and then some.
  const levels = await page.evaluate(() => window.callNoiseSuppression.sample(6000));

  // The quietest stretch of the microphone is the noise alone; it goes out
  // at least 25 dB lower.
  expect(Math.min(...levels.sent)).toBeLessThan(Math.min(...levels.microphone) - 25);
  // The loudest syllables go out at their level (give or take what 50 ms
  // analyser windows catch of them).
  expect(Math.abs(Math.max(...levels.sent) - Math.max(...levels.microphone))).toBeLessThan(6);

  const {status} = await page.evaluate(() => window.callNoiseSuppression.state());
  expect(status).toMatchObject({engine: 'rnnoise'});
  expect(status.bypassed).toBeUndefined();
  expect(status.reports).toBeGreaterThanOrEqual(4);
  expect(status.meanLoad).toBeGreaterThan(0);
  expect(status.meanLoad).toBeLessThan(0.4);
});

test('mutes through the track it sends', async({page}) => {
  // Each switch is sampled after the audio already in flight has played out.
  await page.evaluate(() => window.callNoiseSuppression.setEnabled(false));
  await page.waitForTimeout(500);
  const muted = await page.evaluate(() => window.callNoiseSuppression.sample(6000));
  expect(Math.max(...muted.sent)).toBeLessThan(-100);
  expect(Math.max(...muted.microphone)).toBeGreaterThan(-30);

  await page.evaluate(() => window.callNoiseSuppression.setEnabled(true));
  await page.waitForTimeout(500);
  const unmuted = await page.evaluate(() => window.callNoiseSuppression.sample(6000));
  expect(Math.max(...unmuted.sent)).toBeGreaterThan(Math.max(...unmuted.microphone) - 6);
});

test('reads as muted while the microphone is', async({page}) => {
  // What the calls check before reusing a capture, and what the group call's
  // microphone indicator listens to.
  await page.evaluate(() => window.callNoiseSuppression.muteMicrophone(true));
  expect(await page.evaluate(() => window.callNoiseSuppression.state())).toMatchObject({
    sentMuted: true,
    sentEvents: ['mute']
  });

  await page.evaluate(() => window.callNoiseSuppression.muteMicrophone(false));
  expect(await page.evaluate(() => window.callNoiseSuppression.state())).toMatchObject({
    sentMuted: false,
    sentEvents: ['mute', 'unmute']
  });
});

test('releases the microphone when the sent track stops', async({page}) => {
  await page.evaluate(() => window.callNoiseSuppression.stopSent());
  expect(await page.evaluate(() => window.callNoiseSuppression.state())).toMatchObject({
    microphone: 'ended',
    sent: 'ended'
  });
});

test('ends the sent track when the microphone goes away', async({page}) => {
  await page.evaluate(() => window.callNoiseSuppression.endMicrophone());
  expect(await page.evaluate(() => window.callNoiseSuppression.state())).toMatchObject({
    microphone: 'ended',
    sent: 'ended',
    sentEnded: true
  });
});
