import {expect, type Page} from '@playwright/test';
import {test} from './workerContext';
import {openStory, preparePopupSandbox} from './popupSandbox.helpers';

// While the call hears someone, waves rise behind their avatar in the list and the photo shrinks a
// little (avatarBlobs.ts); once they fall silent, both go. The sandbox has no RTP receivers, so the
// levels are handed to the speaking detector's sampler directly.

declare global {
  interface Window {
    groupCallController: any;
    groupCallTestLevels: Map<number, number>;
    groupCallTestGlides: string[];
  }
}

type Row = {peerId: number, speaking: boolean, painted: number, green: boolean, transform: string};

function readRows(page: Page): Promise<Row[]> {
  return page.evaluate(() => {
    return [...document.querySelectorAll<HTMLElement>('.group-call-participant')].map((row) => {
      const canvas = row.querySelector<HTMLCanvasElement>('.group-call-participant-blobs');
      let painted = 0, red = 0, green = 0;
      if(canvas) {
        const {data} = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
        for(let i = 0; i < data.length; i += 4) {
          if(data[i + 3]) {
            ++painted;
            red += data[i];
            green += data[i + 1];
          }
        }
      }

      return {
        peerId: +row.dataset.peerId,
        speaking: !!row.querySelector('.group-call-participant-status.is-speaking'),
        painted,
        green: green > red,
        transform: row.querySelector<HTMLElement>('.dialog-avatar').style.transform
      };
    });
  });
}

test('a speaker\'s avatar gets waves while they speak, and loses them once they are silent', async({page}) => {
  await preparePopupSandbox(page, false);
  expect(await openStory(page, 'call/groupCall')).toBeNull();
  await page.waitForSelector('.group-call-participant .dialog-avatar');

  // everyone is loud; only the rows whose microphone is open may show it
  await page.evaluate(() => {
    const instance = window.groupCallController.groupCall;
    const peerIds = [...document.querySelectorAll<HTMLElement>('.group-call-participant')].map((row) => +row.dataset.peerId);
    window.groupCallTestLevels = new Map(peerIds.map((peerId) => [peerId, 0.2]));
    instance.sampleSpeakingLevels = () => [...window.groupCallTestLevels];
  });

  await expect.poll(async() => (await readRows(page)).filter((row) => row.speaking && row.painted).length).toBeGreaterThan(0);
  // once the waves are in: green and full round a speaker, whose photo shrinks; none round the rest
  const settled = (row: Row) => row.speaking ?
    row.painted > 500 && row.green && /^scale\(0\.9\d*\)$/.test(row.transform) :
    row.painted === 0 && row.transform === '';
  await expect.poll(async() => (await readRows(page)).filter((row) => !settled(row)).map((row) => row.peerId)).toEqual([]);

  // silence: the detector holds the speaker for 1.5 s, then the waves leave in 0.4 s
  await page.evaluate(() => window.groupCallTestLevels.clear());
  await expect.poll(async() => (await readRows(page)).every((row) => !row.painted && !row.transform), {timeout: 5000}).toBe(true);
});

// The rows slide to their new places (createListGlide), as the chat list's do: not while the
// list fills on opening, only for what changes after.
test('the rows under someone who leaves slide up, and the first fill just appears', async({page}) => {
  await preparePopupSandbox(page, false);
  // Rows can land one by one — a row's participant read from the worker, a page loaded by
  // scrolling — while the sandbox places them all within one task, which would hide a glide on
  // the fill: each row's place is held back a task here.
  await page.evaluate(async() => {
    const path = '/src/components/groupCall/participantsList.ts';
    const {prototype} = (await window.e2eImport(path)).default;
    const getParticipant = prototype.getParticipant;
    prototype.getParticipant = async function(...args: any[]) {
      await new Promise((resolve) => setTimeout(resolve));
      return getParticipant.apply(this, args);
    };
  });

  await page.evaluate(() => {
    window.groupCallTestGlides = [];
    const animate = Element.prototype.animate;
    Element.prototype.animate = function(this: HTMLElement, ...args: Parameters<Element['animate']>) {
      if(this.classList.contains('group-call-participant') && JSON.stringify(args[0]).includes('translateY')) {
        window.groupCallTestGlides.push(this.dataset.peerId);
      }

      return animate.apply(this, args);
    };
  });

  expect(await openStory(page, 'call/groupCallCrowd')).toBeNull();
  // every row in, and a frame for any glide the last of them would start
  const count = await page.evaluate(async() => (await window.groupCallController.groupCall.participants).size);
  await expect.poll(() => page.locator('.group-call-participant').count()).toBe(count);
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  expect(await page.evaluate(() => window.groupCallTestGlides)).toEqual([]);


  // Someone near the top leaves; returned are the rows below that can be seen on their way up, and
  // who left — their own row may glide too in the frame before it is taken out, unseen.
  const leave = () => page.evaluate(async() => {
    const instance = window.groupCallController.groupCall;
    const rows = [...document.querySelectorAll<HTMLElement>('.group-call-participant')];
    for(let index = 1; index < rows.length - 1; ++index) {
      const participant = await instance.getParticipantByPeerId(+rows[index].dataset.peerId);
      if(participant.pFlags.self) {
        continue;
      }

      const viewport = rows[index].closest('.scrollable').getBoundingClientRect();
      const height = rows[index].getBoundingClientRect().height;
      const below = rows.slice(index + 1).filter((row) => {
        const top = row.getBoundingClientRect().top;
        return top + height > viewport.top && top - height < viewport.bottom;
      }).map((row) => row.dataset.peerId);
      (window as any).rootScope.dispatchEvent('group_call_participant', {
        groupCallId: instance.id,
        participant: {...participant, pFlags: {...participant.pFlags, left: true}}
      });
      return {below, left: rows[index].dataset.peerId};
    }
  });
  const glidesBut = (left: string) => page.evaluate((left) => window.groupCallTestGlides.filter((peerId) => peerId !== left), left);
  const nextFrames = () => page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));

  // the video tiles over the list fill the panel: rows out of sight just go to their places
  const offscreen = await leave();
  expect(offscreen.below).toEqual([]);
  await expect.poll(() => page.locator('.group-call-participant').count()).toBe(count - 1);
  await nextFrames();
  expect(await glidesBut(offscreen.left)).toEqual([]);

  // the next one to leave in the middle of the view, clear of the end of the list: a list scrolled
  // to its end would scroll back as it shortens, moving every row
  await page.locator('.group-call-participants-scrollable').evaluate((element) => {
    const row = element.querySelectorAll('.group-call-participant')[1];
    const viewport = element.getBoundingClientRect();
    element.scrollTop += row.getBoundingClientRect().top - (viewport.top + viewport.height / 2);
  });
  // A scroll loads the next page of the roster, which in the sandbox still lists who left: their
  // row comes back. Once the list holds still, someone leaves again.
  let rowsBefore = -1;
  await expect.poll(async() => {
    await nextFrames();
    const rows = await page.locator('.group-call-participant').count();
    const still = rows === rowsBefore;
    rowsBefore = rows;
    return still;
  }).toBe(true);
  await page.evaluate(() => window.groupCallTestGlides.length = 0);
  const inView = await leave();
  expect(inView.below.length).toBeGreaterThan(0);
  await expect.poll(() => glidesBut(inView.left)).toEqual(inView.below);
});

// The call's key opens into a card in the middle of the dimmed panel (fingerprintBadge.tsx), a
// narrow one here, and folds back into its pill on Escape, which leaves the panel open, or on a
// click on the dim.
test('the encryption key opens into a card and folds back on Escape or a click outside', async({page}) => {
  await preparePopupSandbox(page, false);
  expect(await openStory(page, 'call/conference')).toBeNull();
  const card = page.locator('.conference-encryption-card');
  const overlay = page.locator('.conference-encryption-overlay');
  await expect(card).toHaveAttribute('aria-expanded', 'false');
  await expect(overlay).toBeHidden();
  // where the pill rests once the panel has finished opening
  let pill = await card.boundingBox();
  await expect.poll(async() => {
    const previous = pill;
    await page.waitForTimeout(100);
    pill = await card.boundingBox();
    return pill.y === previous.y && pill.x === previous.x;
  }).toBe(true);

  const centerOffset = async() => {
    const [box, panel] = await Promise.all([card.boundingBox(), page.locator('.group-call').boundingBox()]);
    return Math.abs(box.y + box.height / 2 - (panel.y + panel.height / 2));
  };

  await card.click();
  await expect(card).toHaveAttribute('aria-expanded', 'true');
  await expect(overlay).toBeVisible();
  await expect(page.locator('.conference-encryption-info')).toBeVisible();
  await expect.poll(centerOffset).toBeLessThan(2);

  await page.keyboard.press('Escape');
  await expect(card).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('.popup-group-call')).toBeVisible();
  await expect.poll(async() => (await card.boundingBox()).y).toBeCloseTo(pill.y, 0);
  await expect(overlay).toBeHidden();

  await card.click();
  await expect(card).toHaveAttribute('aria-expanded', 'true');
  await overlay.click({position: {x: 10, y: 10}});
  await expect(card).toHaveAttribute('aria-expanded', 'false');
});

// A wide panel has the video beside the participants' column (at the inline end: on the left right
// to left). The key's pill sits at the top of the column, over the participants rather than over
// the video, and goes into the header beside its buttons while the column is hidden — by a
// transform, its own layout staying as it was; the card it opens into is in the middle of the
// panel all the same.
for(const dir of ['ltr', 'rtl'] as const) test(`the encryption key's pill sits over the participants' column of a wide panel (${dir})`, async({page}) => {
  await preparePopupSandbox(page, false);
  await page.evaluate((dir) => window.popupSandbox.setDirection(dir), dir);
  expect(await openStory(page, 'call/conference')).toBeNull();
  await page.locator('.group-call-header .btn-icon[aria-label="Enter full screen"]').first().click();
  const panel = page.locator('.group-call');
  await expect(panel).toHaveClass(/is-big-layout/);
  await expect(panel).toHaveClass(/is-right-column-shown/);
  const card = page.locator('.conference-encryption-card');
  const column = page.locator('.group-call > .popup-body');
  const settled = async() => {
    const before = await card.boundingBox();
    await page.waitForTimeout(100);
    const after = await card.boundingBox();
    return before.x === after.x && before.y === after.y && before.width === after.width;
  };
  const centre = (box: {x: number, y: number, width: number, height: number}) => ({
    x: box.x + box.width / 2,
    y: box.y + box.height / 2
  });
  const expectOverColumn = async() => {
    await expect.poll(settled).toBe(true);
    const [pill, columnBox, header, firstRow, stage] = await Promise.all([
      card.boundingBox(),
      column.boundingBox(),
      column.locator('> .group-call-header').boundingBox(),
      column.locator('.group-call-participant').first().boundingBox(),
      page.locator('.group-call-stage').boundingBox()
    ]);
    expect(pill.x).toBeGreaterThanOrEqual(columnBox.x);
    expect(pill.x + pill.width).toBeLessThanOrEqual(columnBox.x + columnBox.width);
    expect(Math.abs(centre(pill).x - centre(columnBox).x)).toBeLessThan(1);
    // between the column's header and its first participant
    expect(pill.y).toBeGreaterThanOrEqual(header.y + header.height);
    expect(pill.y + pill.height).toBeLessThanOrEqual(firstRow.y);
    // and the video has no row kept for it above
    expect(stage.y).toBeLessThan(pill.y);
  };
  await expectOverColumn();
  const layout = () => card.evaluate((element: HTMLElement) => [element.offsetLeft, element.offsetTop]);
  const columnLayout = await layout();

  await card.click();
  await expect(card).toHaveAttribute('aria-expanded', 'true');
  await expect(card).not.toHaveClass(/is-morphing/);
  const [open, panelBox] = await Promise.all([card.boundingBox(), panel.boundingBox()]);
  expect(Math.abs(centre(open).x - centre(panelBox).x)).toBeLessThan(1);
  expect(Math.abs(centre(open).y - centre(panelBox).y)).toBeLessThan(2);

  // folding, the pill is carried back by the morph alone: no transition of the track's own on top
  await page.evaluate(() => {
    const track = document.querySelector('.conference-encryption-track');
    track.querySelector('.conference-encryption-card').addEventListener('click', () => setTimeout(() => {
      (window as any).groupCallTestTransitions = track.getAnimations()
        .filter((animation) => animation instanceof CSSTransition)
        .map((animation) => (animation as CSSTransition).transitionProperty);
    }), {once: true});
  });
  await card.click();
  await expect(card).toHaveAttribute('aria-expanded', 'false');
  expect(await page.waitForFunction(() => (window as any).groupCallTestTransitions).then((handle) => handle.jsonValue())).toEqual([]);
  await expectOverColumn();

  const header = panel.locator('> .group-call-header');
  const expectInHeader = async() => {
    await expect.poll(settled).toBe(true);
    const [pill, panelNow, stage, title, button] = await Promise.all([
      card.boundingBox(),
      panel.boundingBox(),
      page.locator('.group-call-stage').boundingBox(),
      header.locator('.group-call-header-info').boundingBox(),
      // the one button at the header's far end in full screen
      header.locator('.btn-icon[aria-label="Show participants"]').boundingBox()
    ]);
    // in the middle of the band over the video, from the panel's top to where the stage begins
    expect(Math.abs(centre(pill).y - (panelNow.y + stage.y) / 2)).toBeLessThan(.5);
    // right before the button, and after the title, which keeps some room of its own
    const [beforeButton, afterTitle] = dir === 'ltr' ?
      [button.x - (pill.x + pill.width), pill.x - (title.x + title.width)] :
      [pill.x - (button.x + button.width), title.x - (pill.x + pill.width)];
    expect(beforeButton).toBeGreaterThanOrEqual(0);
    expect(beforeButton).toBeLessThanOrEqual(8);
    expect(afterTitle).toBeGreaterThanOrEqual(0);
    expect(title.width).toBeGreaterThanOrEqual(60);
  };

  await page.locator('.popup-body .btn-icon[aria-label="Hide participants"]').click();
  await expect(panel).not.toHaveClass(/is-right-column-shown/);
  await expectInHeader();
  expect(await layout()).toEqual(columnLayout);

  await page.locator('.btn-icon[aria-label="Show participants"]').click();
  await expect(panel).toHaveClass(/is-right-column-shown/);
  await expectOverColumn();

  // a full screen too narrow for the widest pill and the title: the title keeps its first letters
  await page.locator('.popup-body .btn-icon[aria-label="Hide participants"]').click();
  await expect(panel).not.toHaveClass(/is-right-column-shown/);
  // a window in full screen cannot be resized
  await header.locator('.btn-icon[aria-label="Exit full screen"]').click();
  await expect(panel).not.toHaveClass(/is-full-screen/);
  await page.setViewportSize({width: 480, height: 600});
  await header.locator('.btn-icon[aria-label="Enter full screen"]').click();
  await expect(panel).toHaveClass(/is-big-layout/);
  await expectInHeader();
});

// A press holds the pill at `scale: .97`, which eases back to 1 while the card opens. Its boxes, read
// on screen at the click, are 3% short: the surface ended that much smaller than the card, whose own
// fill then took over in the last frame, growing on every side. The surface's last frame is the card.
test('a pressed pill opens into the card without growing in the last frame', async({page}) => {
  await preparePopupSandbox(page, false);
  expect(await openStory(page, 'call/conference')).toBeNull();
  const card = page.locator('.conference-encryption-card');
  await expect.poll(async() => {
    const before = await card.boundingBox();
    await page.waitForTimeout(100);
    const after = await card.boundingBox();
    return before.x === after.x && before.y === after.y;
  }).toBe(true);

  // the morph paused as soon as it starts, the press's own transition with it
  await page.evaluate(() => {
    document.querySelector('.conference-encryption-card').addEventListener('click', () => setTimeout(() => {
      (window as any).groupCallTestAnimations = document.getAnimations();
      (window as any).groupCallTestAnimations.forEach((animation: Animation) => animation.pause());
    }), {once: true});
  });
  const box = await card.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await expect.poll(() => card.evaluate((element) => getComputedStyle(element).scale)).toBe('0.97');
  await page.mouse.up();
  await page.waitForFunction(() => (window as any).groupCallTestAnimations);

  const surfaceAt = (time: number) => page.evaluate((time) => {
    (window as any).groupCallTestAnimations.forEach((animation: Animation) => animation.currentTime = time);
    const card = document.querySelector('.conference-encryption-card');
    const topLeft = card.querySelector('.conference-encryption-surface-tl').getBoundingClientRect();
    const bottomRight = card.querySelector('.conference-encryption-surface-br').getBoundingClientRect();
    return {width: bottomRight.right - topLeft.left, height: bottomRight.bottom - topLeft.top};
  }, time);

  // the first frame is the pressed pill
  const first = await surfaceAt(0);
  expect(first.width).toBeCloseTo(box.width * .97, 0);
  expect(first.height).toBeCloseTo(box.height * .97, 0);

  const last = await surfaceAt(449);
  // finish(), not play(): a finished animation played again starts over
  await page.evaluate(() => (window as any).groupCallTestAnimations.forEach((animation: Animation) => animation.finish()));
  await expect(card).not.toHaveClass(/is-morphing/);
  const open = await card.boundingBox();
  expect(last.width).toBeCloseTo(open.width, 0);
  expect(last.height).toBeCloseTo(open.height, 0);
});

// The panel goes full screen itself, and popups follow whatever goes full screen: moving this one
// into its own container tore it down, and the app showed instead of the call. A popup opened from
// the call in full screen goes inside it, and keeps its own layout there.
test('full screen shows the video chat, with a popup opened from it on top', async({page}) => {
  await preparePopupSandbox(page, false);
  expect(await openStory(page, 'call/groupCallVideos')).toBeNull();

  await page.locator('.group-call-header .btn-icon[aria-label="Enter full screen"]').first().click();
  await expect.poll(() => page.evaluate(() => !!document.fullscreenElement?.classList.contains('group-call'))).toBe(true);
  await expect(page.locator('.popup-group-call')).toBeVisible();
  await expect(page.locator('.group-call')).toHaveClass(/is-full-screen/);

  // the controls step aside until the pointer moves
  await page.mouse.move(300, 300);
  await page.mouse.move(320, 320);
  await page.locator('.group-call-buttons').getByRole('button', {name: 'Settings', exact: true}).click();
  await expect.poll(() => page.evaluate(() => !!document.fullscreenElement?.querySelector('.call-settings-popup'))).toBe(true);
  await expect(page.locator('.call-settings-popup')).toBeVisible();
  expect(await page.evaluate(() => getComputedStyle(document.querySelector('.call-settings-popup .popup-body')).position)).toBe('static');
  expect(await page.evaluate(() => !!document.fullscreenElement?.classList.contains('group-call'))).toBe(true);
});

// The buttons say what they do under them, the way a private call's do (call/button.tsx), and the
// words are their names. Over the video of a wide panel they go without them, as tdesktop's do.
test('the call\'s buttons carry their names under them, and drop the words over the video', async({page}) => {
  await preparePopupSandbox(page, false);
  expect(await openStory(page, 'call/groupCallVideos')).toBeNull();

  const toolbar = page.locator('.group-call-buttons');
  const names = ['Camera', 'Screen', 'Unmute', 'Settings', 'Leave'];
  await expect(toolbar.locator('.call-button-text')).toHaveText(names);
  for(const name of names) {
    const button = toolbar.getByRole('button', {name, exact: true});
    const label = toolbar.locator('.call-button-text', {hasText: new RegExp(`^${name}$`)});
    const [buttonBox, labelBox] = await Promise.all([button.boundingBox(), label.boundingBox()]);
    expect(labelBox.y).toBeGreaterThanOrEqual(buttonBox.y + buttonBox.height);
    expect(Math.abs((labelBox.x + labelBox.width / 2) - (buttonBox.x + buttonBox.width / 2))).toBeLessThan(1);
  }

  await page.locator('.group-call-header .btn-icon[aria-label="Enter full screen"]').first().click();
  await expect(page.locator('.group-call')).toHaveClass(/is-big-layout/);
  await expect(toolbar.locator('.call-button-text').first()).toBeHidden();
  for(const name of names) {
    await expect(toolbar.getByRole('button', {name, exact: true})).toHaveCount(1);
  }
});
