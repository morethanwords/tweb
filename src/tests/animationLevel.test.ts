import {afterEach, describe, expect, test, vi} from 'vitest';
import Modes from '@config/modes';
import TransitionSlider from '@components/transition';
import liteMode from '@helpers/liteMode';
import reducedKeyframes, {keyframesAtLevel} from '@helpers/reducedKeyframes';

// * the settings liteMode reads, and the OS reduce-motion preference
const settings = vi.hoisted(() => ({liteMode: {} as Record<string, boolean>}));
const prefersReducedMotion = vi.hoisted(() => ({matches: false}));
vi.mock('@stores/appSettings', () => ({useAppSettings: () => [settings]}));
vi.mock('@stores/reducedMotion', () => ({default: () => () => prefersReducedMotion.matches}));

afterEach(() => {
  settings.liteMode = {};
  prefersReducedMotion.matches = false;
  Modes.a11y = false;
  document.body.replaceChildren();
});

describe('animation level', () => {
  test('comes from Interface Animations and Motion Effects', () => {
    expect(liteMode.getAnimationLevel()).toBe(2);

    settings.liteMode = {motion: true};
    expect(liteMode.getAnimationLevel()).toBe(1);
    expect(liteMode.isAvailable('animations')).toBe(true);
    expect(liteMode.isAvailable('motion')).toBe(false);

    // * motion is a part of the interface animations: off with them, whatever its own switch says
    settings.liteMode = {animations: true};
    expect(liteMode.getAnimationLevel()).toBe(0);
    expect(liteMode.isAvailable('motion')).toBe(false);

    settings.liteMode = {all: true};
    expect(liteMode.getAnimationLevel()).toBe(0);
  });

  test('the OS reduce-motion preference keeps the fades under the a11y layer', () => {
    prefersReducedMotion.matches = true;
    expect(liteMode.getAnimationLevel()).toBe(2);

    Modes.a11y = true;
    expect(liteMode.getAnimationLevel()).toBe(1);

    settings.liteMode = {animations: true};
    expect(liteMode.getAnimationLevel()).toBe(0);
  });
});

describe('reducedKeyframes', () => {
  test('keeps what fades and grows and leaves out what moves', () => {
    expect(reducedKeyframes([
      {height: '0px', opacity: 0, transform: 'scale(.95)', transformOrigin: 'center'},
      {height: '10px', opacity: 1, offset: .3, easing: 'ease-in', left: '4px'},
      {transform: 'none'}
    ])).toEqual([
      {height: '0px', opacity: 0},
      {height: '10px', opacity: 1, offset: .3, easing: 'ease-in'},
      {}
    ]);
  });

  test('is nothing for keyframes that only move', () => {
    expect(reducedKeyframes([{transform: 'translateX(100%)', offset: 0}, {translate: '0'}])).toBeUndefined();
  });

  // * as the SCSS mixin has it: a padding or a font size carries the text along
  test('counts a padding and a font size as movement', () => {
    expect(reducedKeyframes([
      {paddingTop: '0px', fontSize: '12px', insetInlineStart: '0px', width: '0px', marginTop: '0px'},
      {paddingTop: '8px', fontSize: '16px', insetInlineStart: '4px', width: '10px', marginTop: '2px'}
    ])).toEqual([{width: '0px', marginTop: '0px'}, {width: '10px', marginTop: '2px'}]);
  });

  test('plays all of the keyframes at full animations, what does not move at reduced, none when off', () => {
    const keyframes: Keyframe[] = [{opacity: 0, transform: 'scale(.8)'}, {opacity: 1, transform: 'none'}];
    expect(keyframesAtLevel(keyframes, 2)).toBe(keyframes);
    expect(keyframesAtLevel(keyframes, 1)).toEqual([{opacity: 0}, {opacity: 1}]);
    expect(keyframesAtLevel(keyframes, 0)).toBeUndefined();
  });
});

describe('TransitionSlider', () => {
  const create = () => {
    const content = document.createElement('div');
    content.append(document.createElement('div'), document.createElement('div'));
    document.body.append(content);
    const onTransitionEnd = vi.fn();
    const selectTab = TransitionSlider({content, type: 'tabs', transitionTime: 200, onTransitionEnd, isHeavy: false});
    selectTab(0);
    onTransitionEnd.mockClear();
    // * the switch is done when the incoming screen's own transition or animation ends
    return {content, selectTab, onTransitionEnd, to: content.children[1] as HTMLElement};
  };

  const end = (element: HTMLElement, type: 'transitionend' | 'animationend') => {
    element.dispatchEvent(new Event(type, {bubbles: true}));
  };

  test('slides at full animations and is done when the slide ends', () => {
    const {content, selectTab, onTransitionEnd, to} = create();
    selectTab(1);
    expect(content.classList.contains('animating')).toBe(true);
    expect(content.classList.contains('animating-fade')).toBe(false);

    end(to, 'animationend');
    expect(onTransitionEnd).not.toHaveBeenCalled();

    end(to, 'transitionend');
    expect(onTransitionEnd).toHaveBeenCalledWith(1);
    expect(content.classList.contains('animating')).toBe(false);
  });

  test('crossfades at reduced animations and is done when the fade ends', () => {
    settings.liteMode = {motion: true};
    const {content, selectTab, onTransitionEnd, to} = create();
    selectTab(1);
    expect(content.classList.contains('animating-fade')).toBe(true);
    expect(to.style.transform).toBe('');

    // * nothing slides, so a transition ending inside is not the switch's own
    end(to, 'transitionend');
    expect(onTransitionEnd).not.toHaveBeenCalled();

    end(to, 'animationend');
    expect(onTransitionEnd).toHaveBeenCalledWith(1);
    expect(content.classList.contains('animating')).toBe(false);
    expect(content.classList.contains('animating-fade')).toBe(false);
  });

  test('a screen that is a slider of its own still ends the crossfade', () => {
    settings.liteMode = {motion: true};
    const {selectTab, onTransitionEnd, to} = create();
    // * the settings tab: its screens fade by keyframes, so it listens for animationend too
    to.append(document.createElement('div'), document.createElement('div'));
    TransitionSlider({content: to, type: 'zoom-fade', transitionTime: 150, isHeavy: false})(0);

    selectTab(1);
    end(to, 'animationend');
    expect(onTransitionEnd).toHaveBeenCalledWith(1);
  });

  test('switches at once with animations off', () => {
    settings.liteMode = {animations: true};
    const {content, selectTab, onTransitionEnd} = create();
    selectTab(1);
    expect(content.classList.contains('animating')).toBe(false);
    expect(onTransitionEnd).toHaveBeenCalledWith(1);
  });
});
