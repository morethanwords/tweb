import {getStar3DFieldWidth, getStar3DLook, getStar3DMotion} from '@components/star3D/policy';
import {resolveOptions} from '@vendor/telegram-3d-star/src/options';
import {computeFinalBackgroundColor} from '@components/messageSpoilerOverlay/utils';

describe('Star3D', () => {
  test('the animation level decides what the star does, never the OS preference by itself', () => {
    expect(getStar3DMotion(0)).toBeUndefined();
    expect(getStar3DMotion(1)).toEqual({autoplay: false, interactive: false, reducedMotion: false});
    expect(getStar3DMotion(2)).toEqual({autoplay: true, interactive: true, reducedMotion: false});
  });

  test('the field is as wide as its clip, and never reaches past either edge of it', () => {
    expect(getStar3DFieldWidth(420, 0)).toBe(420);
    expect(getStar3DFieldWidth(420, 3)).toBe(414);
    expect(getStar3DFieldWidth(420, -3)).toBe(414);
    expect(getStar3DFieldWidth(420, 0.5)).toBe(419);
    expect(getStar3DFieldWidth(100, 80)).toBe(0);
  });

  test('the package takes the particles\' canvas and tweb\'s reduced motion', () => {
    const canvas = document.createElement('canvas');
    expect(resolveOptions({particles: canvas, reducedMotion: false})).toMatchObject({particles: canvas, reducedMotion: false});
    expect(resolveOptions({})).toMatchObject({particles: null, reducedMotion: undefined});
  });

  test('the look follows the luminance of what is painted behind it', () => {
    expect(getStar3DLook('rgb(255, 255, 255)', true)).toEqual({theme: 'light', background: '#ffffff'});
    expect(getStar3DLook('rgb(33, 33, 33)', false)).toEqual({theme: 'dark', background: '#212121'});
    expect(getStar3DLook('rgb(24, 37, 51)', false)).toEqual({theme: 'dark', background: '#182533'});
  });

  test('with no opaque colour behind it, the theme\'s page colour', () => {
    expect(getStar3DLook(undefined, true)).toEqual({theme: 'dark', background: '#212121'});
    expect(getStar3DLook(undefined, false)).toEqual({theme: 'light', background: '#ffffff'});
  });

  test('the painted colour is found however deep the star is, through transparent boxes', () => {
    const painted = document.createElement('div');
    painted.style.backgroundColor = 'rgb(24, 37, 51)';
    let element = painted;
    for(let i = 0; i < 15; ++i) {
      const child = document.createElement('div');
      if(i === 3) child.style.backgroundColor = 'transparent';
      element.append(child);
      element = child;
    }

    document.body.append(painted);
    try {
      expect(computeFinalBackgroundColor(element, Infinity)).toBe('rgb(24, 37, 51)');
      // * the spoilers' own walk keeps its limit
      expect(computeFinalBackgroundColor(element)).toBeUndefined();
    } finally {
      painted.remove();
    }
  });
});
