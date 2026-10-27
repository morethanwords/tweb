import {writeFileSync} from 'fs';
import {expect, test} from '@playwright/test';
import {openChatList} from './chatList.helpers';
import {describeCheckpoint, formatMB, MemoryCheckpoint, MemoryProbe, pickPeers, playRound} from './memory.helpers';

/*
 * A long session must not leave the tab bigger each time it repeats.
 *
 * A prod tab once reached 2.8 GB, and finding where took days of hand-made measurements: Chrome
 * charges the tab for its SharedWorkers and for memory no JavaScript heap shows. This plays the same
 * session several times - conversations scrolled through, the emoji and sticker panels, the profile
 * sidebar - and measures everything after each round, from outside the page (see memory.helpers.ts):
 * every isolate's heap, the renderer by allocator, the DOM, and the app's own counts. A leak is what
 * keeps growing from one identical round to the next; the first round fills the caches and is only
 * the baseline. Then the tab sits idle, and the lottie workers must give their heaps back.
 *
 * Signed in, so it runs against an authorized preview and skips without one - a static one: every
 * round has to run in one document, and a preview that rebuilds on the edits of whoever shares the
 * checkout reloads the page under the run. It also measures the bundle users run, not the dev
 * modules (the dev build alone adds ~13k DOM nodes a round):
 *
 *   bash scripts/start-preview.sh --detach --static --id memory    # prints the URL, say http://localhost:9001
 *   PLAYWRIGHT_BASE_URL=http://localhost:9001 pnpm test:memory:app
 *
 * The preview's account is a live one: messages arriving meanwhile grow the caches a little, which is
 * what the slack in each limit is for. Knobs: MEMORY_ROUNDS (3), MEMORY_CHATS (5), MEMORY_IDLE=0 to
 * skip the idle wait. The checkpoints are attached to the result as memory.json, and printed.
 */

const ROUNDS = +(process.env.MEMORY_ROUNDS || 3);
const CHATS = +(process.env.MEMORY_CHATS || 5);
const IDLE = process.env.MEMORY_IDLE !== '0';
// * the lottie workers put an animation to sleep after two minutes undrawn, then may start afresh
const IDLE_WAIT = 2 * 60_000 + 40_000;
const MB = 1024 * 1024;

// * growth allowed between the first measured round and the last: an absolute floor, or a share
const allowed = (base: number, floor: number, share: number) => Math.max(floor, base * share);

test.describe('memory over a long session', () => {
  test.skip(!process.env.PLAYWRIGHT_BASE_URL, 'needs an authorized preview (PLAYWRIGHT_BASE_URL)');

  // * the right column only floats in beside the conversation on a desktop-sized window
  test.use({viewport: {width: 1280, height: 800}});

  test('does not grow from one identical round to the next, and idle animations give their memory back', async({page, browser}, testInfo) => {
    // * growth is read from round 1 to the last: with one round there is nothing to compare
    expect(ROUNDS, 'MEMORY_ROUNDS must be at least 2').toBeGreaterThanOrEqual(2);
    test.setTimeout((6 + 2 * ROUNDS + (IDLE ? 3 : 0)) * 60_000);

    // * The real SharedWorkers: they are a large part of what the tab costs. On a preview that is
    // * not --static, ?static=1 still gets the built bundle and autoreload=0 keeps it from reloading
    await openChatList(page, {query: '?static=1&autoreload=0', minRows: CHATS});
    const probe = await MemoryProbe.attach(browser, page);
    const peers = await pickPeers(page, CHATS);
    // * Every round must run in the same document - a reload would compare two different sessions and
    // * pass on freshly reset heaps. The document's own start tells it; a navigation event would not,
    // * the app changes the hash all the time
    const timeOrigin = await page.evaluate(() => performance.timeOrigin);
    const reloaded = () => page.evaluate(() => performance.timeOrigin).then((origin) => origin !== timeOrigin, () => true);
    const reloadError = 'the page reloaded under the run - run it against a preview that does not rebuild: start-preview.sh --static';
    expect(peers.length, 'no conversations to go through').toBeGreaterThan(0);

    const checkpoints: MemoryCheckpoint[] = [];
    const measure = async(label: string) => {
      if(await reloaded()) {
        throw new Error(reloadError);
      }

      const checkpoint = await probe.checkpoint(label);
      checkpoints.push(checkpoint);
      console.log(describeCheckpoint(checkpoint));
      return checkpoint;
    };

    try {
      await measure('start');
      // * round 0 fills the caches; only what keeps growing after it counts
      for(let round = 0; round <= ROUNDS; ++round) {
        await playRound(page, peers);
        await measure(`round ${round}`);
      }

      if(IDLE) {
        await page.waitForTimeout(IDLE_WAIT);
        await measure('idle');
      }
    } catch(err) {
      if(await reloaded()) {
        throw new Error(reloadError + ' (' + (err as Error).message + ')');
      }

      throw err;
    } finally {
      // * on disk as well, so a failed run leaves its numbers in test-results
      const path = testInfo.outputPath('memory.json');
      writeFileSync(path, JSON.stringify(checkpoints, null, 1));
      await testInfo.attach('memory.json', {path, contentType: 'application/json'});
    }

    const first = checkpoints.find((checkpoint) => checkpoint.label === 'round 1');
    const last = checkpoints.find((checkpoint) => checkpoint.label === `round ${ROUNDS}`);
    const growth = (read: (checkpoint: MemoryCheckpoint) => number) => read(last) - read(first);

    // * every kind of isolate: the page, the MTProto worker, the pools
    for(const kind of Object.keys(first.heaps)) {
      const base = first.heaps[kind] || 0;
      expect.soft(
        growth((checkpoint) => checkpoint.heaps[kind] || 0),
        `${kind} JS heap grew from round 1 to round ${ROUNDS} (${formatMB(base)} MB at round 1)`
      ).toBeLessThanOrEqual(allowed(base, 8 * MB, 0.1));
    }

    expect.soft(growth((checkpoint) => checkpoint.dom.nodes), 'DOM nodes kept growing')
    .toBeLessThanOrEqual(allowed(first.dom.nodes, 500, 0.1));
    expect.soft(growth((checkpoint) => checkpoint.dom.jsEventListeners), 'event listeners kept growing')
    .toBeLessThanOrEqual(allowed(first.dom.jsEventListeners, 200, 0.1));

    if(first.process && last.process) {
      expect.soft(growth((checkpoint) => checkpoint.process.footprint), 'the renderer\'s footprint kept growing')
      .toBeLessThanOrEqual(allowed(first.process.footprint, 40 * MB, 0.15));
    }

    // * objects a registry keeps for elements already gone: a few are in flight, a climb is a leak
    for(const metric of ['animationItemsDetached', 'lottiePlayersDetached', 'customEmojiRenderersDetached', 'scrollablesRefs', 'avatarsTrackedRefs']) {
      expect.soft(growth((checkpoint) => checkpoint.metrics[metric] || 0), `${metric} kept growing`)
      .toBeLessThanOrEqual(10);
    }

    if(IDLE) {
      // * every lottie worker seen playing: whatever played is asleep by now, and a big heap has been
      // * replaced - one that did not answer is a failure, not a pass
      const idle = checkpoints[checkpoints.length - 1];
      for(const key of Object.keys(last.metrics).filter((key) => /^lottie_\d+\.wasmHeapBytes$/.test(key))) {
        expect.soft(Number.isFinite(idle.metrics[key]), `${key} after idling: no reading`).toBe(true);
        expect.soft(idle.metrics[key], `${key} after idling`).toBeLessThanOrEqual(48 * MB);
      }
    }
  });
});
