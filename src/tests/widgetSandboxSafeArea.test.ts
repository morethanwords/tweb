import {describe, expect, it} from 'vitest';
import {measureContentSafeArea, NO_CONTENT_SAFE_AREA} from '@lib/widgetSandbox/safeArea';

/** An element laid out at [left, top, width, height] from its offset parent's padding edge (jsdom lays nothing out). */
function laidOut(offsetParent: Element | null, [left, top, width, height]: number[], parent: Element = document.body) {
  const element = document.createElement('div');
  parent.append(element);
  for(const [name, value] of Object.entries({offsetParent, offsetLeft: left, offsetTop: top, offsetWidth: width, offsetHeight: height, clientLeft: 0, clientTop: 0})) {
    Object.defineProperty(element, name, {value});
  }

  return element;
}

describe('the content safe area (widget-sandbox docs/sdk-v1.md §2.17)', () => {
  // the bubble's content, a 480 × 280 widget in it, a time of 40 × 18 standing 3 px from its bottom edge and its side
  const bubble = () => laidOut(null, [0, 0, 480, 280]);
  const setup = (block: number[], time: number[]) => {
    const content = bubble();
    return [laidOut(content, block, content), laidOut(content, time, content)] as const;
  };

  it('is the band and the corner the time takes over the widget, with its margins, on the interface\'s side', () => {
    expect(measureContentSafeArea(...setup([0, 0, 480, 280], [437, 259, 40, 18]), false)).toEqual({...NO_CONTENT_SAFE_AREA, bottom: 24, cornerRight: 46});
    // right to left the time is in the left corner, and so is the corner the widget is told of
    expect(measureContentSafeArea(...setup([0, 0, 480, 280], [3, 259, 40, 18]), true)).toEqual({...NO_CONTENT_SAFE_AREA, bottom: 24, cornerLeft: 46});
  });

  it('takes its margin from the side, whatever the time stands on: a block with no height yet, a footer it is lifted over', () => {
    // before the widget has drawn
    expect(measureContentSafeArea(...setup([0, 0, 480, 0], [437, -21, 40, 18]), false)).toEqual({...NO_CONTENT_SAFE_AREA, bottom: 24, cornerRight: 46});
    // a channel post's comments footer lifts the time over itself; the staged copy of the bubble has no footer
    expect(measureContentSafeArea(...setup([0, 0, 480, 280], [437, 209, 40, 18]), false)).toEqual({...NO_CONTENT_SAFE_AREA, bottom: 24, cornerRight: 46});
  });

  it('reads the layout, not the screen: a block in an attachment of its own, moved or scaled by a transform or not', () => {
    const content = bubble();
    const attachment = laidOut(content, [0, 40, 480, 240], content);
    const block = laidOut(attachment, [0, 0, 480, 240], attachment);
    // the edit transition's translate and the chat's opening scale move the rects; the offsets stay
    block.getBoundingClientRect = () => ({left: 0, top: -500, right: 240, bottom: -380, width: 240, height: 120} as DOMRect);
    expect(measureContentSafeArea(block, laidOut(content, [437, 259, 40, 18], content), false)).toEqual({...NO_CONTENT_SAFE_AREA, bottom: 24, cornerRight: 46});
  });

  it('is none for a time that is not on the widget\'s bottom edge, or not there', () => {
    // a caption's line below the widget
    expect(measureContentSafeArea(...setup([0, 0, 480, 280], [437, 290, 40, 18]), false)).toEqual(NO_CONTENT_SAFE_AREA);
    const [block] = setup([0, 0, 480, 280], [437, 259, 40, 18]);
    expect(measureContentSafeArea(block, undefined, false)).toEqual(NO_CONTENT_SAFE_AREA);
    expect(measureContentSafeArea(block, document.createElement('div'), false)).toEqual(NO_CONTENT_SAFE_AREA);
    // laid out against something the block is not in
    expect(measureContentSafeArea(block, laidOut(bubble(), [437, 259, 40, 18]), false)).toEqual(NO_CONTENT_SAFE_AREA);
  });

  it('stays within what the framework takes', () => {
    // a corner past 200 px would count as none: it is the most there is
    expect(measureContentSafeArea(...setup([0, 0, 480, 280], [267, 259, 210, 18]), false)).toEqual({...NO_CONTENT_SAFE_AREA, bottom: 24, cornerRight: 200});
  });
});
