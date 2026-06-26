import {test, expect, type Page} from '@playwright/test';
import {PNG} from 'pngjs';

// Verifies the thumb -> sticker handover never flashes a blank cell (the "blink").
//
// It drives the REAL appearance controller (window.createStickerAppearance, the same one
// wrapSticker uses) against a local .tgs: a solid BLUE thumb under the live lottie canvas, over a
// MAGENTA container. Animations are forced OFF - the case that was blinking. A CDP screencast
// captures frames, so a transient blank (all-magenta) between the thumb and the sticker is caught
// objectively. The blink is FLAKY (it depends on whether the thumb-retire and the canvas commit
// land in the same compositor frame), so each sticker's handover is repeated and we fail if ANY
// repetition blinks.
//
//   B = thumb on screen (blue)     M = blank (magenta only)     S = sticker pixels on screen

test.use({viewport: {width: 480, height: 480}});

const CUBIGATOR = 'Cubigator2.json';   // the most reliable reproducer - hammered hardest
const REPS = 14;                        // repetitions per sticker (the blink is intermittent)
// real thumb-path stickers. NB: large_lastseen/large_readtime are intentionally excluded - they are
// asset UI animations (loadAnimationAsAsset, in toggleReadDate), never wrapped with a thumb, so
// driving them through stickerAppearance tests a scenario that can't occur. The render spec still
// covers that they render.
const OTHERS = ['UtyanBirthday.json', 'Cake.json', 'jolly_roger.json', 'key.json'];

type FrameClass = {t: number, magenta: number, blue: number, other: number};

function classify(buf: Buffer): Omit<FrameClass, 't'> {
  const {data, width, height} = PNG.sync.read(buf);
  const total = width * height;
  let magenta = 0, blue = 0, other = 0;
  for(let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    if(Math.abs(r - 255) + g + Math.abs(b - 255) < 70) magenta++;
    else if(r + g + Math.abs(b - 255) < 70) blue++;
    else other++;
  }
  return {magenta: magenta / total, blue: blue / total, other: other / total};
}

// one thumb->sticker handover; returns whether a blank flash was captured + a compact timeline
async function runHandover(page: Page, url: string): Promise<{blinked: boolean, timeline: string}> {
  const client = await page.context().newCDPSession(page);
  const frames: FrameClass[] = [];
  client.on('Page.screencastFrame', async(e: any) => {
    frames.push({t: e.metadata.timestamp, ...classify(Buffer.from(e.data, 'base64'))});
    await client.send('Page.screencastFrameAck', {sessionId: e.sessionId}).catch(() => {});
  });
  await client.send('Page.startScreencast', {format: 'png', everyNthFrame: 1});

  await page.evaluate(async(url) => {
    const w = window as any;
    const [, setAppSettings] = w.useAppSettings();
    setAppSettings('liteMode', {all: false, animations: true}); // animations OFF - the blinking path

    const container = document.createElement('div');
    container.id = 'blink-cell';
    container.style.cssText = 'position:fixed;inset:0;background:rgb(255,0,255);z-index:2147483647;';
    document.body.append(container);

    const appearance = w.createStickerAppearance({container, thumbKey: 'blink-' + Math.random()});
    const c = document.createElement('canvas');
    c.width = c.height = 8;
    const cx = c.getContext('2d')!;
    cx.fillStyle = 'rgb(0,0,255)';
    cx.fillRect(0, 0, 8, 8);
    const thumb = new Image();
    thumb.src = c.toDataURL();
    await thumb.decode();
    await new Promise<void>((resolve) => appearance.upgradeToImage(thumb, resolve));

    await new Promise((r) => setTimeout(r, 150)); // let the thumb get captured

    const player = await w.lottieLoader.loadAnimationFromURL(
      {container, width: 480, height: 480, group: 'none', loop: true, autoplay: true, name: url + '#' + Math.random()},
      url
    );
    w.__lastPlayer = player;
    const fire = () => appearance.onMediaFirstFrame({animation: player, canvas: player.canvas[0], needFadeIn: false});
    if(player.hasRenderedFirstFrame) fire();
    else player.addEventListener('firstFrame', fire);
  }, url);

  await page.waitForTimeout(1300); // record the whole handover
  await client.send('Page.stopScreencast').catch(() => {});
  await page.evaluate(() => {
    (window as any).__lastPlayer?.remove?.();
    document.getElementById('blink-cell')?.remove();
  });
  await client.detach().catch(() => {});

  // blink = an all-magenta frame after the thumb (blue) appears and before the sticker (other) does
  const firstThumb = frames.findIndex((f) => f.blue > 0.5);
  let blinked = false;
  if(firstThumb >= 0) {
    for(let i = firstThumb + 1; i < frames.length; ++i) {
      if(frames[i].other > 0.05) break;
      if(frames[i].magenta > 0.85 && frames[i].blue < 0.1) { blinked = true; break; }
    }
  }

  const t0 = frames[0]?.t ?? 0;
  const letter = (f: FrameClass) => f.other > 0.05 ? 'S' : (f.blue > 0.5 ? 'B' : (f.magenta > 0.85 ? 'M' : '?'));
  const rle: string[] = [];
  for(const f of frames) {
    const l = `${letter(f)}@${((f.t - t0) * 1000).toFixed(0)}ms`;
    if(!rle.length || rle[rle.length - 1][0] !== l[0]) rle.push(l);
  }
  return {blinked, timeline: rle.join(' ')};
}

test.beforeEach(async({page}) => {
  await page.goto('/');
  await page.waitForFunction(
    () => typeof (window as any).createStickerAppearance === 'function' &&
      typeof (window as any).lottieLoader?.loadAnimationFromURL === 'function' &&
      typeof (window as any).useAppSettings === 'function',
    null,
    {timeout: 30_000}
  );
});

test(`no blank flash, ${REPS}× handovers: ${CUBIGATOR}`, async({page}) => {
  const blinks: string[] = [];
  for(let i = 0; i < REPS; ++i) {
    const r = await runHandover(page, '/assets/tgs/' + CUBIGATOR);
    if(r.blinked) blinks.push(r.timeline);
  }
  console.log(`[no-blink] ${CUBIGATOR}: ${blinks.length}/${REPS} blinked`);
  blinks.slice(0, 3).forEach((t) => console.log(`  ${t}`));
  expect(blinks.length, `${CUBIGATOR} blinked ${blinks.length}/${REPS} times`).toBe(0);
});

for(const file of OTHERS) {
  test(`no blank flash, ${REPS}× handovers: ${file}`, async({page}) => {
    const blinks: string[] = [];
    for(let i = 0; i < REPS; ++i) {
      const r = await runHandover(page, '/assets/tgs/' + file);
      if(r.blinked) blinks.push(r.timeline);
    }
    console.log(`[no-blink] ${file}: ${blinks.length}/${REPS} blinked`);
    blinks.slice(0, 3).forEach((t) => console.log(`  ${t}`));
    expect(blinks.length, `${file} blinked ${blinks.length}/${REPS} times`).toBe(0);
  });
}
