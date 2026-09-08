import {describe, expect, it} from 'vitest';
import {inspectorPosition, type ViewportBounds} from './inspector-position';

const viewport = {left: 0, top: 0, width: 1280, height: 900};
describe('inspector placement', () => {
  it('opens below the button when the complete dialog fits', () => {
    expect(inspectorPosition(viewport, {left: 420, right: 620, top: 100, bottom: 144}, 420, false))
      .toMatchObject({left: 420, top: 154, width: 336, height: 420, placement: 'below'});
  });
  it('flips above a bottom button instead of covering it', () => {
    expect(inspectorPosition(viewport, {left: 420, right: 620, top: 800, bottom: 844}, 420, false))
      .toMatchObject({left: 420, top: 370, placement: 'above'});
  });
  it('shifts a right-edge anchor and respects a panned visual viewport', () => {
    expect(inspectorPosition({left: 120, top: 70, width: 600, height: 500}, {left: 680, right: 712, top: 100, bottom: 144}, 300, false))
      .toMatchObject({left: 368, top: 154, width: 336, maxHeight: 468, placement: 'below'});
  });
  it('caps oversized content to the visible viewport with a scrollable body', () => {
    expect(inspectorPosition({left: 0, top: 0, width: 900, height: 480}, {left: 400, right: 650, top: 220, bottom: 260}, 820, false))
      .toMatchObject({top: 16, height: 448, maxHeight: 448, placement: 'clamped'});
  });
  it('centers the fallback when a stale anchor is absent or scrolled entirely away', () => {
    expect(inspectorPosition(viewport, null, 420, false)).toMatchObject({left: 472, top: 240, placement: 'clamped'});
    expect(inspectorPosition(viewport, {left: 420, right: 620, top: -300, bottom: -200}, 420, false))
      .toMatchObject({left: 420, top: 240, placement: 'clamped'});
  });
  it('anchors mobile sheets to the visible bottom above the keyboard, including viewport offsets', () => {
    expect(inspectorPosition({left: 20, top: 110, width: 375, height: 290}, null, 600, true))
      .toEqual({left: 20, top: 118, width: 375, height: 282, maxHeight: 282, placement: 'bottom-sheet'});
    expect(inspectorPosition({left: 0, top: 0, width: 375, height: 812}, null, 400, true))
      .toMatchObject({top: 412, height: 400, maxHeight: 804});
  });
  it('always contains the dialog in short or narrow visual viewports', () => {
    for(const mobile of [true, false]) for(const width of [120, 375, 900, 1280]) for(const height of [80, 200, 480, 900]) {
      const visible: ViewportBounds = {left: 30, top: 50, width, height};
      for(const anchor of [null, {left: -200, right: -100, top: -200, bottom: -100}, {left: width + 30, right: width + 100, top: height + 50, bottom: height + 100}]) {
        const result = inspectorPosition(visible, anchor, 1500, mobile);
        expect(result.left).toBeGreaterThanOrEqual(visible.left);
        expect(result.top).toBeGreaterThanOrEqual(visible.top);
        expect(result.left + result.width).toBeLessThanOrEqual(visible.left + width);
        expect(result.top + result.height).toBeLessThanOrEqual(visible.top + height);
      }
    }
  });
});
