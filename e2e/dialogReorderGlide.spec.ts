import {expect, Page, test} from '@playwright/test';
import {openChatList} from './chatList.helpers';

/*
 * A chat that a new message takes up the chat list glides to its new place, and the rows it passes
 * make room for it by gliding down (`VerticalVirtualList`). A message seldom comes alone: reading
 * it, the draft it was typed in going, the server confirming it - each updates the dialog again a
 * moment later, in the place it has just taken. Such an update moves nothing, and it must leave the
 * glide running instead of cutting it to its end. The chat here comes from out of sight, its row not
 * even in the rendered window - the way the open chat does once the list has been scrolled away
 * from it.
 *
 * Nothing is sent: the list is handed the index a new message would give the chat, and its own back
 * after. It needs a signed-in account, so like the other signed-in specs it runs against an
 * authorized preview, and skips rather than reporting a pass it never made:
 *
 *   bash scripts/start-preview.sh --detach    # prints the URL, say http://localhost:9001
 *   PLAYWRIGHT_BASE_URL=http://localhost:9001 pnpm exec playwright test e2e/dialogReorderGlide.spec.ts
 */

/** where the chat lands: under this many rows of the list, which stay where they are */
const ROWS_ABOVE = 2;

type Glide = {
  /** the row the chat lands on - it makes room, a row lower */
  from: number,
  to: number,
  /** where that row is once the updates are in, before a frame is drawn */
  afterUpdates: number,
  /** where it is on every frame after, and how long after the updates that frame came */
  frames: {top: number, time: number}[],
  /** how many of the rows above the place stood animating, though they do not move */
  animatingAbove: number,
  /** and whether the row that makes room did */
  animatingPassed: boolean
};

/**
 * Takes a chat whose row is out of the rendered window up under the first rows, through as many
 * updates of its dialog in a row, and follows the row it lands on until it is still
 */
function moveChatUp(page: Page, updates: number): Promise<Glide | null> {
  return page.evaluate(async({updates, ROWS_ABOVE}) => {
    const sortedList = (window as any).appDialogsManager.xd.sortedList;
    const items: any[] = sortedList.getSortedItems();
    const rowOf = (item: any): HTMLElement => item.value.type === 'dialog' ? item.value.value.dom.listEl : undefined;

    const above = items.slice(0, ROWS_ABOVE).map(rowOf);
    const passed = rowOf(items[ROWS_ABOVE]);
    const mover = items.find((item, idx) => idx > ROWS_ABOVE && rowOf(item) && !rowOf(item).isConnected);
    if(!mover || !passed?.isConnected || above.some((row) => !row?.isConnected)) {
      return null;
    }

    // * between the last row above and the one it lands on
    const index = items[ROWS_ABOVE].index + 1;
    if(index >= items[ROWS_ABOVE - 1].index) {
      return null;
    }

    const nextFrame = () => new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve)));
    await nextFrame();

    // * where the row is drawn: its place in the list, and the transform that glides it there
    const drawnTop = (row: HTMLElement) => parseFloat(row.style.top) + new DOMMatrix(getComputedStyle(row).transform).m42;
    const from = drawnTop(passed);
    const getIndexForKey = sortedList.getIndexForKey;
    sortedList.getIndexForKey = (key: any) => key === mover.id ? index : getIndexForKey.call(sortedList, key);
    try {
      // * the message, and the updates that follow it - all in before the next frame
      await Promise.all(Array.from({length: updates}, () => sortedList.update(mover.id)));
      const updatedAt = performance.now();
      const afterUpdates = drawnTop(passed);
      const animatingAbove = above.filter((row) => row.style.getPropertyValue('--background')).length;
      const animatingPassed = !!passed.style.getPropertyValue('--background');

      const frames: Glide['frames'] = [];
      for(let i = 0; i < 40; ++i) {
        await nextFrame();
        frames.push({top: drawnTop(passed), time: performance.now() - updatedAt});
      }

      return {
        from,
        // * the chat's row is in the list now: the one it lands on goes down by its height
        to: from + rowOf(mover).offsetHeight,
        afterUpdates,
        frames,
        animatingAbove,
        animatingPassed
      };
    } finally {
      sortedList.getIndexForKey = getIndexForKey;
      await sortedList.update(mover.id);
      for(let i = 0; i < 20; ++i) await nextFrame();
    }
  }, {updates, ROWS_ABOVE});
}

test.describe('a chat taken up the chat list', () => {
  test.skip(!process.env.PLAYWRIGHT_BASE_URL, 'needs an authorized preview (PLAYWRIGHT_BASE_URL)');

  test.beforeEach(async({page}) => {
    await openChatList(page, {minRows: ROWS_ABOVE + 1});
    // * rows glide only with full animations - with reduced ones or none they step to their place
    test.skip(
      !await page.evaluate(() => document.body.classList.contains('animation-level-2')),
      'motion is off in this client'
    );
  });

  test('glides there, and an update that moves nothing does not cut the glide short', async({page}) => {
    const glide = await moveChatUp(page, 3);
    test.skip(!glide, 'no chat out of the rendered window under the first rows, in this account');

    const {from, to, afterUpdates, frames} = glide;
    expect(to).toBeGreaterThan(from);
    // * the updates only set the glide off: the row is drawn where it was until a frame moves it
    expect(afterUpdates).toBe(from);

    let previous = from;
    for(const {top, time} of frames) {
      expect(top).toBeGreaterThanOrEqual(previous);
      expect(top).toBeLessThanOrEqual(to);
      // * a frame that comes in good time finds it still on its way
      if(time < 80) {
        expect(top).toBeLessThan(to);
      }

      previous = top;
    }

    expect(frames[frames.length - 1].top).toBe(to);
  });

  // * every row the list holds is laid out again by an update, and one that stays where it is has
  // * nothing to glide: it starts no animation, and does not wear the background of one
  test('only the rows that move animate', async({page}) => {
    const glide = await moveChatUp(page, 1);
    test.skip(!glide, 'no chat out of the rendered window under the first rows, in this account');

    expect(glide.animatingPassed).toBe(true);
    expect(glide.animatingAbove).toBe(0);
  });
});
