import {expect} from '@playwright/test';
import {test} from './workerContext';
import {preparePopupSandbox} from './popupSandbox.helpers';

/*
 * The playback bar of a voice message, a song or a video is an `<input type="range">` whose value is set to the
 * time played, every moment. Whatever that time, the browser takes the value as a valid one: an invalid range is
 * `:invalid`, and Firefox shows its validation message ("Please select a valid value. The two nearest valid values
 * are…") as the bar's tooltip under the pointer. It found every time invalid when the bar's step was 1/60 of a
 * second - a step it cannot check exactly. Only Firefox finds it, so the suite bites in its full run
 * (`test:popups:full`); in the others it holds what they already do.
 */
test('a playback bar takes every time it shows as a valid value', async({page}) => {
  await preparePopupSandbox(page, false);
  const invalid = await page.evaluate(async() => {
    const {default: MediaProgressLine} = await window.e2eImport('/src/components/mediaProgressLine.ts');
    const media = document.createElement('audio');
    // * a duration of no round number, as a real one is
    const duration = 83.946667;
    const line = new MediaProgressLine();
    line.setMedia({media, duration});
    document.body.append(line.container);
    const seek = (line.container as HTMLElement).querySelector<HTMLInputElement>('input[type="range"]');
    const found: string[] = [];
    for(let time = 0; time < duration; time += 0.0371) {
      // * with nothing loaded, the time set is the one the element reports
      media.currentTime = time;
      line.setProgress();
      if(!seek.validity.valid && found.length < 3) {
        found.push(`${seek.value}: ${seek.validationMessage}`);
      }
    }

    line.container.remove();
    return found;
  });

  expect(invalid).toEqual([]);
});
