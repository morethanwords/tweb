import {splitWidgetEmoji} from '@lib/widgetSandbox/emoji';

// A widget's text with the client's emoji (RendererEnv.emoji): split into its parts, as many as the renderer takes.
describe('a widget\'s emoji', () => {
  it('splits a text into its plain parts and the emoji the client draws', () => {
    const runs = splitWidgetEmoji('a😀b');
    expect(runs).toHaveLength(3);
    expect(runs[0]).toBe('a');
    expect(runs[1]).toMatchObject({emoji: '😀'});
    expect(runs[2]).toBe('b');
    expect(splitWidgetEmoji('plain text')).toBeUndefined();
  });

  it('stops looking once the text has more emoji than the renderer takes', () => {
    expect(splitWidgetEmoji('😀'.repeat(4), 4)).toHaveLength(4);
    expect(splitWidgetEmoji('😀'.repeat(5), 4)).toBeUndefined();
    expect(splitWidgetEmoji('©'.repeat(32768), 1024)).toBeUndefined();
  });
});
