import {expect} from '@playwright/test';
import {test} from './workerContext';

// A photo narrower than the text under it is fitted into a box as wide as the text, its blurred self
// filling the sides, and a photo's box has a frame (its border) around what it shows. The media viewer
// and the peek open from the picture and close back into it by the picture's box, so that box has to be
// what the frame shows: one that ran on under the frame made the picture jump past it as they started
// and as they landed. Where the frame cuts is the browser's to lay out, so it is asked here.

type Box = {top: number, right: number, bottom: number, left: number};

test('a photo fitted into its box stays inside the box\'s frame', async({page}) => {
  await page.goto('/?popups=1');
  await page.waitForFunction(() => !!window.popupSandbox);
  await page.evaluate(() => window.popupSandbox.ready());
  await page.getByRole('button', {name: '◂ Hide', exact: true}).click();

  const {picture, frame} = await page.evaluate(async() => {
    const photoPath = '/src/components/wrappers/photo.ts';
    const {default: wrapPhoto} = await window.e2eImport(photoPath);

    // * as a chat draws a photo with a caption
    const bubble = document.createElement('div');
    bubble.className = 'bubble photo';
    bubble.style.cssText = 'position:absolute;top:20px;left:20px;z-index:2;';
    const attachment = document.createElement('div');
    attachment.className = 'attachment';
    bubble.append(attachment);
    document.body.append(bubble);
    await wrapPhoto({
      // * far taller than wide: fitted by its height, with room left beside it
      photo: {
        _: 'photo',
        pFlags: {},
        id: 1,
        access_hash: 0,
        file_reference: [],
        date: 0,
        dc_id: 2,
        sizes: [{_: 'photoSize', type: 'x', w: 517, h: 800, size: 1000}]
      },
      message: {_: 'message', pFlags: {}, id: 1, mid: 1, date: 0, peer_id: {_: 'peerUser', user_id: 0}, message: 'A caption'},
      container: attachment,
      // * the boxes are laid out before anything is downloaded, and nothing is
      lazyLoadQueue: {push: () => {}}
    });

    const rect = attachment.getBoundingClientRect();
    // * inside the border
    const frame: Box = {
      top: rect.top + attachment.clientTop,
      right: rect.left + attachment.clientLeft + attachment.clientWidth,
      bottom: rect.top + attachment.clientTop + attachment.clientHeight,
      left: rect.left + attachment.clientLeft
    };
    const {top, right, bottom, left} = attachment.querySelector('.media-container-aspecter').getBoundingClientRect();
    bubble.remove();
    return {picture: {top, right, bottom, left} as Box, frame};
  });

  // * fitted: narrower than its box, and as tall as the frame shows
  expect(picture.right - picture.left).toBeLessThan(frame.right - frame.left);
  expect(picture.left).toBeGreaterThanOrEqual(frame.left);
  expect(picture.right).toBeLessThanOrEqual(frame.right);
  expect(picture.top).toBeCloseTo(frame.top, 3);
  expect(picture.bottom).toBeCloseTo(frame.bottom, 3);
});
