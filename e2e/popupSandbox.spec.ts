import {expect, Page, test} from '@playwright/test';

/*
 * Opens every popup the sandbox knows about and asserts it actually renders.
 *
 * The sandbox (`src/components/popupSandbox`, entered with `?popups=1`) answers every manager call
 * from local fixtures, so this needs no session, no authorization and no Telegram traffic — a plain
 * dev server is enough. That makes it a cheap regression net over every popup in the app: one that
 * starts throwing on construction, or never reaches its visible state, fails here.
 *
 * This covers the FIXTURE source only. The panel's other source — the signed-in session's own data,
 * run against the real managers — needs an authorized preview and has no e2e yet; its write guard is
 * covered by `src/tests/popupSandboxLiveManagers.test.ts` instead.
 */

type Story = {id: string, title: string, group: string, surface?: string};

declare global {
  interface Window {
    popupSandbox: {
      ready(): Promise<void>,
      list(): Story[],
      open(id: string): Promise<void>,
      closePopups(): void,
      unhandled(): Array<{manager: string, method: string}>
    };
    /** Where `openStory` parks the outcome for the poller below to pick up. */
    popupSandboxOutcome: {error: string} | undefined;
  }
}

// A popup reveals itself a couple of frames after construction, and some wait on a lottie decode.
const SHOWN_TIMEOUT = 10_000;
// A second look, for content that settles after the popup is already on screen.
const LAYOUT_SETTLE = 300;
// Generous: the slowest story builds its popup in well under a second.
const OPEN_TIMEOUT = 30_000;

/**
 * Opens one story and returns the message it threw with, or null.
 *
 * Deliberately not `page.evaluate(async ...)`. An async evaluate hands the returned promise to
 * Chromium's inspector, which holds it with a WEAK handle (`Runtime.callFunctionOn` with
 * `awaitPromise`). Opening a popup allocates enough for a GC to land inside that window, and the
 * handle is then collected before the resolution is reported: the protocol answers
 * `-32000 Promise was collected`, which Playwright rewrites into the thoroughly misleading
 * "Execution context was destroyed, most likely because of a navigation." Nothing navigates and
 * nothing hangs — the story opens and its promise resolves (a few ms BEFORE that error arrives);
 * only the trip back to the test is lost. It used to take out `transaction/history-stars-self`,
 * the heaviest open in the registry, on nearly every full run.
 *
 * So: start the work from a synchronous evaluate that parks the outcome on the page, then poll for
 * it with short synchronous evaluates that never leave a pending promise with the debugger.
 */
async function openStory(page: Page, id: string): Promise<string> {
  await page.evaluate((storyId) => {
    window.popupSandboxOutcome = undefined;
    window.popupSandbox.open(storyId).then(
      () => {window.popupSandboxOutcome = {error: null};},
      (err) => {window.popupSandboxOutcome = {error: (err as Error)?.message || String(err)};}
    );
  }, id);

  const deadline = Date.now() + OPEN_TIMEOUT;
  for(;;) {
    const outcome = await page.evaluate(() => window.popupSandboxOutcome);
    if(outcome) return outcome.error;
    if(Date.now() > deadline) return `did not settle within ${OPEN_TIMEOUT}ms`;
    await page.waitForTimeout(50);
  }
}

/**
 * What the popup shell promises about the layout it assembles, asserted on whatever popup is open.
 *
 * All of it is measured relatively — one box against another, never against the viewport — so a
 * popup still running its open transform, or one of its own, reads the same as a settled one.
 *
 * Every rule here stands for a bug that shipped: a body pulled out of its scroll by a margin meant
 * for the container (the whole popup stopped scrolling), a card's shadow cut off at the edge that
 * clips it, a divider that vanished when the scroll stopped drawing it, an end state left stale
 * from before the popup was visible.
 */
function collectLayoutComplaints() {
  const popup = [...document.querySelectorAll('.popup.active')].pop() as HTMLElement;
  if(!popup) return [] as string[];

  // Inlined rather than shared with the test: this function is serialized into the page, where
  // nothing from this file exists. How far past its own box a card paints (`--section-box-shadow`
  // is 1px down, 4px wide).
  const shadowReach = 3;

  const complaints: string[] = [];
  const container = popup.querySelector('.popup-container') as HTMLElement;
  const scroll = popup.querySelector('.popup-scrollable') as HTMLElement;
  const shadedFooter = popup.querySelector('.popup-footer-shaded') as HTMLElement;
  const round = (value: number) => Math.round(value * 10) / 10;

  // A footer in the flow ends where the popup does. A floating one is free to sit elsewhere —
  // `forward` keeps its footer translated out of sight until there is something to send.
  if(container && shadedFooter) {
    const gap = round(container.getBoundingClientRect().bottom - shadedFooter.getBoundingClientRect().bottom);
    if(Math.abs(gap) > 1) complaints.push(`flow footer sits ${gap}px off the popup's bottom`);
  }

  // The body inside a scroll is the scrolled content: it starts where the scroll does, and anything
  // taller than the scrollport is reachable by scrolling rather than simply cut off.
  const body = scroll?.querySelector(':scope > .popup-body') as HTMLElement;
  if(scroll && body) {
    const escaped = round(scroll.getBoundingClientRect().top - body.getBoundingClientRect().top);
    if(escaped > 1) complaints.push(`body starts ${escaped}px above its scroll`);

    const overflow = round(body.getBoundingClientRect().height - scroll.clientHeight);
    const canScroll = scroll.scrollHeight - scroll.clientHeight;
    if(overflow > 1 && canScroll <= 1) complaints.push(`body overflows its scroll by ${overflow}px with nothing to scroll`);
  }

  // The scroll lends the footer below it a few pixels of room for the shadow of the last card —
  // and hands them straight back, so the pair has to cancel out or the layout moves.
  popup.querySelectorAll('.popup-scrollable').forEach((element) => {
    const style = getComputedStyle(element);
    const margin = parseFloat(style.marginBottom) || 0;
    const padding = parseFloat(style.paddingBottom) || 0;
    const lendsToFooter = (element.nextElementSibling as HTMLElement)?.classList.contains('popup-footer-shaded');
    if(lendsToFooter) {
      if(margin >= 0) complaints.push('scroll above a flow footer takes no bleed');
      else if(Math.abs(padding + margin) > 0.5) complaints.push(`scroll's bleed does not cancel: ${padding}px padding against ${margin}px margin`);
    } else if(margin < -0.5) {
      complaints.push(`scroll pulls ${margin}px into whatever follows it, which is no flow footer`);
    }
  });

  // The line between the content and the footer is drawn from this state, so it has to be the
  // scroll's actual one — a popup is laid out while still hidden, where it can read differently.
  if(scroll && shadedFooter) {
    const atEnd = scroll.scrollHeight - scroll.clientHeight <= 1;
    if(shadedFooter.classList.contains('scrolled-end') !== atEnd) {
      complaints.push(`footer reads ${atEnd ? 'mid-scroll while the scroll cannot move' : 'settled while the scroll still has ' + (scroll.scrollHeight - scroll.clientHeight) + 'px to go'}`);
    }
  }

  // A row of buttons does not shade itself, so the scroll draws that border instead.
  if(scroll && popup.querySelector('.popup-buttons') && !scroll.classList.contains('scrollable-y-bordered-bottom')) {
    complaints.push('scroll above a row of buttons draws no border against it');
  }

  // A card that ends where its content ends needs room for the shadow it paints below itself.
  // Only at the end of the scroll: anywhere else the card's edge is a scroll position, and a list
  // still filling itself passes through every position on its way.
  popup.querySelectorAll('.sidebar-left-section').forEach((section) => {
    if(getComputedStyle(section).boxShadow === 'none') return;

    for(let clipper = section.parentElement; clipper && popup.contains(clipper); clipper = clipper.parentElement) {
      const style = getComputedStyle(clipper);
      if(style.overflowY === 'visible' && style.overflowX === 'visible') continue;

      const atEnd = clipper.scrollHeight - clipper.clientHeight - clipper.scrollTop <= 1;
      const clipEdge = clipper.getBoundingClientRect().bottom - (parseFloat(style.borderBottomWidth) || 0);
      const room = round(clipEdge - section.getBoundingClientRect().bottom);
      if(atEnd && room >= 0 && room < shadowReach) {
        complaints.push(`a card's shadow is cut off: ${room}px of room inside .${clipper.className.split(' ')[0]}`);
      }

      break;
    }
  });

  // What a floating footer takes out of the content has to be at least as tall as the footer is.
  const placeholder = popup.querySelector('.popup-footer-placeholder') as HTMLElement;
  const floatingFooter = popup.querySelector('.popup-footer-floating') as HTMLElement;
  if(placeholder && floatingFooter) {
    const short = round(floatingFooter.getBoundingClientRect().height - placeholder.getBoundingClientRect().height);
    if(short > 0.5) complaints.push(`floating footer is ${short}px taller than the room reserved for it`);
  }

  return complaints;
}

/** Complaints that survive a second look — content that settles late is not a violation. */
async function layoutComplaints(page: Page): Promise<string[]> {
  const first = await page.evaluate(collectLayoutComplaints);
  if(!first.length) return first;

  await page.waitForTimeout(LAYOUT_SETTLE);
  return await page.evaluate(collectLayoutComplaints);
}

test('every popup story opens and becomes visible', async({page}) => {
  // One test walks the whole registry, so it needs far more than the config's per-test default.
  test.setTimeout(5 * 60_000);

  const pageErrors: string[] = [];
  const renderErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.stack || error.message || String(error)));
  // Our Solid fork reports render failures through console.error rather than window.onerror.
  page.on('console', (message) => {
    if(message.type() === 'error' && message.text().startsWith('solid error')) {
      renderErrors.push(message.text().split('\n')[0]);
    }
  });

  await page.goto('/?popups=1');
  await page.waitForFunction(() => !!window.popupSandbox, null, {timeout: 30_000});
  await page.evaluate(() => window.popupSandbox.ready());

  const stories = await page.evaluate(() => window.popupSandbox.list());
  expect(stories.length).toBeGreaterThan(0);

  const failed: string[] = [];
  for(const story of stories) {
    pageErrors.length = 0;
    renderErrors.length = 0;

    const opened = await openStory(page, story.id);

    if(opened) {
      failed.push(`${story.id}: threw while opening — ${opened}`);
    } else {
      // a story that is not a popup (the sign-in cards own the screen) names its own proof
      const shown = story.surface || '.popup.active';
      try {
        await expect.poll(
          () => page.evaluate((selector) => document.querySelectorAll(selector).length, shown),
          {timeout: SHOWN_TIMEOUT}
        ).toBeGreaterThan(0);
      } catch{
        failed.push(`${story.id}: never became visible`);
      }

      if(pageErrors.length) {
        failed.push(`${story.id}: page error — ${pageErrors.join(' | ')}`);
      }

      for(const complaint of await layoutComplaints(page)) {
        failed.push(`${story.id}: ${complaint}`);
      }
    }

    // Teardown is deliberately outside the assertion window (errors reset at the top of the loop):
    // several popups model "cancelled" as a rejected promise, and closing one from a script rather
    // than through the caller's own flow leaves that rejection unhandled — the sandbox's doing.
    await page.evaluate(() => window.popupSandbox.closePopups());
    // Longer than the 250ms hide timeout, after which a closed popup fires `closeAfterTimeout`.
    await page.waitForTimeout(400);
    if(renderErrors.length) {
      failed.push(`${story.id}: render error — ${renderErrors.join(' | ')}`);
    }
  }

  expect(failed, `\n${failed.join('\n')}\n`).toEqual([]);
});
