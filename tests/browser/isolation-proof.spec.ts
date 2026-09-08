import {test, expect} from '@playwright/test';
import {installBrowserGuards} from './isolation';

test('attempt guard detects forbidden APIs before any network or persistent write', async ({page}) => {
  const requests: string[] = [];
  await page.addInitScript(installBrowserGuards);
  await page.goto('/');
  await page.evaluate(() => document.fonts.ready);
  page.on('request', request => requests.push(request.url()));
  const reports = await page.evaluate(() => {
    const operations = [
      () => fetch('/must-not-fetch'),
      () => new XMLHttpRequest(),
      () => new WebSocket('wss://example.invalid'),
      () => new Worker('/must-not-work'),
      () => new SharedWorker('/must-not-work'),
      () => new RTCPeerConnection(),
      () => new EventSource('/must-not-stream'),
      () => localStorage.setItem('must-not-persist', 'value'),
      () => sessionStorage.setItem('must-not-persist', 'value'),
      () => indexedDB.open('must-not-open'),
      () => navigator.serviceWorker.register('/must-not-register'),
      () => navigator.sendBeacon('/must-not-send'),
      () => navigator.mediaDevices.getUserMedia({audio: true}),
      () => { document.cookie = 'must-not-set=value'; },
      () => URL.createObjectURL(new Blob(['not an export'], {type: 'text/plain'})),
      () => window.open('https://example.invalid')
    ];
    for (const operation of operations) { try { operation(); } catch { /* The guard must record and reject synchronously. */ } }
    return window.__shellIsolation();
  });
  expect(reports.attempts).toEqual(['fetch', 'XMLHttpRequest', 'WebSocket', 'Worker', 'SharedWorker', 'RTCPeerConnection', 'EventSource', 'localStorage', 'sessionStorage', 'indexedDB', 'navigator.serviceWorker', 'sendBeacon', 'navigator.mediaDevices', 'cookie', 'non-JSON object URL', 'open']);
  expect(requests).toEqual([]);
});

test('clipboard reads and rich writes stay forbidden, and plain copying requires actual user activation', async ({page}) => {
  await page.addInitScript(installBrowserGuards, {mockCopy: true});
  await page.addInitScript(() => {
    // Initialization has no gesture. Playwright evaluate can grant a userGesture,
    // so use the browser's own DOM event to test the negative activation case.
    document.addEventListener('DOMContentLoaded', () => {
      const clipboard = navigator.clipboard;
      const operations = [
        ...(clipboard ? [
          () => clipboard.writeText('Must not be copied automatically'),
          () => clipboard.read(),
          () => clipboard.readText(),
          () => clipboard.write([])
        ] : []),
        () => document.execCommand('copy'),
        () => document.execCommand('paste'),
        () => document.execCommand('cut')
      ];
      for(const operation of operations) {try {operation();} catch { /* The audit rejects before accessing the clipboard. */ }}
    }, {once: true});
  });
  await page.goto('/');
  const hasClipboard = await page.evaluate(() => !!navigator.clipboard);
  const reports = await page.evaluate(() => window.__shellIsolation());
  expect(reports.attempts).toEqual([
    ...(hasClipboard ? ['clipboard.writeText without user activation', 'clipboard.read', 'clipboard.readText', 'clipboard.write'] : []),
    'execCommand.copy without user activation', 'execCommand.paste', 'execCommand.cut'
  ]);
  expect(reports.copies).toEqual([]);
  expect(reports.violations).toEqual([]);
});
