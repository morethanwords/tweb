import {makeWidgetMedia} from '@/tests/helpers/widgetFixtures';
import {
  forgetWidgetHeights,
  getRememberedWidgetHeight,
  getStoredWidgetHeights,
  getWidgetFixedHeight,
  getWidgetHeightAtLeast,
  getWidgetKey,
  onWidgetHeightRemembered,
  rememberWidgetHeight,
  restoreWidgetHeights,
  WIDGET_MAX_HEIGHT,
  WIDGET_MIN_HEIGHT
} from '@lib/widgetSandbox/sizing';

describe('widget heights known before the widget runs', () => {
  it('keeps the bot\'s height within the bounds of every client', () => {
    expect(getWidgetFixedHeight(0)).toBeUndefined();
    expect(getWidgetFixedHeight(10)).toBe(WIDGET_MIN_HEIGHT);
    expect(getWidgetFixedHeight(320)).toBe(320);
    expect(getWidgetFixedHeight(5000)).toBe(WIDGET_MAX_HEIGHT);
  });

  it('keys a message by its account too', () => {
    expect(getWidgetKey(1, -100, 5)).not.toBe(getWidgetKey(2, -100, 5));
  });

  it('keys a message out of the chat\'s history by its store, whose ids are its own, and keeps its height off the disk', () => {
    const history = getWidgetKey(11, -100, 5), scheduled = getWidgetKey(11, -100, 5, 'scheduled');
    // * a history message's key as it was: the heights on disk go by it
    expect(history).toBe('11_-100_5');
    expect(scheduled).not.toBe(history);
    expect(scheduled).not.toBe(getWidgetKey(11, -100, 5, 'logs'));
    rememberWidgetHeight(history, 200, '904_16');
    rememberWidgetHeight(scheduled, 300, '904_16');
    expect(getRememberedWidgetHeight(history)).toBe(200);
    expect(getRememberedWidgetHeight(scheduled)).toBe(300);
    expect(getStoredWidgetHeights(11)).toEqual([['-100_5', 200, '904_16']]);
  });

  it('counts an auto height by the one remembered at the same layout, else as the lowest a widget is', () => {
    const key = getWidgetKey(1, -100, 1);
    expect(getWidgetHeightAtLeast(makeWidgetMedia(), key, '904_16')).toBe(WIDGET_MIN_HEIGHT);
    rememberWidgetHeight(key, 280, '904_16');
    expect(getWidgetHeightAtLeast(makeWidgetMedia(), key, '904_16')).toBe(280);
    // * at another width or text size the content wraps otherwise: no more than the lowest is known
    expect(getWidgetHeightAtLeast(makeWidgetMedia(), key, '600_16')).toBe(WIDGET_MIN_HEIGHT);
    expect(getWidgetHeightAtLeast(makeWidgetMedia(), key, '904_20')).toBe(WIDGET_MIN_HEIGHT);
    // * a placeholder takes it at any layout
    expect(getRememberedWidgetHeight(key)).toBe(280);
    // * the bot's height wins over the content's
    expect(getWidgetHeightAtLeast(makeWidgetMedia({height: 120}), key, '904_16')).toBe(120);
  });

  it('tells its listeners of every height remembered, until they stop listening', () => {
    const listener = vi.fn();
    const stop = onWidgetHeightRemembered(listener);
    rememberWidgetHeight(getWidgetKey(1, -100, 2), 100, '904_16');
    expect(listener).toHaveBeenCalledTimes(1);
    stop();
    rememberWidgetHeight(getWidgetKey(1, -100, 2), 120, '904_16');
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('keeps an account\'s heights on disk as it remembers them, the page\'s own winning over the disk\'s', () => {
    rememberWidgetHeight(getWidgetKey(7, -200, 5), 310, '904_16');
    restoreWidgetHeights(7, [['-200_5', 150, '904_16'], ['-200_6', 90, '904_16']]);
    // * the page remembered -200_5 meanwhile: it is newer than the disk
    expect(getRememberedWidgetHeight(getWidgetKey(7, -200, 5))).toBe(310);
    expect(getRememberedWidgetHeight(getWidgetKey(7, -200, 6), '904_16')).toBe(90);
    // * what goes back to the disk is the account's own, without its number, the newest last
    expect(getStoredWidgetHeights(7)).toEqual([['-200_6', 90, '904_16'], ['-200_5', 310, '904_16']]);
    expect(getStoredWidgetHeights(8)).toEqual([]);
  });

  it('forgets the heights of the messages that go', () => {
    rememberWidgetHeight(getWidgetKey(9, -300, 1), 100, '904_16');
    rememberWidgetHeight(getWidgetKey(9, -300, 2), 120, '904_16');
    const listener = vi.fn();
    const stop = onWidgetHeightRemembered(listener);
    forgetWidgetHeights((key) => key === getWidgetKey(9, -300, 1));
    // * its listeners hear of it (the disk's copy is written again), and of nothing when nothing went
    expect(listener).toHaveBeenCalledWith(getWidgetKey(9, -300, 1));
    forgetWidgetHeights((key) => key === getWidgetKey(9, -300, 1));
    expect(listener).toHaveBeenCalledTimes(1);
    stop();
    expect(getStoredWidgetHeights(9)).toEqual([['-300_2', 120, '904_16']]);
  });
});
