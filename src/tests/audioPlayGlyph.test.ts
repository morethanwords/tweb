/**
 * The play button's glyph is a statement about the media, not about the click: whatever moved the
 * track — this button, the topbar plate, another row playing it, the playlist advancing, the OS
 * media keys — the button morphs to match. The click's only job is to ask the media to change.
 *
 * Two halves are pinned here: that `createPlayPauseIcon` morphs on a change and holds still
 * otherwise, and that the row drives it from the media's own events rather than from its click
 * handler.
 */

import {readFile} from 'fs/promises';
import {createPlayPauseIcon, readGlyphAnimations} from '@components/audioAnimatedIcon';
import createElementFromMarkup from '@helpers/createElementFromMarkup';
import playpauseMarkup from '@/assets/audioIcons/playpause.svg?raw';

const SOURCE_PATH = 'src/components/audio.tsx';

describe('play/pause glyph', () => {
  let container: HTMLElement;
  let setPlayIcon: ReturnType<typeof createPlayPauseIcon>;

  const glyph = () => container.firstElementChild as SVGSVGElement;
  const label = () => glyph()?.getAttribute('aria-label');
  // the markup ships frozen on its first frame; a glyph that is meant to move is mounted with its
  // animations already begun (see createAudioAnimatedIcon)
  const isMoving = () => Array.from(glyph().querySelectorAll('animate, animateTransform'))
  .every((animation) => animation.getAttribute('begin') === '0s');

  beforeEach(() => {
    container = document.createElement('div');
    setPlayIcon = createPlayPauseIcon(() => container);
  });

  test('a row built mid-playback takes the state without performing it', () => {
    setPlayIcon(true, false);

    expect(label()).toBe('Pause to play'); // rests on the pause glyph it is named after
    expect(isMoving()).toBe(false);
  });

  test('every later change of the media morphs, in the direction it moved', () => {
    setPlayIcon(false, false);

    setPlayIcon(true);
    expect(label()).toBe('Play to pause');
    expect(isMoving()).toBe(true);

    setPlayIcon(false);
    expect(label()).toBe('Pause to play');
    expect(isMoving()).toBe(true);
  });

  test('a repeated state leaves the glyph alone', () => {
    setPlayIcon(true, false);
    const mounted = glyph();

    setPlayIcon(true);

    expect(glyph()).toBe(mounted);
  });
});

describe('the row drives the glyph from the media', () => {
  let source: string;

  beforeAll(async() => {
    source = await readFile(SOURCE_PATH, 'utf-8');
  });

  // `emptied` is in the list because the controller can drop the media out from under the row
  // (track swapped, list cleaned) without ever pausing it
  test.each(['play', 'pause', 'ended', 'emptied'])('%s re-reads the media and syncs', (event) => {
    expect(source).toMatch(new RegExp(`addAudioListener\\('${event}'[\\s\\S]{0,200}?syncPlayState\\(\\)`));
  });

  test('the click only asks the media to change — it never sets the glyph itself', () => {
    const clickHandler = source.match(/toggle\.addEventListener\('click'[\s\S]*?\n {4}\}\);/)?.[0];
    expect(clickHandler).toBeDefined();
    expect(clickHandler).toContain('el.togglePlay(e)');
    expect(clickHandler).not.toContain('syncPlayState');
    expect(clickHandler).not.toContain('setPlayIcon');
  });

  test('the glyph is set in one place, so no path can change the media and skip it', () => {
    expect(source.match(/setPlayIcon\(/g)).toHaveLength(1); // the one call, inside the sync
    expect(source).toContain('const syncPlayState = (animate?: boolean) => {');
  });
});

/**
 * Chrome stopped rendering SMIL, so the glyph's own declarations are replayed through the Web
 * Animations API. The conversion is the joint between the assets and the code: it has to keep
 * meaning what the SVG says, including the parts SMIL expresses differently from CSS.
 */
describe('SMIL declarations read as keyframes', () => {
  let animations: ReturnType<typeof readGlyphAnimations>;

  beforeAll(() => {
    animations = readGlyphAnimations(createElementFromMarkup(playpauseMarkup));
  });

  test('every animated element gets one set of keyframes on the asset clock', () => {
    // the rotating group, and a path for each half of the glyph
    expect(animations).toHaveLength(3);
    animations.forEach(({keyframes, duration}) => {
      expect(duration).toBeCloseTo(233.333, 2);
      expect(keyframes.map((keyframe) => keyframe.offset)).toEqual([0, 0.857143, 1]);
    });
  });

  test('the two transforms on one element compose the way SMIL stacks them', () => {
    const group = animations.find(({target}) => target.tagName === 'g');
    // `translate` replaces the base transform, the additive `rotate` stacks onto it
    expect(group.keyframes[0].transform).toBe('translate(120px, 120px) rotate(270deg)');
    expect(group.keyframes[2].transform).toBe('translate(120px, 120px) rotate(360deg)');
  });

  test('a path morph becomes the CSS d property', () => {
    const path = animations.find(({target}) => target.tagName === 'path');
    expect(path.keyframes[0].d).toMatch(/^path\("M0 -40 /);
    expect(path.keyframes[2].d).not.toBe(path.keyframes[0].d);
  });

  test('each spline eases the segment it opens', () => {
    const [{keyframes}] = animations;
    expect(keyframes[0].easing).toBe('cubic-bezier(0.6, 0, 0.4, 1)');
    expect(keyframes[1].easing).toBe('cubic-bezier(0, 0, 1, 1)');
    expect(keyframes[2].easing).toBeUndefined(); // nothing starts at the last frame
  });
});

/**
 * The conversion above is pinned against one glyph in detail; this is the sweep that says the other
 * three are authored the same way, so an asset redrawn into a shape the reader cannot express does
 * not quietly stop animating.
 */
describe('every glyph converts', () => {
  test.each(['playpause', 'pauseplay', 'forward', 'rewind'] as const)('%s', async(name) => {
    const markup: string = (await import(`../assets/audioIcons/${name}.svg?raw`)).default;
    const animations = readGlyphAnimations(createElementFromMarkup(markup));

    expect(animations.length).toBeGreaterThan(0);
    animations.forEach(({keyframes, duration}) => {
      expect(duration).toBeGreaterThan(0);
      expect(keyframes.length).toBeGreaterThan(1);
      // a keyframe that carries neither property would animate nothing at all
      keyframes.forEach((keyframe) => expect(keyframe.transform || keyframe.d).toBeTruthy());
    });
  });
});
