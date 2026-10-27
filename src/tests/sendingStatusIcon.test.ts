import SendingStatusIcon, {getSendingStatusIconDrawing, getSendingStatusIconState, setSendingStatusIconState} from '@components/sendingStatusIcon';
import {getIconContent} from '@components/icon';

// numbers as path data writes them, `.65` and `-1.3` included
const numbers = (d: string) => d.match(/-?(\d+\.?\d*|\.\d+)/g).map(Number);

function expectPath(d: string, expected: number[]) {
  const got = numbers(d);
  expect(got).toHaveLength(expected.length);
  got.forEach((n, i) => expect(n).toBeCloseTo(expected[i], 2));
}

describe('SendingStatusIcon', () => {
  // a still icon has to be the tgico glyph's own drawing (assets/icons/sending.svg, 1check.svg,
  // 2checks.svg, sendingerror_filled.svg) - it is drawn in the glyph's box instead of the glyph
  test('still states draw the glyphs point for point', () => {
    const sending = getSendingStatusIconDrawing('sending');
    expect(sending.clock.ring).toEqual({cx: 10, cy: 7, r: 6});
    expectPath(sending.clock.minute, [10, 7, 3.5]);
    expectPath(sending.clock.hour, [10, 7, 12, 9]);
    expect(sending.first ?? sending.second ?? sending.disk).toBeUndefined();

    const sent = getSendingStatusIconDrawing('sent');
    expect(sent.clock ?? sent.second ?? sent.disk).toBeUndefined();
    expectPath(sent.first, [5, 8, 8, 11, 15, 3]);

    const read = getSendingStatusIconDrawing('read');
    expect(read.clock ?? read.disk).toBeUndefined();
    expectPath(read.first, [2, 8, 5, 11, 12, 3]);
    expectPath(read.second, [9, 10, 10, 11, 17, 3]);

    const error = getSendingStatusIconDrawing('error');
    expect(error.clock ?? error.first ?? error.second).toBeUndefined();
    // the disk r 6.6 at (10,7), the bar (10,3.5)…(10,7.5) 1.3 wide and the dot r .75 at (10,10) cut out
    expectPath(error.disk, [
      3.4, 7, 6.6, 6.6, 0, 1, 0, 13.2, 0, 6.6, 6.6, 0, 1, 0, -13.2, 0,
      9.35, 3.5, .65, .65, 0, 0, 1, 1.3, 0, 7.5, .65, .65, 0, 0, 1, -1.3, 0,
      9.25, 10, .75, .75, 0, 1, 0, 1.5, 0, .75, .75, 0, 1, 0, -1.5, 0
    ]);
  });

  // at rest the icon costs what the glyph did: the span and its text, the drawing is a ::before
  test('a still icon is the glyph span alone, and a new state changes it in place', () => {
    const host = SendingStatusIcon('sending', 'time-sending-status');
    expect(host.classList.contains('time-sending-status')).toBe(true);
    expect(host.getAttribute('aria-hidden')).toBe('true');
    expect(Array.from(host.childNodes).map((node) => node.nodeType)).toEqual([Node.TEXT_NODE]);
    expect(host.textContent).toBe(getIconContent('sending'));

    expect(setSendingStatusIconState(host, 'read', false)).toBe(true);
    expect(getSendingStatusIconState(host)).toBe('read');
    expect(Array.from(host.childNodes).map((node) => node.nodeType)).toEqual([Node.TEXT_NODE]);
    expect(host.textContent).toBe(getIconContent('checks'));
  });

  // the still icons' images come from one stylesheet, made once
  test('the still images are built once', () => {
    SendingStatusIcon('sent');
    SendingStatusIcon('error');
    const sheets = Array.from(document.head.querySelectorAll('style')).filter((style) => style.textContent.includes('sending-status-is-'));
    expect(sheets).toHaveLength(1);
    for(const state of ['sending', 'sent', 'read', 'error']) {
      expect(sheets[0].textContent).toContain(`.sending-status-is-${state}::before`);
    }

    // the clock's minute hand is a layer of its own, and both layers turn
    expect(sheets[0].textContent).toContain('.sending-status-is-sending::after');
    expect(sheets[0].textContent).toMatch(/sending-status-is-sending::after\{animation:\S+ 1500ms linear var\(--sending-status-minute,0ms\) infinite/);
    expect(sheets[0].textContent).toMatch(/sending-status-is-sending::before\{animation:\S+ 4500ms linear var\(--sending-status-hour,0ms\) infinite/);
  });

  // every clock's hands are where they would be had they gone round since the page started, so a clock
  // that comes, or one going as a layer of a change, shows them where the last one left them
  test('every clock turns in the same phase', () => {
    const phase = (host: HTMLElement, name: string, period: number) => {
      const delay = -parseFloat(host.style.getPropertyValue(name));
      // how far it is from the page's own phase, either way round the period
      const off = Math.abs(delay - performance.now() % period);
      return Math.min(off, period - off);
    };

    const clock = SendingStatusIcon('sending');
    expect(phase(clock, '--sending-status-minute', 1500)).toBeLessThan(20);
    expect(phase(clock, '--sending-status-hour', 4500)).toBeLessThan(20);

    const check = SendingStatusIcon('sent');
    expect(check.style.getPropertyValue('--sending-status-minute')).toBe('');
    setSendingStatusIconState(check, 'sending', false);
    expect(phase(check, '--sending-status-minute', 1500)).toBeLessThan(20);
    setSendingStatusIconState(check, 'read', false);
    expect(check.style.getPropertyValue('--sending-status-minute')).toBe('');
  });

  test('an element it did not make is left alone', () => {
    const span = document.createElement('span');
    expect(setSendingStatusIconState(span, 'sent')).toBe(false);
    expect(getSendingStatusIconState(span)).toBeUndefined();
    expect(span.childNodes).toHaveLength(0);
  });
});
