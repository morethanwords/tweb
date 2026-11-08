import {expect} from '@playwright/test';
import {readFileSync} from 'fs';
import {resolve} from 'path';
import {test} from './workerContext';
import {closeStory, openStory, preparePopupSandbox} from './popupSandbox.helpers';
import {TAGGED_AUDIO, TAGGED_AUDIO_PERFORMER} from '../src/tests/fixtures/audio';

const AUDIO_DIR = resolve(__dirname, '..', 'src', 'tests', 'fixtures', 'audio');

/*
 * Every container the client sends as music, tagged the way taggers write them: this browser reads the name, the
 * artist and the cover out of each, and makes the cover the thumbnail the server takes (a JPEG, 320 at most).
 */
test('a track\'s tags are read out of every container it comes in', async({page}) => {
  await preparePopupSandbox(page, false);
  const files = TAGGED_AUDIO.map((audio) => ({...audio, bytes: readFileSync(resolve(AUDIO_DIR, audio.file)).toString('base64')}));
  const read = await page.evaluate(async(files) => {
    const {default: readAudioTags} = await window.e2eImport('/src/helpers/files/readAudioTags.ts');
    const {default: base64ToBytes} = await window.e2eImport('/src/helpers/string/base64ToBytes.ts');
    return Promise.all(files.map(async({file, type, bytes}) => {
      const {title, performer, cover} = await readAudioTags(new File([base64ToBytes(bytes)], file, {type}));
      return {file, title, performer, cover: cover ? {type: cover.blob.type, width: cover.size.width, height: cover.size.height} : null};
    }));
  }, files);

  expect(read).toEqual(TAGGED_AUDIO.map(({file, title, cover}) => ({
    file,
    title,
    performer: TAGGED_AUDIO_PERFORMER,
    cover: cover ? {type: 'image/jpeg', width: 16, height: 16} : null
  })));
});

/*
 * A track is named by its own tags and shows its album cover before it is sent: the server keeps the name,
 * the artist and the cover only as the client sends them, so the popup shows what the message will.
 */
test('a tagged track is named, and shows its cover, before it is sent', async({page}) => {
  await preparePopupSandbox(page, false);
  expect(await openStory(page, 'newMedia/music')).toBeNull();
  const audio = page.locator('.popup.active .audio');
  // * cut short in its middle, as a row's name is
  await expect(audio.locator('.row-title')).toHaveText(/^Sandbox Artist — Sandbo.*….*Row$/);
  await expect(audio).toHaveClass(/audio-with-thumb/);

  // * the name is cut short before the delete button, which shows over the row's end on a hover and always on touch
  const [titleBox, deleteBox] = await Promise.all([
    audio.locator('.row-title').boundingBox(),
    page.locator('.popup.active .popup-item-document-delete').boundingBox()
  ]);
  expect(titleBox.x + titleBox.width).toBeLessThanOrEqual(deleteBox.x);

  // * the cover is decoded and fills the play button it sits under
  const cover = audio.locator('.audio-toggle img.audio-thumb');
  await expect(cover).toBeVisible();
  expect(await cover.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
  const [coverBox, toggleBox] = await Promise.all([cover.boundingBox(), audio.locator('.audio-toggle').boundingBox()]);
  // * to the subpixel WebKit rounds an image in by
  for(const key of ['x', 'y', 'width', 'height'] as const) {
    expect(coverBox[key]).toBeCloseTo(toggleBox[key], 0);
  }
  await closeStory(page, {surface: undefined});
});
